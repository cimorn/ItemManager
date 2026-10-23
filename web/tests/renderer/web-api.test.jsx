import { describe, expect, it, vi } from 'vitest';
import { createWebApi, parseImportDocument } from '../../src/renderer/features/web/api';

describe('browser import validation', () => {
  it('refuses encrypted desktop public projections without silently importing partial records', () => {
    expect(() => parseImportDocument({ format: 'inventory-encrypted-project', publicProject: { items: [] } })).toThrow('原密码');
  });
  it('refuses projects whose image bytes are missing', () => {
    expect(() => parseImportDocument({ meta: {}, categories: [], locations: [], items: [{ imagePath: 'images/old.png' }] })).toThrow('图片');
  });
  it('rejects an ordinary-only or locked projection as an incomplete migration source', () => {
    const value = { meta: {}, categories: [], locations: [], items: [] };
    expect(() => parseImportDocument({ ...value, scope: 'ordinary' })).toThrow('完整');
    expect(() => parseImportDocument({ ...value, privacy: { locked: true } })).toThrow('原密码');
  });
  it('accepts a complete migration package', () => {
    const project = { meta: {}, categories: [], locations: [], items: [{ imagePath: 'images/old.png' }] };
    const images = { 'images/old.png': 'data:image/png;base64,cGhvdG8=' };
    expect(parseImportDocument({ project, images })).toEqual({ project, images });
  });
});

describe('browser API capabilities', () => {
  it('does not replace a newer login CSRF token with a delayed session response', async () => {
    let restore;
    const fetchImpl = vi.fn(async (url) => {
      if (url === '/api/session') return new Promise((resolve) => { restore = () => resolve({ ok: true, json: async () => ({ authenticated: true, csrfToken: 'stale' }) }); });
      return { ok: true, json: async () => url === '/api/login' ? { authenticated: true, csrfToken: 'current' } : {} };
    });
    const api = createWebApi({ fetchImpl });
    const session = api.session();
    await api.login('password');
    restore();
    await session;
    await api.saveProject({ items: [] });
    expect(fetchImpl.mock.calls.at(-1)[1].headers['X-CSRF-Token']).toBe('current');
  });
  it('ignores unauthorized responses from a restore superseded by a new login', async () => {
    let restore;
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(async (url) => {
      if (url === '/api/session') return new Promise((resolve) => { restore = () => resolve({ ok: false, status: 401, json: async () => ({ error: '旧会话过期' }) }); });
      return { ok: true, json: async () => url === '/api/login' ? { authenticated: true, csrfToken: 'current' } : {} };
    });
    const api = createWebApi({ fetchImpl, onUnauthorized });
    const session = api.session();
    const failedSession = expect(session).rejects.toThrow('旧会话过期');
    await api.login('password');
    restore();
    await failedSession;
    await api.saveProject({ items: [] });
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls.at(-1)[1].headers['X-CSRF-Token']).toBe('current');
  });
  it('forwards image cancellation and drops privacy immediately when logout begins', async () => {
    let finish;
    const fetchImpl = vi.fn(async (url) => {
      if (url === '/api/logout') return new Promise((resolve) => { finish = () => resolve({ ok: true, json: async () => ({}) }); });
      return { ok: true, json: async () => ({ unlocked: true, privacyToken: 'test-capability' }), blob: async () => new Blob(['photo']) };
    });
    const api = createWebApi({ fetchImpl });
    await api.openPrivacy('independent');
    const controller = new AbortController();
    await api.readImage('private', { signal: controller.signal });
    expect(fetchImpl.mock.calls.at(-1)[1].signal).toBe(controller.signal);
    const logout = api.logout();
    await api.readImage('after-logout-start');
    expect(fetchImpl.mock.calls.at(-1)[1].headers['X-Storage-Privacy']).toBeUndefined();
    finish(); await logout;
  });
  it('sends session and privacy guards as headers and drops the privacy capability before closing completes', async () => {
    let finishClose;
    const fetchImpl = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => {
      if (url === '/api/session') return { authenticated: true, csrfToken: 'csrf' };
      if (url === '/api/privacy/open') return { unlocked: true, privacyToken: 'memory-only' };
      if (url === '/api/privacy/close') return new Promise((resolve) => { finishClose = resolve; });
      return {};
    }, blob: async () => new Blob(['photo']) }));
    const api = createWebApi({ fetchImpl });
    await api.session();
    await api.openPrivacy('independent-password');
    expect(fetchImpl).toHaveBeenCalledWith('/api/privacy/open', expect.objectContaining({ body: JSON.stringify({ password: 'independent-password' }) }));
    await api.readImage('opaque-id');
    expect(fetchImpl).toHaveBeenCalledWith('/api/images/opaque-id', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', headers: expect.objectContaining({ 'X-Storage-Privacy': 'memory-only' }) }));
    const closing = api.closePrivacy();
    await api.getProject();
    expect(fetchImpl.mock.calls.at(-1)[1].headers['X-Storage-Privacy']).toBeUndefined();
    finishClose({ ok: true });
    await closing;
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('silently drops any old capability after an unsuccessful password attempt', async () => {
    const fetchImpl = vi.fn(async (url, init) => responseFor(url, init));
    function responseFor(url, init) {
      const body = url === '/api/privacy/open' && JSON.parse(init.body || '{}').password === 'independent-password'
        ? { unlocked: true, privacyToken: 'memory-only' }
        : { unlocked: false };
      return { ok: true, status: 200, json: async () => body };
    }
    const api = createWebApi({ fetchImpl });
    await api.openPrivacy('independent-password');
    expect(await api.openPrivacy('wrong-password')).toEqual({ unlocked: false });
    await api.getProject();
    expect(fetchImpl.mock.calls.at(-1)[1].headers['X-Storage-Privacy']).toBeUndefined();
  });
});
