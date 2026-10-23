'use strict';
const path = require('node:path');
const express = require('express');
const { createAuth } = require('./auth');
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const JSON_LIMIT = 32 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']);
function problem(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function decodeImage(dataUrl) {
  if (typeof dataUrl !== 'string') throw problem(400, 'INVALID_IMAGE', '请选择支持的图片文件');
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match || !IMAGE_TYPES.has(match[1]) || !match[2] || match[2].length % 4 !== 0) throw problem(400, 'INVALID_IMAGE', '请选择支持的图片文件');
  if (match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw problem(413, 'IMAGE_TOO_LARGE', '图片不能超过 20MB');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) throw problem(413, 'IMAGE_TOO_LARGE', '图片不能超过 20MB');
  if (!bytes.length || bytes.toString('base64') !== match[2]) throw problem(400, 'INVALID_IMAGE', '图片数据无效');
  return { bytes, mime: match[1] };
}
function createApp({ service, config, authOptions, staticDir = path.resolve(__dirname, '../dist/renderer') }) {
  if (!service || !config) throw new Error('Storage service and configuration are required');
  const app = express(); const auth = createAuth(config, authOptions);
  app.disable('x-powered-by'); app.disable('etag'); app.set('trust proxy', false);
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store, max-age=0',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    });
    next();
  });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('Origin') !== config.publicOrigin) return next(problem(403, 'ORIGIN_REJECTED', '请求来源无效，请从网站重新操作'));
    next();
  });
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/session', (req, res) => { const session = auth.session(req); res.json(session ? { authenticated: true, csrfToken: session.csrfToken } : { authenticated: false }); });
  app.post('/api/login', express.json({ limit: 4096, strict: true }), (req, res) => {
    const result = auth.login(req, req.body?.password);
    res.set('Set-Cookie', result.cookie).json({ authenticated: true, csrfToken: result.session.csrfToken });
  });
  app.use('/api', (req, res, next) => {
    const session = auth.session(req);
    if (!session) return next(problem(401, 'AUTH_REQUIRED', '请先输入访问密码'));
    req.storageSession = session;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !auth.equal(req.get('X-CSRF-Token'), session.csrfToken)) return next(problem(403, 'CSRF_REQUIRED', '页面验证已失效，请刷新后重试'));
    const suppliedPrivacy = req.get('X-Storage-Privacy');
    req.includePrivate = suppliedPrivacy !== undefined && auth.hasPrivacy(session, suppliedPrivacy);
    const lifecycle = req.method === 'POST' && ['/logout', '/privacy/open', '/privacy/close'].includes(req.path);
    if (!lifecycle && suppliedPrivacy !== undefined && !req.includePrivate) return next(problem(403, 'PRIVACY_REQUIRED', '隐私区已关闭，请重新打开'));
    next();
  });
  app.post('/api/logout', (req, res) => { auth.revoke(req); res.set('Set-Cookie', auth.cookie('', 0)).json({ ok: true }); });
  app.post('/api/privacy/open', express.json({ limit: 32 * 1024, strict: true }), (req, res) => res.json(auth.openPrivacy(req, req.storageSession, req.body?.password)));
  app.post('/api/privacy/close', (req, res) => { auth.closePrivacy(req.storageSession); res.json({ ok: true }); });
  app.get('/api/project', async (req, res) => res.json(await service.getProject({ includePrivate: req.includePrivate })));
  app.put('/api/project', express.json({ limit: 2 * 1024 * 1024, strict: true }), async (req, res) => {
    const expectedScope = req.includePrivate ? 'all' : 'ordinary';
    if (req.body?.scope !== expectedScope) throw problem(403, 'SCOPE_MISMATCH', '请重新读取当前区域后保存');
    res.json(await service.saveProject(req.body, { includePrivate: req.includePrivate }));
  });
  app.post('/api/images', express.json({ limit: JSON_LIMIT, strict: true }), async (req, res) => res.json(await service.uploadImage(decodeImage(req.body?.dataUrl))));
  app.post('/api/images/:id/copy', async (req, res) => {
    if (!/^img_[a-f0-9-]{36}$/.test(req.params.id)) throw problem(400, 'INVALID_IMAGE', '图片标识无效');
    const result = await service.copyImage(req.params.id, { includePrivate: req.includePrivate });
    if (auth.session(req) !== req.storageSession) throw problem(401, 'AUTH_REQUIRED', '请先输入访问密码');
    if (req.includePrivate && !auth.hasPrivacy(req.storageSession, req.get('X-Storage-Privacy'))) throw problem(403, 'PRIVACY_REQUIRED', '隐私区已关闭，请重新打开');
    res.json(result);
  });
  app.get('/api/images/:id', async (req, res) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.id)) throw problem(400, 'INVALID_IMAGE', '图片标识无效');
    const image = await service.readImage(req.params.id, { includePrivate: req.includePrivate, ...(req.query.variant === 'card' ? { variant: 'card' } : {}) });
    // A download may outlive a logout, lock, or capability expiry. Recheck at
    // the last synchronous point before bytes are sent, even on warm reads.
    if (auth.session(req) !== req.storageSession) throw problem(401, 'AUTH_REQUIRED', '请先输入访问密码');
    if (req.includePrivate && !auth.hasPrivacy(req.storageSession, req.get('X-Storage-Privacy'))) throw problem(403, 'PRIVACY_REQUIRED', '隐私区已关闭，请重新打开');
    if (!IMAGE_TYPES.has(image.mime)) throw problem(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用，请稍后重试');
    res.type(image.mime).send(image.bytes);
  });
  const requirePrivacy = (req, res, next) => req.includePrivate ? next() : next(problem(403, 'PRIVACY_REQUIRED', '请先打开隐私区'));
  app.get('/api/backup', requirePrivacy, async (req, res) => {
    const backup = await service.backup();
    const images = Object.create(null);
    for (const [id, image] of Object.entries(backup.images || {})) {
      if (!IMAGE_TYPES.has(image.mime) || !Buffer.isBuffer(image.bytes)) throw problem(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用，请稍后重试');
      images[id] = `data:${image.mime};base64,${image.bytes.toString('base64')}`;
    }
    res.set('Content-Disposition', 'attachment; filename="storage-backup.json"').json({ ...backup, images });
  });
  app.post('/api/import', requirePrivacy, express.json({ limit: JSON_LIMIT, strict: true }), async (req, res) => {
    const project = req.body?.project;
    const supplied = req.body?.images || {};
    if (!project || typeof project !== 'object' || Array.isArray(project) || typeof supplied !== 'object' || Array.isArray(supplied) || Object.keys(supplied).length > 1000) throw problem(400, 'INVALID_IMPORT', '导入文件格式无效');
    if (project.scope === 'ordinary' || (project.scope !== undefined && project.scope !== 'all') || project.format || Object.hasOwn(project, 'publicProject') || project.privacy?.locked === true || (project.privacy?.enabled === true && project.privacy?.unlocked !== true)) throw problem(400, 'INVALID_IMPORT', '请先解锁并导出完整项目，不能导入普通区域或加密公开投影');
    const images = Object.create(null); let total = 0;
    for (const [key, dataUrl] of Object.entries(supplied)) {
      if (key.length > 1024) throw problem(400, 'INVALID_IMPORT', '导入文件格式无效');
      const image = decodeImage(dataUrl); total += image.bytes.length;
      if (total > MAX_IMAGE_BYTES) throw problem(413, 'IMPORT_TOO_LARGE', '导入图片总量不能超过 20MB');
      images[key] = image;
    }
    res.json(await service.importProject(project, { images, includePrivate: true }));
  });
  app.use('/api', (req, res) => res.status(404).json({ code: 'NOT_FOUND', error: '接口不存在' }));
  app.get('/', (req, res, next) => res.sendFile(path.join(staticDir, 'index.html'), { cacheControl: false, etag: false, lastModified: false }, (error) => error ? next(problem(404, 'NOT_FOUND', '页面尚未构建')) : undefined));
  app.use('/assets', express.static(path.join(staticDir, 'assets'), {
    dotfiles: 'deny', etag: false, lastModified: false, cacheControl: false, fallthrough: true, index: false, redirect: false,
    setHeaders(res, filename) {
      if (/^[^/\\]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(path.basename(filename))) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.removeHeader('Pragma');
      }
    }
  }));
  app.use((req, res) => res.status(404).json({ code: 'NOT_FOUND', error: '页面不存在' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.set({ 'Cache-Control': 'no-store, max-age=0', 'Pragma': 'no-cache' });
    if (error.type === 'entity.too.large') return res.status(413).json({ code: 'BODY_TOO_LARGE', error: '提交内容过大，请减少图片或记录后重试' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ code: 'INVALID_JSON', error: '提交内容格式无效' });
    const safe = [400, 401, 403, 404, 409, 413, 422, 429, 503].includes(error.status) && /^[A-Z][A-Z0-9_]{1,63}$/.test(error.code || '') && typeof error.message === 'string' && error.message.length <= 200;
    res.status(safe ? error.status : 503).json({ code: safe ? error.code : 'SERVICE_UNAVAILABLE', error: safe ? error.message : '服务暂时不可用，请稍后重试' });
  });
  return app;
}
module.exports = { createApp };
