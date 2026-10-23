const fs = require('node:fs');
const path = require('node:path');
const { SITE_URL, APP_ID, WEB_PREFERENCES, isSiteUrl, getDataDirectory, protectWebContents } = require('./policy.cjs');

async function startClient(electron, { portableDir = process.env.PORTABLE_EXECUTABLE_DIR, execPath = process.execPath } = {}) {
  const { app, BrowserWindow, session, Menu, dialog, shell } = electron;
  try {
    const directory = getDataDirectory({ portableDir, execPath });
    fs.mkdirSync(directory, { recursive: true });
    fs.accessSync(directory, fs.constants.W_OK);
    app.setPath('userData', directory);
    app.setPath('sessionData', directory);
    app.setAppUserModelId(APP_ID);
  } catch {
    await app.whenReady();
    dialog.showErrorBox('物品管理无法启动', '无法创建 data 文件夹。请把 EXE 放到有写入权限的文件夹后重新打开。');
    app.quit();
    return;
  }
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }

  let win;
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
  });
  app.on('window-all-closed', () => app.quit());
  await app.whenReady();

  // No persist: prefix: cookies, private responses and browser storage stay in memory.
  const browserSession = session.fromPartition(WEB_PREFERENCES.partition, { cache: true });
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
  win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 760, minHeight: 600,
    show: false, autoHideMenuBar: true, backgroundColor: '#eef2f5',
    title: '物品管理', icon: path.join(__dirname, '../assets/app-icon.png'),
    webPreferences: { ...WEB_PREFERENCES }
  });
  let localPage = true;
  let errorPagePending = false;
  const showUnavailable = async () => {
    if (win.isDestroyed() || errorPagePending) return;
    errorPagePending = true; localPage = true;
    try { await win.loadFile(path.join(__dirname, 'pages/unavailable.html')); }
    catch { /* Closing the window cancels an in-flight page load. */ }
  };
  const connect = async () => {
    if (win.isDestroyed()) return;
    localPage = false; errorPagePending = false;
    try { await win.loadURL(SITE_URL); }
    catch (error) {
      if (error.code !== 'ERR_ABORTED') await showUnavailable();
    }
  };
  protectWebContents(win.webContents);
  win.webContents.on('will-navigate', (event, url) => {
    if (localPage && isSiteUrl(url)) { event.preventDefault(); void connect(); }
  });
  win.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && isSiteUrl(url)) void showUnavailable();
  });
  win.webContents.on('render-process-gone', () => { void showUnavailable(); });
  win.on('page-title-updated', event => event.preventDefault());

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '物品管理', submenu: [
      { label: '重新连接', accelerator: 'F5', click: () => { void connect(); } },
      { label: '在浏览器中打开', click: () => { void shell.openExternal(SITE_URL).catch(() => {}); } },
      { type: 'separator' }, { label: '退出', role: 'quit' }
    ] },
    { label: '编辑', submenu: [
      { label: '撤销', role: 'undo' }, { label: '重做', role: 'redo' }, { type: 'separator' },
      { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }
    ] },
    { label: '显示', submenu: [
      { label: '放大', role: 'zoomIn' }, { label: '缩小', role: 'zoomOut' },
      { label: '实际大小', role: 'resetZoom' }, { label: '全屏', role: 'togglefullscreen' }
    ] }
  ]));
  await win.loadFile(path.join(__dirname, 'pages/connecting.html'));
  if (win.isDestroyed()) return;
  win.show();
  await connect();
}

if (require.main === module) {
  const electron = require('electron');
  startClient(electron).catch(() => {
    electron.dialog.showErrorBox('物品管理无法启动', '请关闭后重新打开程序；如仍无法启动，请将 EXE 移到可写文件夹后重试。');
    electron.app.quit();
  });
}

module.exports = { startClient };
