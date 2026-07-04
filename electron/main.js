const path = require('node:path');

const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');

const { createExcelService } = require('../src/main/excel/excel-service');
const { buildAppMenuTemplate } = require('../src/main/menu/build-app-menu');
const { importProjectImage, organizeProjectImages } = require('../src/main/project/project-image-service');
const projectService = require('../src/main/project/project-service');
const { registerDesktopIpc } = require('../src/main/ipc/register-desktop-ipc');
const { createAppSettingsStore } = require('../src/main/settings/app-settings-store');
const { getDefaultProjectDir } = require('./default-project-dir');
const { focusExistingWindow } = require('./single-instance');

let mainWindow = null;
let settingsStore = null;
const appIconPath = path.join(__dirname, '../assets/app-icon.png');
const gotSingleInstanceLock = app.requestSingleInstanceLock();

function sendCommand(command) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('app:command', command);
}

function installAppMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildAppMenuTemplate({ sendCommand })));
}

async function createMainWindow() {
  if (!settingsStore) {
    settingsStore = await createAppSettingsStore({
      filePath: path.join(app.getPath('userData'), 'settings.json')
    });

    registerDesktopIpc({
      ipcMain,
      dialog,
      shell,
      services: {
        excel: createExcelService({ projectService }),
        images: { importProjectImage, organizeProjectImages },
        project: projectService,
        defaultProjectDir: getDefaultProjectDir({
          isPackaged: app.isPackaged,
          execPath: process.execPath,
          devRoot: path.join(__dirname, '..')
        }),
        settings: settingsStore
      }
    });
  }

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#eef2f5',
    title: '物品管理',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  installAppMenu();

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!focusExistingWindow(mainWindow)) {
      createMainWindow().catch((error) => {
        console.error(error);
        app.quit();
      });
    }
  });

  app.whenReady().then(createMainWindow).catch((error) => {
    console.error(error);
    app.quit();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
