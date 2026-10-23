// @vitest-environment node
import { createRequire } from 'node:module';
import { afterEach, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
let bootstrap = {};
try { bootstrap = require('../../server/index.js'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const instances = [];
afterEach(async () => { for (const instance of instances.splice(0)) await instance.close(); });
it('provides an explicit bootstrap function without listening on import', () => { expect(bootstrap.startServer).toBeTypeOf('function'); });
it('starts an explicit memory preview with a working health and session API', async () => {
  const { loadConfig } = require('../../server/config');
  const config = loadConfig({ STORAGE_PREVIEW: 'true', STORAGE_PASSWORD: 'fixture-preview-password', STORAGE_PRIVACY_PASSWORD: 'fixture-private-password', STORAGE_PUBLIC_ORIGIN: 'http://127.0.0.1:3000' });
  config.port = 0; config.host = '127.0.0.1';
  const instance = await bootstrap.startServer({ config }); instances.push(instance);
  const base = `http://127.0.0.1:${instance.server.address().port}`;
  expect(await (await fetch(base + '/api/health')).json()).toEqual({ ok: true });
  expect(await (await fetch(base + '/api/session')).json()).toEqual({ authenticated: false });
  const response = await fetch(base + '/api/login', { method: 'POST', headers: { Origin: config.publicOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: config.password }) });
  expect(response.status).toBe(200); expect(response.headers.get('set-cookie')).not.toMatch(/; Secure/i);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const project = await (await fetch(base + '/api/project', { headers: { Cookie: cookie } })).json();
  expect(project).toMatchObject({ revision: 0, scope: 'ordinary', paths: { projectDir: 'nas' }, items: [] });
});
