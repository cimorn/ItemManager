const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const os = require('node:os');

const { saveProjectImageData } = require('../project/project-image-service');
const { renderMobileCapturePage } = require('./mobile-capture-page');

const ALLOWED_IMAGE_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);
const VIRTUAL_INTERFACE_PATTERN = /loopback|virtual|vmware|vbox|hyper-v|vethernet|wsl|tailscale|zerotier/i;

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isPrivateIpv4(address) {
  if (/^10\./.test(address) || /^192\.168\./.test(address)) {
    return true;
  }

  const match = address.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function getLanAddress(networkInterfaces = os.networkInterfaces()) {
  const candidates = Object.entries(networkInterfaces).flatMap(([name, entries]) =>
    (entries || [])
      .filter(
        (entry) =>
          (entry.family === 'IPv4' || entry.family === 4) &&
          !entry.internal &&
          isPrivateIpv4(entry.address)
      )
      .map((entry) => ({ name, address: entry.address }))
  );

  candidates.sort((left, right) => {
    const score = (candidate) => {
      let value = 0;
      if (isPrivateIpv4(candidate.address)) value += 4;
      if (/wi-?fi|wlan|无线|ethernet|以太网/i.test(candidate.name)) value += 2;
      if (VIRTUAL_INTERFACE_PATTERN.test(candidate.name)) value -= 8;
      return value;
    };
    return score(right) - score(left);
  });

  if (!candidates.length) {
    throw new Error('没有找到可用的局域网地址，请检查电脑网络连接');
  }

  return candidates[0].address;
}

function readJsonBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    request.on('data', (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        settled = true;
        reject(createHttpError(413, '照片过大，请重新拍摄'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(createHttpError(400, '照片数据格式无效'));
      }
    });
    request.on('error', reject);
  });
}

function parseImageDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match || !ALLOWED_IMAGE_TYPES.has(match[1].toLowerCase()) || match[2].length % 4 !== 0) {
    throw createHttpError(400, '只支持 WebP、JPG 或 PNG 照片');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    throw createHttpError(400, '照片内容为空');
  }

  return {
    dataUrl: String(dataUrl),
    mimeType: match[1].toLowerCase(),
    size: buffer.length
  };
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(body));
}

class PhotoCaptureService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.hostAddress = options.hostAddress || '';
    this.sessionTtlMs = options.sessionTtlMs || 10 * 60 * 1000;
    this.maxRequestBytes = options.maxRequestBytes || 12 * 1024 * 1024;
    this.now = options.now || (() => Date.now());
    this.sessions = new Map();
    this.server = null;
    this.port = null;
    this.boundAddress = '';
  }

  async ensureServer(listenHost) {
    if (this.server?.listening) {
      return;
    }

    this.server = http.createServer((request, response) => {
      this.handleRequest(request, response).catch((error) => {
        if (!response.headersSent) {
          sendJson(response, error.statusCode || 500, { error: error.message || '拍照服务异常' });
        } else {
          response.end();
        }
      });
    });

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, listenHost, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    this.port = this.server.address().port;
    this.boundAddress = listenHost;
  }

  getActiveSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    if (session.expiresAt <= this.now()) {
      void this.discardSession(sessionId);
      return null;
    }

    return session;
  }

  async createSession() {
    const advertisedAddress = this.hostAddress || getLanAddress();
    await this.ensureServer(advertisedAddress);
    const id = crypto.randomBytes(32).toString('hex');
    const expiresAt = this.now() + this.sessionTtlMs;
    const timer = setTimeout(() => {
      void this.discardSession(id);
    }, this.sessionTtlMs);
    timer.unref?.();

    this.sessions.set(id, {
      id,
      expiresAt,
      photo: null,
      timer
    });

    return {
      id,
      url: `http://${advertisedAddress}:${this.port}/capture/${id}`,
      expiresAt: new Date(expiresAt).toISOString()
    };
  }

  async handleRequest(request, response) {
    const url = new URL(request.url || '/', 'http://localhost');
    const captureMatch = url.pathname.match(/^\/capture\/([a-f0-9]{64})$/i);
    const uploadMatch = url.pathname.match(/^\/api\/photo-capture\/([a-f0-9]{64})$/i);

    if (request.method === 'GET' && captureMatch) {
      const session = this.getActiveSession(captureMatch[1]);
      if (!session) {
        throw createHttpError(410, '拍照二维码已过期，请在电脑上重新生成');
      }

      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; img-src data: blob:; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
        'Content-Type': 'text/html; charset=utf-8'
      });
      response.end(renderMobileCapturePage(session.id));
      return;
    }

    if (request.method === 'POST' && uploadMatch) {
      const session = this.getActiveSession(uploadMatch[1]);
      if (!session) {
        throw createHttpError(410, '拍照二维码已过期，请在电脑上重新生成');
      }
      if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        throw createHttpError(415, '照片请求格式无效');
      }

      const body = await readJsonBody(request, this.maxRequestBytes);
      const photo = parseImageDataUrl(body.dataUrl);
      const activeSession = this.getActiveSession(uploadMatch[1]);
      if (!activeSession || activeSession !== session) {
        throw createHttpError(410, '拍照二维码已过期，请在电脑上重新生成');
      }
      activeSession.photo = photo;
      this.emit('photo-received', {
        sessionId: session.id,
        ...photo
      });
      sendJson(response, 200, { ok: true, size: photo.size });
      return;
    }

    throw createHttpError(404, '拍照页面不存在');
  }

  async commitSession({ sessionId, projectDir, categoryPath }) {
    const session = this.getActiveSession(sessionId);
    if (!session) {
      throw new Error('拍照会话已失效，请重新生成二维码');
    }
    if (!session.photo) {
      throw new Error('还没有收到手机照片');
    }

    const result = await saveProjectImageData({
      projectDir,
      categoryPath,
      dataUrl: session.photo.dataUrl
    });
    await this.discardSession(sessionId);
    return result;
  }

  async discardSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    clearTimeout(session.timer);
    this.sessions.delete(sessionId);
    if (!this.sessions.size) {
      await this.stopServer();
    }
    return true;
  }

  async stopServer() {
    const activeServer = this.server;
    this.server = null;
    this.port = null;
    this.boundAddress = '';
    if (!activeServer?.listening) {
      return;
    }

    await new Promise((resolve) => activeServer.close(resolve));
  }

  async close() {
    for (const session of this.sessions.values()) {
      clearTimeout(session.timer);
    }
    this.sessions.clear();
    await this.stopServer();
  }
}

function createPhotoCaptureService(options) {
  return new PhotoCaptureService(options);
}

module.exports = {
  createPhotoCaptureService,
  getLanAddress
};
