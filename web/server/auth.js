'use strict';
const crypto = require('node:crypto');

const COOKIE_NAME = 'storage_session';
function problem(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function equal(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length > 4096 || right.length > 4096) return false;
  const a = crypto.createHash('sha256').update(left).digest();
  const b = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(a, b);
}
function createAuth({ password, privacyPassword, sessionSecret, publicOrigin }, options = {}) {
  if (!password || !privacyPassword || !sessionSecret || !publicOrigin) throw new Error('Authentication configuration is required');
  const now = options.now || Date.now;
  const sessionTtlMs = options.sessionTtlMs || 12 * 60 * 60 * 1000;
  const privacyTtlMs = options.privacyTtlMs || 15 * 60 * 1000;
  const loginWindowMs = options.loginWindowMs || 15 * 60 * 1000;
  const loginMaxAttempts = options.loginMaxAttempts || 5;
  const privacyWindowMs = options.privacyWindowMs || 15 * 60 * 1000;
  const privacyMaxAttempts = options.privacyMaxAttempts || 5;
  const maximumEntries = options.maximumEntries || 1000;
  const sessions = new Map();
  const failures = new Map();
  const privacyFailures = new Map();
  const passwordHash = crypto.scryptSync(password, sessionSecret, 32);
  const privacyPasswordHash = crypto.scryptSync(privacyPassword, sessionSecret, 32);
  const secure = new URL(publicOrigin).protocol === 'https:';
  const token = () => crypto.randomBytes(32).toString('base64url');
  const digest = (value) => crypto.createHmac('sha256', sessionSecret).update(value).digest('hex');
  function trim(map, expired) {
    for (const [key, value] of map) if (expired(value)) map.delete(key);
    while (map.size >= maximumEntries) map.delete(map.keys().next().value);
  }
  function cookieValue(req) {
    const value = req.headers.cookie || '';
    if (value.length > 8192) return '';
    for (const segment of value.split(';')) {
      const [name, ...rest] = segment.trim().split('=');
      if (name === COOKIE_NAME) return rest.join('=');
    }
    return '';
  }
  function cookie(value, ttl = sessionTtlMs) {
    return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(ttl / 1000))}${secure ? '; Secure' : ''}`;
  }
  function session(req) {
    const raw = cookieValue(req);
    if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
    const key = digest(raw); const value = sessions.get(key);
    if (!value) return null;
    if (value.expiresAt <= now()) { sessions.delete(key); return null; }
    return value;
  }
  function revoke(req) { const raw = cookieValue(req); if (raw) sessions.delete(digest(raw)); }
  function login(req, suppliedPassword) {
    const address = req.socket.remoteAddress || 'unknown';
    const previous = failures.get(address);
    if (previous && previous.expiresAt > now() && previous.count >= loginMaxAttempts) throw problem(429, 'RATE_LIMITED', '尝试次数过多，请稍后再试');
    const candidate = typeof suppliedPassword === 'string' && suppliedPassword.length <= 1024 ? suppliedPassword : '';
    const valid = candidate && crypto.timingSafeEqual(crypto.scryptSync(candidate, sessionSecret, 32), passwordHash);
    if (!valid) {
      trim(failures, (value) => value.expiresAt <= now());
      const entry = previous && previous.expiresAt > now() ? previous : { count: 0, expiresAt: now() + loginWindowMs };
      entry.count++; failures.set(address, entry);
      throw problem(401, 'INVALID_PASSWORD', '密码不正确');
    }
    failures.delete(address); revoke(req);
    trim(sessions, (value) => value.expiresAt <= now());
    const raw = token(); const value = { csrfToken: token(), expiresAt: now() + sessionTtlMs, privacy: null };
    sessions.set(digest(raw), value);
    return { session: value, cookie: cookie(raw) };
  }
  function openPrivacy(req, value, suppliedPassword) {
    value.privacy = null;
    const address = req.socket.remoteAddress || 'unknown';
    const time = now(); const previous = privacyFailures.get(address);
    if (previous && previous.expiresAt > time && previous.count >= privacyMaxAttempts) return { unlocked: false };
    const candidate = typeof suppliedPassword === 'string' && suppliedPassword.length <= 4096 ? suppliedPassword : '';
    const matches = crypto.timingSafeEqual(crypto.scryptSync(candidate, sessionSecret, 32), privacyPasswordHash);
    if (!candidate || !matches) {
      if (!privacyFailures.has(address)) trim(privacyFailures, (entry) => entry.expiresAt <= time);
      const entry = previous && previous.expiresAt > time ? previous : { count: 0, expiresAt: time + privacyWindowMs };
      entry.count++; privacyFailures.set(address, entry);
      return { unlocked: false };
    }
    privacyFailures.delete(address);
    const raw = token(); value.privacy = { digest: digest(raw), expiresAt: time + privacyTtlMs };
    return { unlocked: true, privacyToken: raw };
  }
  function hasPrivacy(value, supplied) { return !!(typeof supplied === 'string' && supplied.length <= 256 && value.privacy && value.privacy.expiresAt > now() && equal(digest(supplied), value.privacy.digest)); }
  return { session, login, revoke, cookie, equal, openPrivacy, hasPrivacy, closePrivacy(value) { value.privacy = null; } };
}
module.exports = { createAuth, COOKIE_NAME };
