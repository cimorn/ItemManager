// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { SITE_URL, APP_ID, isSiteUrl, getDataDirectory, protectWebContents, WEB_PREFERENCES } = require('../src/policy.cjs');
const { startClient } = require('../src/client.cjs');

function fakeElectron({ navigationError } = {}) {
  const app = Object.assign(new EventEmitter(), {
    setPath: vi.fn(), setAppUserModelId: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true), whenReady: vi.fn(async () => {}), quit: vi.fn()
  });
  const ses = { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() };
  const windows = [];
  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.destroyed = false;
      this.webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn() });
      this.loadFile = vi.fn(async () => {});
      this.loadURL = vi.fn(async () => { if (navigationError) throw navigationError; });
      this.isDestroyed = () => this.destroyed;
      this.isMinimized = () => true;
      this.restore = vi.fn(); this.show = vi.fn(); this.focus = vi.fn();
      windows.push(this);
    }
  }
  return {
    app, BrowserWindow, windows, ses,
    session: { fromPartition: vi.fn(() => ses) },
    Menu: { buildFromTemplate: vi.fn(x => x), setApplicationMenu: vi.fn() },
    dialog: { showErrorBox: vi.fn() }, shell: { openExternal: vi.fn() }
  };
}

describe('desktop boundary', () => {
  it('preserves the deployed URL, application identity and memory partition', () => {
    expect(SITE_URL).toBe('https://storage.mcj.life/');
    expect(APP_ID).toBe('life.mcj.storage.nasclient');
    expect(WEB_PREFERENCES.partition).toBe('storage-nas-memory');
    expect(Object.isFrozen(WEB_PREFERENCES)).toBe(true);
  });
  it('accepts only the exact HTTPS origin', () => {
    expect(isSiteUrl(SITE_URL)).toBe(true);
    expect(isSiteUrl('https://storage.mcj.life/items?a=1#x')).toBe(true);
    for (const url of ['http://storage.mcj.life/', 'https://storage.mcj.life.evil.test/', 'https://storage.mcj.life:444/', 'https://evil.test@storage.mcj.life/', 'file:///C:/secret', 'javascript:alert(1)', 'data:text/html,x', 'invalid']) {
      expect(isSiteUrl(url), url).toBe(false);
    }
  });
  it('keeps portable data beside the real exe, outside extraction and legacy data', () => {
    expect(getDataDirectory({ portableDir: 'C:\\库存', execPath: 'C:\\Temp\\extract\\app.exe', pathApi: path.win32 }))
      .toBe('C:\\库存\\data\\nas-client');
    expect(getDataDirectory({ execPath: 'C:\\库存\\app.exe', pathApi: path.win32 }))
      .toBe('C:\\库存\\data\\nas-client');
  });
  it('isolates remote content without a privileged preload or disk session', () => {
    expect(WEB_PREFERENCES).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false, allowRunningInsecureContent: false, devTools: false });
    expect(WEB_PREFERENCES).not.toHaveProperty('preload');
    expect(WEB_PREFERENCES.partition).not.toMatch(/^persist:/);
  });
  it('blocks navigation escapes, redirects, embedded webviews and popups', () => {
    const wc = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn() });
    protectWebContents(wc);
    for (const eventName of ['will-navigate', 'will-redirect']) {
      const allowed = { preventDefault: vi.fn() };
      wc.emit(eventName, allowed, SITE_URL);
      expect(allowed.preventDefault).not.toHaveBeenCalled();
      const blocked = { preventDefault: vi.fn() };
      wc.emit(eventName, blocked, 'file:///C:/secret');
      expect(blocked.preventDefault).toHaveBeenCalledOnce();
    }
    const embedded = { preventDefault: vi.fn() };
    wc.emit('will-attach-webview', embedded);
    expect(embedded.preventDefault).toHaveBeenCalledOnce();
    expect(wc.setWindowOpenHandler.mock.calls[0][0]({ url: SITE_URL })).toEqual({ action: 'deny' });
  });
});

