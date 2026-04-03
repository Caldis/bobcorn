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
import mainI18n from './i18n';
import { registerPixelPicker } from 'electron-pixel-picker';
import { readUpdatePreferences, writeUpdatePreferences } from './update-preferences';

/** Extract the first .icp file path from an argv array */
function extractIcpPath(argv: string[]): string | null {
  for (let i = 1; i < argv.length; i++) {
    if (argv[i].endsWith('.icp') && !argv[i].startsWith('--')) {
      return path.resolve(argv[i]);
    }
  }
  return null;
}

let mainWindow: BrowserWindow | null = null;
const platform: string = os.platform();
app.name = 'Bobcorn';

// ── Single-instance lock ──────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
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

  // Windows/Linux: second instance launched with file arg → forward to existing window
  app.on('second-instance', (_event, argv) => {
    const filePath = extractIcpPath(argv);
    if (filePath && mainWindow) {
      mainWindow.webContents.send('open-file', filePath);
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // macOS: double-click .icp or drag to dock icon
  let pendingFilePath: string | null = null;
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow) {
      mainWindow.webContents.send('open-file', filePath);
    } else {
      pendingFilePath = filePath;
    }
  });

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

      // Request language from renderer to sync main process i18n
      mainWindow.webContents.send('request-language');

      // Send file path from macOS open-file event (fired before ready)
      if (pendingFilePath) {
        mainWindow.webContents.send('open-file', pendingFilePath);
        pendingFilePath = null;
      }
      // Send file path from Windows/Linux command-line args
      const argPath = extractIcpPath(process.argv);
      if (argPath) {
        mainWindow.webContents.send('open-file', argPath);
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // ── Close guard ────────────────────────────────────────────
    let forceClose = false;
    let closeTimeout: ReturnType<typeof setTimeout> | null = null;

    app.on('before-quit', () => {
      forceClose = true;
    });

    mainWindow.on('close', (e) => {
      if (!forceClose) {
        e.preventDefault();
        mainWindow!.webContents.send('app:confirm-close');
        closeTimeout = setTimeout(() => {
          forceClose = true;
          mainWindow?.close();
        }, 5000);
      }
    });

    ipcMain.on('app:close-confirmed', () => {
      if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
      }
      forceClose = true;
      mainWindow?.close();
    });

    ipcMain.on('app:close-cancelled', () => {
      if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
      }
    });

    const menuBuilder = new MenuBuilder(mainWindow);
    menuBuilder.buildMenu();

    // ── Language (i18n) ──────────────────────────────────────────────
    ipcMain.on('language-changed', (_event: Electron.IpcMainEvent, lng: string) => {
      mainI18n.changeLanguage(lng);
      // Rebuild menu with new language
      const menuBuilder = new MenuBuilder(mainWindow!);
      menuBuilder.buildMenu();
    });

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
    ipcMain.handle(
      'shell-open-external',
      async (_event: Electron.IpcMainInvokeEvent, url: string) => {
        return shell.openExternal(url);
      }
    );

    // Screen color picker
    registerPixelPicker();

    // ── Auto-update ───────────────────────────────────────────────
    const prefs = readUpdatePreferences();
    autoUpdater.autoDownload = prefs.autoDownloadUpdate;
    autoUpdater.allowPrerelease = prefs.updateChannel === 'beta';
    autoUpdater.autoInstallOnAppQuit = true;

    // Track whether the current check was user-initiated
    let userInitiatedCheck = false;

    // Forward autoUpdater events to renderer
    autoUpdater.on('checking-for-update', () => {
      mainWindow?.webContents.send('update-checking');
    });
    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update-available', { version: info.version });
    });
    autoUpdater.on('update-not-available', () => {
      mainWindow?.webContents.send('update-not-available');
    });
    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('update-progress', { percent: Math.round(progress.percent) });
    });
    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update-downloaded');
    });
    autoUpdater.on('error', (err) => {
      if (userInitiatedCheck) {
        mainWindow?.webContents.send('update-error', { message: err?.message || 'Unknown error' });
      } else {
        // Auto-check errors are silent — just reset to idle
        mainWindow?.webContents.send('update-not-available');
      }
      userInitiatedCheck = false;
    });

    // IPC handlers from renderer
    ipcMain.on('check-for-update', () => {
      userInitiatedCheck = true;
      autoUpdater.checkForUpdates().catch(() => {});
    });
    ipcMain.on('download-update', () => {
      autoUpdater.downloadUpdate().catch(() => {});
    });
    ipcMain.on('install-update', () => {
      autoUpdater.quitAndInstall();
    });
    ipcMain.on(
      'set-update-channel',
      (_event: Electron.IpcMainEvent, { channel }: { channel: 'stable' | 'beta' }) => {
        autoUpdater.allowPrerelease = channel === 'beta';
        writeUpdatePreferences({ updateChannel: channel });
        autoUpdater.checkForUpdates().catch(() => {});
      }
    );
    ipcMain.on('sync-update-preferences', (_event: Electron.IpcMainEvent, incoming: any) => {
      writeUpdatePreferences(incoming);
      autoUpdater.autoDownload = incoming.autoDownloadUpdate ?? autoUpdater.autoDownload;
      if (incoming.updateChannel) {
        autoUpdater.allowPrerelease = incoming.updateChannel === 'beta';
      }
    });

    // Only auto-check in production
    if (process.env.NODE_ENV !== 'development' && prefs.autoCheckUpdate) {
      autoUpdater.checkForUpdates().catch(() => {});
    }

    // ── Dev-only: simulate update lifecycle (Ctrl+Shift+U) ────────
    if (process.env.NODE_ENV === 'development') {
      const { globalShortcut } = require('electron');
      globalShortcut.register('CommandOrControl+Shift+U', () => {
        if (!mainWindow) return;
        const wc = mainWindow.webContents;
        // checking → available → downloading (0→100) → downloaded
        wc.send('update-checking');
        setTimeout(() => wc.send('update-available', { version: '99.0.0' }), 1000);
        setTimeout(() => wc.send('update-progress', { percent: 0 }), 2000);
        setTimeout(() => wc.send('update-progress', { percent: 25 }), 2500);
        setTimeout(() => wc.send('update-progress', { percent: 50 }), 3000);
        setTimeout(() => wc.send('update-progress', { percent: 75 }), 3500);
        setTimeout(() => wc.send('update-progress', { percent: 100 }), 4000);
        setTimeout(() => wc.send('update-downloaded'), 4500);
      });
    }
  });
}
