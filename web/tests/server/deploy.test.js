// @vitest-environment node
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
let configuration = {};
try { configuration = require('../../server/config.js'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const root = path.resolve(import.meta.dirname, '../..');
const production = () => ({
  STORAGE_PASSWORD: 'fixture-password-for-tests', STORAGE_PRIVACY_PASSWORD: 'fixture-private-password', STORAGE_SESSION_SECRET: 's'.repeat(48), STORAGE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  STORAGE_PUBLIC_ORIGIN: 'https://storage.example.test', STORAGE_MONGO_USERNAME: 'storage-app', STORAGE_MONGO_PASSWORD: 'fixture-database-password',
  ALI_OSS_ACCESS_KEY_ID: 'fixture-key-id', ALI_OSS_ACCESS_KEY_SECRET: 'fixture-key-secret', ALI_OSS_BUCKET: 'mcj-file', ALI_OSS_REGION: 'cn-hongkong', ALI_OSS_ENDPOINT: 'https://oss-cn-hongkong.aliyuncs.com'
});
describe('NAS deployment configuration', () => {
  it('provides strict production configuration', () => { expect(configuration.loadConfig).toBeTypeOf('function'); });
  it('rejects missing production secrets without exposing supplied values', () => {
    for (const key of ['STORAGE_PASSWORD', 'STORAGE_PRIVACY_PASSWORD', 'STORAGE_SESSION_SECRET', 'STORAGE_ENCRYPTION_KEY', 'STORAGE_PUBLIC_ORIGIN', 'STORAGE_MONGO_PASSWORD', 'ALI_OSS_ACCESS_KEY_SECRET']) {
      const env = production(); delete env[key]; expect(() => configuration.loadConfig(env)).toThrow();
    }
    const env = { ...production(), STORAGE_ENCRYPTION_KEY: 'TOP-SECRET-bad-key' };
    try { configuration.loadConfig(env); throw new Error('accepted bad config'); } catch (error) { expect(error.message).not.toContain('TOP-SECRET'); }
  });
  it('allows a short privacy password while requiring explicit opt-in for a short website password', () => {
    const env = { ...production(), STORAGE_PASSWORD: 'abc', STORAGE_PRIVACY_PASSWORD: '1234' };
    expect(() => configuration.loadConfig(env)).toThrow('STORAGE_PASSWORD');
    expect(() => configuration.loadConfig({ ...env, STORAGE_ALLOW_SHORT_PASSWORD: 'false' })).toThrow('STORAGE_PASSWORD');
    expect(() => configuration.loadConfig({ ...env, STORAGE_ALLOW_SHORT_PASSWORD: 'TRUE' })).toThrow('STORAGE_PASSWORD');
    const config = configuration.loadConfig({ ...env, STORAGE_ALLOW_SHORT_PASSWORD: 'true' });
    expect(config.password).toBe('abc'); expect(config.privacyPassword).toBe('1234');
    for (const STORAGE_PRIVACY_PASSWORD of ['', 'replace_with_private_password']) expect(() => configuration.loadConfig({ ...production(), STORAGE_PRIVACY_PASSWORD })).toThrow('STORAGE_PRIVACY_PASSWORD');
  });
  it('provides an independent default privacy password for explicit preview', () => {
    const config = configuration.loadConfig({ STORAGE_PREVIEW: 'true' });
    expect(config.password).toBe('preview-storage'); expect(config.privacyPassword).toBe('preview-private');
    expect(configuration.loadConfig({ STORAGE_PREVIEW: 'true', STORAGE_PRIVACY_PASSWORD: '1234' }).privacyPassword).toBe('1234');
  });
  it('uses the isolated storage database and fixed OSS prefix without plaintext credentials in URLs being logged', () => {
    const env = production(); env.STORAGE_MONGO_PASSWORD = 'pass/@:';
    const config = configuration.loadConfig(env);
    expect(config.mongo).toEqual({ uri: expect.stringContaining('pass%2F%40%3A@mongodb-storage:27017/storage?authSource=storage'), database: 'storage' });
    expect(config.oss).toMatchObject({ bucket: 'mcj-file', prefix: 'Storage/', region: 'cn-hongkong' });
    expect(config.encryptionKey).toHaveLength(32); expect(config.port).toBe(3000); expect(config.host).toBe('0.0.0.0');
  });
  it('requires explicit local HTTP opt-in and rejects unsafe origin or OSS configuration', () => {
    for (const STORAGE_PUBLIC_ORIGIN of ['http://192.168.1.107:8094', 'https://user:password@storage.example', 'https://storage.example/path', 'https://storage.example/?secret=value']) expect(() => configuration.loadConfig({ ...production(), STORAGE_PUBLIC_ORIGIN })).toThrow();
    expect(configuration.loadConfig({ ...production(), STORAGE_PUBLIC_ORIGIN: 'http://192.168.1.107:8094', STORAGE_ALLOW_HTTP: 'true' }).publicOrigin).toBe('http://192.168.1.107:8094');
    expect(() => configuration.loadConfig({ ...production(), STORAGE_PUBLIC_ORIGIN: 'http://public.example', STORAGE_ALLOW_HTTP: 'true' })).toThrow();
    expect(configuration.loadConfig({ ...production(), ALI_OSS_BUCKET: 'my-inventory-photos' }).oss.bucket).toBe('my-inventory-photos');
    for (const ALI_OSS_BUCKET of ['', 'ab', 'Uppercase', '-bucket', 'bucket-', 'a'.repeat(64), 'bucket/path']) expect(() => configuration.loadConfig({ ...production(), ALI_OSS_BUCKET })).toThrow('ALI_OSS_BUCKET');
    expect(() => configuration.loadConfig({ ...production(), ALI_OSS_ENDPOINT: 'https://attacker.example' })).toThrow();
  });
  it('explicit preview never loads production Mongo, OSS, or encryption credentials', () => {
    const config = configuration.loadConfig({ ...production(), STORAGE_PREVIEW: 'true', STORAGE_PUBLIC_ORIGIN: 'http://127.0.0.1:3000' });
    expect(config.preview).toBe(true); expect(config.mongo).toBeNull(); expect(config.oss).toBeNull();
    expect(config.encryptionKey.equals(Buffer.alloc(32, 7))).toBe(false);
    expect(() => configuration.loadConfig({ STORAGE_PREVIEW: 'false' })).toThrow();
  });
  it('provides independent web development and production entry points', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.start).toBe('node server/index.js');
    expect(pkg.scripts.preview).toContain('STORAGE_PREVIEW=true');
    expect(pkg.scripts.dev).toContain('STORAGE_PUBLIC_ORIGIN=http://127.0.0.1:5173');
    expect(pkg.dependencies).not.toHaveProperty('electron');
    expect(pkg.devDependencies).not.toHaveProperty('electron');
  });
});