describe('desktop startup', () => {
  it('shows local startup before connecting, denies permissions and focuses repeat launches', async () => {
    const electron = fakeElectron();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-test-'));
    try {
      await startClient(electron, { portableDir: tempDir });
      const win = electron.windows[0];
      expect(electron.app.setPath).toHaveBeenCalledWith('userData', path.join(tempDir, 'data', 'nas-client'));
      expect(electron.app.setPath.mock.invocationCallOrder[0]).toBeLessThan(electron.app.requestSingleInstanceLock.mock.invocationCallOrder[0]);
      expect(win.loadFile.mock.calls[0][0]).toMatch(/connecting\.html$/);
      expect(win.show.mock.invocationCallOrder[0]).toBeLessThan(win.loadURL.mock.invocationCallOrder[0]);
      expect(win.loadURL).toHaveBeenCalledWith(SITE_URL);
      expect(electron.app.setAppUserModelId).toHaveBeenCalledWith(APP_ID);
      expect(electron.session.fromPartition).toHaveBeenCalledWith(WEB_PREFERENCES.partition, { cache: true });
      expect(win.options.icon).toBe(path.resolve(import.meta.dirname, '../assets/app-icon.png'));
      expect(fs.existsSync(win.options.icon)).toBe(true);
      const cb = vi.fn();
      electron.ses.setPermissionRequestHandler.mock.calls[0][0](null, 'media', cb);
      expect(cb).toHaveBeenCalledWith(false);
      expect(electron.ses.setPermissionCheckHandler.mock.calls[0][0]()).toBe(false);
      electron.app.emit('second-instance');
      expect(win.restore).toHaveBeenCalled();
      expect(win.focus).toHaveBeenCalled();
      expect(electron.windows).toHaveLength(1);
      win.emit('closed'); electron.app.emit('window-all-closed');
      expect(electron.app.quit).toHaveBeenCalled();
    } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
  });
  it('shows a useful error page on failed main navigation and retries only the site', async () => {
    const electron = fakeElectron();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-test-'));
    try {
      await startClient(electron, { portableDir: tempDir });
      const win = electron.windows[0];
      win.webContents.emit('did-fail-load', {}, -105, 'NAME_NOT_RESOLVED', SITE_URL, true);
      await Promise.resolve();
      expect(win.loadFile.mock.calls.at(-1)[0]).toMatch(/unavailable\.html$/);
      const event = { preventDefault: vi.fn() };
      win.webContents.emit('will-navigate', event, SITE_URL);
      await Promise.resolve();
      expect(win.loadURL).toHaveBeenCalledTimes(2);
    } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
  });
  it('does not create a second window when another instance owns the lock', async () => {
    const electron = fakeElectron(); electron.app.requestSingleInstanceLock.mockReturnValue(false);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-test-'));
    try {
      await startClient(electron, { portableDir: tempDir });
      expect(electron.app.quit).toHaveBeenCalled();
      expect(electron.windows).toHaveLength(0);
    } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
  });
  it('handles a rejected site load while ignoring canceled navigation', async () => {
    for (const code of ['ERR_NAME_NOT_RESOLVED', 'ERR_ABORTED']) {
      const electron = fakeElectron({ navigationError: Object.assign(new Error(code), { code }) });
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-test-'));
      try {
        await startClient(electron, { portableDir: tempDir });
        const localLoads = electron.windows[0].loadFile.mock.calls;
        expect(localLoads).toHaveLength(code === 'ERR_ABORTED' ? 1 : 2);
        if (code !== 'ERR_ABORTED') expect(localLoads.at(-1)[0]).toMatch(/unavailable\.html$/);
      } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
    }
  });
  it('ignores unrelated load failures and shows only one page for a renderer crash', async () => {
    const electron = fakeElectron();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-test-'));
    try {
      await startClient(electron, { portableDir: tempDir });
      const win = electron.windows[0];
      win.webContents.emit('did-fail-load', {}, -105, 'SUBFRAME', SITE_URL, false);
      win.webContents.emit('did-fail-load', {}, -3, 'ABORTED', SITE_URL, true);
      win.webContents.emit('did-fail-load', {}, -105, 'FOREIGN', 'https://example.com/', true);
      expect(win.loadFile).toHaveBeenCalledTimes(1);
      win.webContents.emit('render-process-gone');
      win.webContents.emit('render-process-gone');
      await Promise.resolve();
      expect(win.loadFile).toHaveBeenCalledTimes(2);
      expect(win.loadFile.mock.calls.at(-1)[0]).toMatch(/unavailable\.html$/);
      win.destroyed = true;
      electron.app.emit('second-instance');
      win.webContents.emit('render-process-gone');
      expect(win.focus).not.toHaveBeenCalled();
      expect(win.loadFile).toHaveBeenCalledTimes(2);
    } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
  });
  it('quits with a useful message when its portable data directory cannot be created', async () => {
    const electron = fakeElectron();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-test-'));
    try {
      fs.writeFileSync(path.join(tempDir, 'data'), 'blocks directory creation');
      await startClient(electron, { portableDir: tempDir });
      expect(electron.dialog.showErrorBox).toHaveBeenCalledWith('物品管理无法启动', expect.stringContaining('data'));
      expect(electron.app.quit).toHaveBeenCalledOnce();
      expect(electron.app.requestSingleInstanceLock).not.toHaveBeenCalled();
      expect(electron.windows).toHaveLength(0);
    } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
  });
});
