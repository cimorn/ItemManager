const path = require('node:path');

const SITE_URL = 'https://storage.mcj.life/';
const APP_ID = 'life.mcj.storage.nasclient';
const WEB_PREFERENCES = Object.freeze({
  partition: 'storage-nas-memory',
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  webSecurity: true,
  webviewTag: false,
  allowRunningInsecureContent: false,
  devTools: false
});

function isSiteUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === new URL(SITE_URL).origin && !url.username && !url.password;
  } catch { return false; }
}

function getDataDirectory({ portableDir, execPath = process.execPath, pathApi = path } = {}) {
  return pathApi.join(portableDir || pathApi.dirname(execPath), 'data', 'nas-client');
}

function protectWebContents(contents) {
  const restrictNavigation = (event, url) => {
    if (!isSiteUrl(url)) event.preventDefault();
  };
  contents.on('will-navigate', restrictNavigation);
  contents.on('will-redirect', restrictNavigation);
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

module.exports = { SITE_URL, APP_ID, WEB_PREFERENCES, isSiteUrl, getDataDirectory, protectWebContents };
