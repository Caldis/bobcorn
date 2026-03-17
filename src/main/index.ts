/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 */

import os from 'os';
import path from 'path';
import type { OpenDialogOptions, SaveDialogOptions } from 'electron';
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import MenuBuilder from './menu';
import { registerScreenColorPicker } from './screen-color-picker';

let mainWindow: BrowserWindow | null = null;
const platform: string = os.platform();
app.name = 'Bobcorn';

if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true') {
  try {
    require('electron-debug')();
  } catch (e) {
    // electron-debug is optional
  }
}

const installExtensions = async (): Promise<void> => {
  try {
    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ['REACT_DEVELOPER_TOOLS'];

    return Promise.all(
      extensions.map((name: string) => installer.default(installer[name], forceDownload))
    ).catch(console.log);
  } catch (e) {
    // electron-devtools-installer is optional
  }
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('ready', async () => {
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true') {
    await installExtensions();
  }

  mainWindow = new BrowserWindow({
    title: 'Bobcorn',
    show: false,
    width: 1200,
    minWidth: 1080,
    height: 800,
    minHeight: 640,
    icon: path.join(__dirname, '../../resources/icon.png'),
    hasShadow: true,
    // 窗口背景透明 (在非启用AERO的Win机器上会有窗口冻结的BUG
    transparent: false,
    // 无边框窗口
    frame: platform === 'darwin',
    // OSX下, 窗口按钮内置
    titleBarStyle: platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, '../preload/preload.js'),
    },
  });

  // Load the renderer
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // @TODO: Use 'ready-to-show' event
  // https://github.com/electron/electron/blob/master/docs/api/browser-window.md#using-ready-to-show-event
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // IPC handlers for window controls (replaces electron.remote)
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });
  ipcMain.on('window-is-maximized', (event: Electron.IpcMainEvent) => {
    event.returnValue = mainWindow ? mainWindow.isMaximized() : false;
  });

  // IPC handlers for dialog operations (replaces electron.remote dialog)
  ipcMain.handle(
    'dialog-show-open',
    async (_event: Electron.IpcMainInvokeEvent, options: OpenDialogOptions) => {
      return dialog.showOpenDialog(mainWindow!, options);
    }
  );
  ipcMain.handle(
    'dialog-show-save',
    async (_event: Electron.IpcMainInvokeEvent, options: SaveDialogOptions) => {
      return dialog.showSaveDialog(mainWindow!, options);
    }
  );
  ipcMain.on(
    'get-app-path',
    (event: Electron.IpcMainEvent, name: Parameters<typeof app.getPath>[0]) => {
      event.returnValue = app.getPath(name);
    }
  );
  ipcMain.handle(
    'shell-open-path',
    async (_event: Electron.IpcMainInvokeEvent, fullPath: string) => {
      return shell.openPath(fullPath);
    }
  );

  // Auto-update
  // Screen color picker
  registerScreenColorPicker();

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('update-available');
  });
  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-downloaded');
  });
});
