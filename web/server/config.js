'use strict';
const { randomBytes } = require('node:crypto');
function invalid(name) { throw new Error(`配置不完整或不正确：${name}`); }
function required(env, name, minimum = 1) {
  const value = env[name];
  if (typeof value !== 'string' || value.length < minimum || value.length > 4096 || /^replace[_-]|^change[_-]|^your[_-]/i.test(value)) invalid(name);
  return value;
}
function isLocalHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '::1' || /^127\./.test(host) || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
}
function originValue(value, allowHttp) {
  let url; try { url = new URL(value); } catch { invalid('STORAGE_PUBLIC_ORIGIN'); }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.origin !== value || (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowHttp && isLocalHost(url.hostname)))) invalid('STORAGE_PUBLIC_ORIGIN');
  return url.origin;
}
function encryptionKey(value) {
  if (/^[a-fA-F0-9]{64}$/.test(value)) return Buffer.from(value, 'hex');
  if (/^[A-Za-z0-9+/]{43}=$/.test(value)) { const key = Buffer.from(value, 'base64'); if (key.length === 32 && key.toString('base64') === value) return key; }
  return invalid('STORAGE_ENCRYPTION_KEY');
}
function loadConfig(env = process.env) {
  const preview = env.STORAGE_PREVIEW === 'true';
  const port = Number(env.STORAGE_PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) invalid('STORAGE_PORT');
  const host = env.STORAGE_HOST || '0.0.0.0';
  if (!/^[a-zA-Z0-9:.\[\]_-]{1,253}$/.test(host)) invalid('STORAGE_HOST');
  const publicOrigin = originValue(env.STORAGE_PUBLIC_ORIGIN || (preview ? `http://127.0.0.1:${port}` : ''), preview || env.STORAGE_ALLOW_HTTP === 'true');
  const config = {
    preview, port, host, publicOrigin,
    password: preview ? (env.STORAGE_PASSWORD || 'preview-storage') : required(env, 'STORAGE_PASSWORD', env.STORAGE_ALLOW_SHORT_PASSWORD === 'true' ? 1 : 12),
    privacyPassword: preview ? (env.STORAGE_PRIVACY_PASSWORD || 'preview-private') : required(env, 'STORAGE_PRIVACY_PASSWORD'),
    sessionSecret: preview ? randomBytes(48).toString('base64url') : required(env, 'STORAGE_SESSION_SECRET', 32),
    encryptionKey: preview ? randomBytes(32) : encryptionKey(required(env, 'STORAGE_ENCRYPTION_KEY')),
    rules: { categoryNames: ['Look'], tags: (env.STORAGE_PRIVACY_TAGS || '').split(',').map(value => value.trim()).filter(Boolean) },
    mongo: null, oss: null
  };
  if (preview) return config;
  const username = required(env, 'STORAGE_MONGO_USERNAME'); const password = required(env, 'STORAGE_MONGO_PASSWORD');
  const mongoHost = env.STORAGE_MONGO_HOST || 'mongodb-storage:27017';
  if (!/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(mongoHost)) invalid('STORAGE_MONGO_HOST');
  config.mongo = { uri: `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${mongoHost}/storage?authSource=storage`, database: 'storage' };
  const endpoint = env.ALI_OSS_ENDPOINT || 'https://oss-cn-hongkong.aliyuncs.com'; let endpointUrl;
  try { endpointUrl = new URL(endpoint); } catch { invalid('ALI_OSS_ENDPOINT'); }
  if (endpointUrl.protocol !== 'https:' || !/^oss-[a-z0-9-]+\.aliyuncs\.com$/.test(endpointUrl.hostname) || endpointUrl.username || endpointUrl.password || endpointUrl.port || endpointUrl.pathname !== '/' || endpointUrl.search || endpointUrl.hash) invalid('ALI_OSS_ENDPOINT');
  const bucket = required(env, 'ALI_OSS_BUCKET');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) invalid('ALI_OSS_BUCKET');
  const region = env.ALI_OSS_REGION || 'cn-hongkong'; if (!/^[a-z0-9-]{3,64}$/.test(region)) invalid('ALI_OSS_REGION');
  config.oss = { endpoint: endpointUrl.origin, bucket, region, prefix: 'Storage/', accessKeyId: required(env, 'ALI_OSS_ACCESS_KEY_ID'), accessKeySecret: required(env, 'ALI_OSS_ACCESS_KEY_SECRET') };
  if (env.ALI_OSS_SECURITY_TOKEN) config.oss.securityToken = required(env, 'ALI_OSS_SECURITY_TOKEN');
  return config;
}
module.exports = { loadConfig };
