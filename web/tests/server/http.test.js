// @vitest-environment node
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
let adapter = {};
try { adapter = require('../../server/app.js'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const cleanup = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
const origin = 'https://storage.example.test';
const privacyPassword = 'fixture-private-password';
function fixtureService() {
  let revision = 0;
  return {
    async getProject({ includePrivate }) { return { revision, scope: includePrivate ? 'all' : 'ordinary', items: [{ id: 'ordinary' }, ...(includePrivate ? [{ id: 'private' }] : [])] }; },
    async saveProject(project, { includePrivate }) { if (project.revision !== revision) throw Object.assign(new Error('数据已更新，请重新读取'), { status: 409, code: 'REVISION_CONFLICT' }); revision++; return { ...project, revision, scope: includePrivate ? 'all' : 'ordinary' }; },
    async uploadImage({ bytes, mime }) { if (!bytes.length || mime !== 'image/png') throw Object.assign(new Error('图片无效'), { status: 400, code: 'INVALID_IMAGE' }); return { imageId: 'ordinary-image' }; },
    async readImage(id, { includePrivate }) { if (id === 'private-image' && !includePrivate) throw Object.assign(new Error('图片不可用'), { status: 404, code: 'IMAGE_NOT_FOUND' }); return { bytes: Buffer.from([137, 80, 78, 71]), mime: 'image/png' }; },
    async backup() { return { format: 'nas-storage-backup', version: 1, project: { items: ['ordinary', 'private'] }, images: { 'ordinary-image': { bytes: Buffer.from([137, 80, 78, 71]), mime: 'image/png' } } }; },
    async importProject(project) { return { ...project, scope: 'all' }; }
  };
}
async function start(options = {}) {
  const config = { password: 'correct horse battery staple', privacyPassword, sessionSecret: 's'.repeat(48), publicOrigin: origin, ...options.config };
  const app = adapter.createApp({ service: options.service || fixtureService(), config, staticDir: options.staticDir, authOptions: options.authOptions });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  cleanup.push(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, init = {}) => fetch(base + url, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  const login = async () => {
    const response = await request('/api/login', { method: 'POST', headers: { Origin: config.publicOrigin }, body: JSON.stringify({ password: config.password }) });
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const body = await response.json();
    return { cookie, csrfToken: body.csrfToken, rawCookie: response.headers.get('set-cookie') };
  };
  return { request, login };
}
function mutation(session, body, extra = {}) {
  return { method: 'POST', headers: { Cookie: session.cookie, Origin: origin, 'X-CSRF-Token': session.csrfToken, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
}
describe('NAS HTTP adapter', () => {
  it('caches only content-hashed public JS and CSS while HTML, API, images and errors remain no-store', async () => {
    const dist = await mkdtemp(path.join(tmpdir(), 'storage-cache-')); cleanup.push(() => rm(dist, { recursive: true, force: true }));
    await mkdir(path.join(dist, 'assets'));
    await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>Storage</title>');
    for (const name of ['index-Ab12_cd3.js', 'index-A1b2c3d4.css', 'app.js', 'photo-Ab12_cd3.png']) await writeFile(path.join(dist, 'assets', name), 'public build file');
    const { request, login } = await start({ staticDir: dist }); const session = await login();
    for (const name of ['index-Ab12_cd3.js', 'index-A1b2c3d4.css']) {
      const response = await request(`/assets/${name}`);
      expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(response.headers.has('pragma')).toBe(false);
    }
    for (const route of ['/', '/assets/app.js', '/assets/photo-Ab12_cd3.png', '/assets/missing-Ab12_cd3.js', '/api/session', '/api/images/ordinary-image', '/api/images/private-image', '/api/unknown']) {
      expect((await request(route, { headers: { Cookie: session.cookie } })).headers.get('cache-control')).toContain('no-store');
    }
    const invalidRange = await request('/assets/index-Ab12_cd3.js', { headers: { Range: 'bytes=999999-' } });
    expect(invalidRange.status).toBeGreaterThanOrEqual(400);
    expect(invalidRange.headers.get('cache-control')).toContain('no-store');
  });
  it.each(['privacy-close', 'logout', 'privacy-expiry', 'session-expiry'].flatMap((change) => [false, true].flatMap((warm) => ['', '?variant=card'].map(query => ({ change, warm, query })))) )('rechecks access before returning delayed image bytes: %j', async ({ change, warm, query }) => {
    let time = 1000; let release; let started;
    const pending = new Promise((done) => { started = done; });
    const { createInventoryService } = require('../../server/inventory-service');
    const { createMemoryRepository } = require('../../server/repository');
    const { createMemoryObjectStore } = require('../../server/oss-store');
    const objects = createMemoryObjectStore();
    const service = createInventoryService({ repository: createMemoryRepository(), objects, encryptionKey: randomBytes(32) });
    cleanup.push(() => service.close());
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=', 'base64');
    await service.importProject({ meta: {}, categories: [], locations: [], items: [{ id: 'hidden', name: '隐藏照片', tags: [], isPrivate: true, imagePath: 'source' }] }, { includePrivate: true, images: { source: { bytes: png, mime: 'image/png' } } });
    const imageId = (await service.getProject({ includePrivate: true })).items[0].imagePath;
    if (warm) await service.readImage(imageId, { includePrivate: true, ...(query ? { variant: 'card' } : {}) });
    const get = objects.get; let downloads = 0;
    objects.get = async (key) => { downloads++; return get(key); };
    const read = service.readImage;
    service.readImage = async (...args) => { const result = await read(...args); started(); await new Promise((done) => { release = done; }); return result; };
    const { request, login } = await start({ service, authOptions: { now: () => time, privacyTtlMs: 100, sessionTtlMs: 1000 } });
    const session = await login();
    const { privacyToken } = await (await request('/api/privacy/open', mutation(session, { password: privacyPassword }))).json();
    const reading = request(`/api/images/${imageId}${query}`, { headers: { Cookie: session.cookie, 'X-Storage-Privacy': privacyToken } });
    await pending;
    if (change === 'privacy-close') await request('/api/privacy/close', mutation(session));
    else if (change === 'logout') await request('/api/logout', mutation(session));
    else time += change === 'privacy-expiry' ? 101 : 1001;
    release(); const response = await reading;
    expect(response.status).toBe(change === 'logout' || change === 'session-expiry' ? 401 : 403);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(Buffer.from(await response.arrayBuffer()).equals(png)).toBe(false);
    expect(downloads).toBe(warm ? 0 : 1);
  });
  it('provides an Express application factory for the authenticated storage API', () => { expect(adapter.createApp).toBeTypeOf('function'); });
  it('reveals only health and authentication state before login', async () => {
    const { request } = await start();
    expect(await (await request('/api/session')).json()).toEqual({ authenticated: false });
    expect(await (await request('/api/health')).json()).toEqual({ ok: true });
    for (const route of ['/api/project', '/api/images/ordinary-image', '/api/backup']) {
      const response = await request(route); expect(response.status).toBe(401); expect(await response.json()).toEqual({ code: 'AUTH_REQUIRED', error: expect.any(String) });
    }
  });
  it('issues strict HttpOnly secure cookies and does not accept wrong passwords', async () => {
    const { request, login } = await start();
    const wrong = await request('/api/login', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ password: 'wrong' }) });
    expect(wrong.status).toBe(401); expect(wrong.headers.get('set-cookie')).toBeNull();
    const session = await login();
    expect(session.rawCookie).toMatch(/HttpOnly/i); expect(session.rawCookie).toMatch(/SameSite=Strict/i); expect(session.rawCookie).toMatch(/Secure/i);
    const state = await (await request('/api/session', { headers: { Cookie: session.cookie } })).json();
    expect(state).toEqual({ authenticated: true, csrfToken: session.csrfToken });
    const response = await request('/api/project', { headers: { Cookie: session.cookie } });
    expect(await response.json()).toMatchObject({ scope: 'ordinary', items: [{ id: 'ordinary' }] });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('rejects missing or foreign Origin and missing CSRF on mutations', async () => {
    const { request, login } = await start();
    expect((await request('/api/privacy/open', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ password: privacyPassword }) })).status).toBe(401);
    for (const headers of [{}, { Origin: 'https://evil.example' }, { Origin: 'null' }]) {
      expect((await request('/api/login', { method: 'POST', headers, body: JSON.stringify({ password: 'correct horse battery staple' }) })).status).toBe(403);
    }
    const session = await login();
    for (const headers of [{ Cookie: session.cookie, Origin: origin }, { Cookie: session.cookie, Origin: 'https://evil.example', 'X-CSRF-Token': session.csrfToken }]) {
      expect((await request('/api/privacy/open', { method: 'POST', headers })).status).toBe(403);
    }
  });
  it('requires a current session-bound privacy capability for full data and backup', async () => {
    const { request, login } = await start(); const first = await login(); const second = await login();
    const privacy = await (await request('/api/privacy/open', mutation(first, { password: privacyPassword }))).json();
    expect(privacy.unlocked).toBe(true);
    expect(privacy.privacyToken).toBeTypeOf('string');
    const fullHeaders = { Cookie: first.cookie, 'X-Storage-Privacy': privacy.privacyToken };
    expect(await (await request('/api/project', { headers: fullHeaders })).json()).toMatchObject({ scope: 'all', items: [{ id: 'ordinary' }, { id: 'private' }] });
    const backup = await request('/api/backup', { headers: fullHeaders });
    expect(backup.status).toBe(200); expect((await backup.json()).images).toEqual({ 'ordinary-image': 'data:image/png;base64,iVBORw==' });
    expect((await request('/api/backup', { headers: { Cookie: first.cookie } })).status).toBe(403);
    expect((await request('/api/project', { headers: { Cookie: second.cookie, 'X-Storage-Privacy': privacy.privacyToken } })).status).toBe(403);
    expect((await request('/api/privacy/close', mutation(first))).status).toBe(200);
    expect((await request('/api/project', { headers: fullHeaders })).status).toBe(403);
    expect((await request('/api/project', { headers: { Cookie: first.cookie, 'X-Storage-Privacy': 'invalid' } })).status).toBe(403);
  });
  it('silently rejects absent, invalid, or website passwords and revokes prior privacy access', async () => {
    const { request, login } = await start({ authOptions: { privacyMaxAttempts: 20 } }); const session = await login();
    for (const body of [undefined, {}, { password: null }, { password: 1234 }, { password: 'wrong' }, { password: 'correct horse battery staple' }, { password: 'x'.repeat(4097) }]) {
      const response = await request('/api/privacy/open', mutation(session, body));
      expect(response.status).toBe(200); expect(await response.json()).toEqual({ unlocked: false });
    }
    const opened = await request('/api/privacy/open', mutation(session, { password: privacyPassword }));
    expect(opened.status).toBe(200); const capability = await opened.json();
    expect(capability).toEqual({ unlocked: true, privacyToken: expect.any(String) });
    const rejected = await request('/api/privacy/open', mutation(session, { password: 'wrong' }));
    expect(rejected.status).toBe(200); expect(await rejected.json()).toEqual({ unlocked: false });
    expect((await request('/api/project', { headers: { Cookie: session.cookie, 'X-Storage-Privacy': capability.privacyToken } })).status).toBe(403);
    expect(await (await request('/api/project', { headers: { Cookie: session.cookie } })).json()).toMatchObject({ scope: 'ordinary' });
  });
  it('silently throttles privacy attempts per address across sessions and recovers after the window', async () => {
    let time = 1000;
    const { request, login } = await start({ authOptions: { now: () => time, privacyMaxAttempts: 2, privacyWindowMs: 100 } });
    const first = await login(); const second = await login();
    const capability = await (await request('/api/privacy/open', mutation(second, { password: privacyPassword }))).json();
    for (const session of [first, first]) {
      const response = await request('/api/privacy/open', mutation(session, { password: 'wrong' }));
      expect(response.status).toBe(200); expect(await response.json()).toEqual({ unlocked: false });
    }
    const throttled = await request('/api/privacy/open', mutation(second, { password: privacyPassword }, { 'X-Forwarded-For': '192.0.2.7' }));
    expect(throttled.status).toBe(200); expect(await throttled.json()).toEqual({ unlocked: false });
    expect((await request('/api/project', { headers: { Cookie: second.cookie, 'X-Storage-Privacy': capability.privacyToken } })).status).toBe(403);
    time += 101;
    const reopened = await request('/api/privacy/open', mutation(second, { password: privacyPassword }));
    expect(reopened.status).toBe(200); expect(await reopened.json()).toEqual({ unlocked: true, privacyToken: expect.any(String) });
  });
  it('bounds tracked privacy failure addresses and expires their attempts', () => {
    const { createAuth } = require('../../server/auth.js'); let time = 1000;
    const auth = createAuth({ password: 'website-password', privacyPassword, sessionSecret: 's'.repeat(48), publicOrigin: origin }, { now: () => time, maximumEntries: 2, privacyMaxAttempts: 1, privacyWindowMs: 100 });
    const value = { privacy: null }; const req = (remoteAddress) => ({ socket: { remoteAddress } });
    expect(auth.openPrivacy(req('address-a'), value, 'wrong')).toEqual({ unlocked: false });
    expect(auth.openPrivacy(req('address-b'), value, 'wrong')).toEqual({ unlocked: false });
    expect(auth.openPrivacy(req('address-c'), value, 'wrong')).toEqual({ unlocked: false });
    expect(auth.openPrivacy(req('address-a'), value, privacyPassword)).toEqual({ unlocked: true, privacyToken: expect.any(String) });
    expect(auth.openPrivacy(req('address-c'), value, privacyPassword)).toEqual({ unlocked: false });
    time += 101;
    expect(auth.openPrivacy(req('address-c'), value, privacyPassword)).toEqual({ unlocked: true, privacyToken: expect.any(String) });
  });
  it('expires sessions and privacy capabilities and revokes logout sessions', async () => {
    let time = 10000;
    const { request, login } = await start({ authOptions: { now: () => time, sessionTtlMs: 1000, privacyTtlMs: 100 } });
    const session = await login(); const { privacyToken } = await (await request('/api/privacy/open', mutation(session, { password: privacyPassword }))).json();
    time += 101;
    expect((await request('/api/project', { headers: { Cookie: session.cookie, 'X-Storage-Privacy': privacyToken } })).status).toBe(403);
    expect((await request('/api/logout', mutation(session))).status).toBe(200);
    expect((await request('/api/project', { headers: { Cookie: session.cookie } })).status).toBe(401);
    const next = await login(); time += 1001;
    expect((await request('/api/project', { headers: { Cookie: next.cookie } })).status).toBe(401);
  });
  it('allows authenticated privacy lifecycle and logout after its capability expires', async () => {
    let time = 1000;
    const { request, login } = await start({ authOptions: { now: () => time, sessionTtlMs: 10000, privacyTtlMs: 100 } });
    const session = await login(); const first = await (await request('/api/privacy/open', mutation(session, { password: privacyPassword }))).json(); time += 101;
    const stale = { 'X-Storage-Privacy': first.privacyToken };
    expect((await request('/api/project', { headers: { Cookie: session.cookie, ...stale } })).status).toBe(403);
    expect((await request('/api/privacy/close', mutation(session, undefined, stale))).status).toBe(200);
    const reopened = await request('/api/privacy/open', mutation(session, { password: privacyPassword }, stale));
    expect(reopened.status).toBe(200); expect((await reopened.json()).privacyToken).not.toBe(first.privacyToken);
    expect((await request('/api/logout', mutation(session, undefined, stale))).status).toBe(200);
    expect((await request('/api/project', { headers: { Cookie: session.cookie } })).status).toBe(401);
  });
  it('enforces project scope permission, CSRF, and revision conflicts', async () => {
    const { request, login } = await start(); const session = await login();
    const save = (project, headers = {}) => request('/api/project', { ...mutation(session, project, headers), method: 'PUT' });
    expect((await save({ scope: 'all', revision: 0, items: [] })).status).toBe(403);
    expect((await save({ scope: 'ordinary', revision: 0, items: [] })).status).toBe(200);
    const stale = await save({ scope: 'ordinary', revision: 0, items: [] }); expect(stale.status).toBe(409); expect((await stale.json()).code).toBe('REVISION_CONFLICT');
    const { privacyToken } = await (await request('/api/privacy/open', mutation(session, { password: privacyPassword }))).json();
    expect((await save({ scope: 'ordinary', revision: 1, items: [] }, { 'X-Storage-Privacy': privacyToken })).status).toBe(403);
  });
  it('authenticates image bytes, bounds uploads, and protects import', async () => {
    const { request, login } = await start(); const session = await login();
    const image = await request('/api/images/ordinary-image', { headers: { Cookie: session.cookie } });
    expect(image.status).toBe(200); expect(image.headers.get('content-type')).toContain('image/png'); expect(image.headers.get('cache-control')).toContain('no-store');
    expect((await request('/api/images/private-image', { headers: { Cookie: session.cookie } })).status).toBe(404);
    expect((await request('/api/images', mutation(session, { dataUrl: 'data:image/png;base64,iVBORw==' }))).status).toBe(200);
    expect((await request('/api/images', mutation(session, { dataUrl: 'https://example.com/image.png' }))).status).toBe(400);
    expect((await request('/api/images', mutation(session, { dataUrl: `data:image/png;base64,${Buffer.alloc(20 * 1024 * 1024 + 1).toString('base64')}` }))).status).toBe(413);
    expect((await request('/api/import', mutation(session, { project: {} }))).status).toBe(403);
    const { privacyToken } = await (await request('/api/privacy/open', mutation(session, { password: privacyPassword }))).json();
    expect((await request('/api/import', mutation(session, { project: { items: [] }, images: { old: 'data:image/png;base64,iVBORw==' } }, { 'X-Storage-Privacy': privacyToken }))).status).toBe(200);
  });
  it('refuses partial public projections and locked encrypted envelopes during import', async () => {
    const { request, login } = await start(); const session = await login();
    const { privacyToken } = await (await request('/api/privacy/open', mutation(session, { password: privacyPassword }))).json();
    const candidates = [
      { scope: 'ordinary', items: [] },
      { format: 'item-manager-private-project', publicProject: { items: [] } },
      { publicProject: { items: [] }, items: [] },
      { privacy: { enabled: true, locked: true }, items: [] },
      { privacy: { enabled: true, unlocked: false }, items: [] }
    ];
    for (const project of candidates) {
      const response = await request('/api/import', mutation(session, { project, images: {} }, { 'X-Storage-Privacy': privacyToken }));
      expect(response.status).toBe(400); expect((await response.json()).code).toBe('INVALID_IMPORT');
    }
  });
  it('rate limits failed logins and recovers after its bounded window', async () => {
    let time = 1000; const { request, login } = await start({ authOptions: { now: () => time, loginMaxAttempts: 2, loginWindowMs: 100 } });
    const wrong = () => request('/api/login', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ password: 'wrong' }) });
    expect((await wrong()).status).toBe(401); expect((await wrong()).status).toBe(401); expect((await wrong()).status).toBe(429);
    time += 101; await login();
  });
  it('serves only compiled public frontend files and never project data paths', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'storage-http-')); cleanup.push(() => rm(directory, { recursive: true, force: true }));
    const dist = path.join(directory, 'dist'); await mkdir(path.join(dist, 'assets'), { recursive: true });
    await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>Storage</title>'); await writeFile(path.join(dist, 'assets', 'app.js'), 'console.log("app")');
    await writeFile(path.join(directory, '.env'), 'secret-password');
    const { request } = await start({ staticDir: dist });
    const frontend = await request('/'); expect(frontend.status).toBe(200); expect(frontend.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect((await request('/assets/app.js')).status).toBe(200);
    expect((await request('/api/unknown')).status).toBe(401);
    for (const url of ['/data/project.json', '/.env', '/server/config.js', '/assets/secret.png']) expect((await request(url)).status).toBe(404);
  });
  it('binds CSRF tokens to their session and rejects tampered session cookies', async () => {
    const { request, login } = await start(); const first = await login(); const second = await login();
    expect((await request('/api/privacy/open', mutation(first, undefined, { 'X-CSRF-Token': second.csrfToken }))).status).toBe(403);
    expect((await request('/api/project', { headers: { Cookie: first.cookie + 'tampered' } })).status).toBe(401);
  });
  it('bounds active sessions and treats malformed JSON as a safe client error', async () => {
    const { request, login } = await start({ authOptions: { maximumEntries: 2 } });
    const first = await login(); await login(); const last = await login();
    expect((await request('/api/project', { headers: { Cookie: first.cookie } })).status).toBe(401);
    expect((await request('/api/project', { headers: { Cookie: last.cookie } })).status).toBe(200);
    const response = await request('/api/images', { ...mutation(last), body: '{not json' });
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ code: 'INVALID_JSON', error: expect.any(String) });
  });
  it('returns safe errors without internal secrets or stack traces', async () => {
    const service = fixtureService(); service.getProject = async () => { throw new Error('mongodb://secret-user:secret-password@db'); };
    const { request, login } = await start({ service }); const session = await login();
    const response = await request('/api/project', { headers: { Cookie: session.cookie } });
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'SERVICE_UNAVAILABLE', error: '服务暂时不可用，请稍后重试' });
  });
});
