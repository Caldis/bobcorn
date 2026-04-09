/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { OpenDialogOptions, SaveDialogOptions } from 'electron';
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import MenuBuilder from './menu';
import mainI18n from './i18n';
import { registerPixelPicker } from 'electron-pixel-picker';
import { readUpdatePreferences, writeUpdatePreferences } from './update-preferences';
import { readAnalyticsConsent, writeAnalyticsConsent } from './analytics-consent';
import {
  initGateway,
  initGA4,
  initLocalStore,
  track,
  updateConsent,
  setCurrentProject,
} from '../core/analytics';
import type { AnalyticsConsent } from '../core/analytics';
import { randomUUID } from 'crypto';

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
  if (
    (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true') &&
    !process.env.NO_DEVTOOLS
  ) {
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

    const winW = process.env.WIN_WIDTH ? parseInt(process.env.WIN_WIDTH, 10) : 1200;
    const winH = process.env.WIN_HEIGHT ? parseInt(process.env.WIN_HEIGHT, 10) : 800;
    mainWindow = new BrowserWindow({
      title: 'Bobcorn',
      show: false,
      width: winW,
      minWidth: 1080,
      height: winH,
      minHeight: 640,
      icon: path.join(__dirname, '../../resources/icon.png'),
      hasShadow: true,
      // 窗口背景透明 (在非启用AERO的Win机器上会有窗口冻结的BUG
      transparent: false,
      backgroundColor: '#18191b',
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
      // Send file path from command-line args or OPEN_FILE env var
      const argPath = extractIcpPath(process.argv) || process.env.OPEN_FILE || null;
      if (argPath) {
        mainWindow.webContents.send('open-file', argPath);
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // Forward maximize/unmaximize events to renderer (for title bar button sync)
    mainWindow.on('maximize', () => {
      mainWindow?.webContents.send('window-maximized-change', true);
    });
    mainWindow.on('unmaximize', () => {
      mainWindow?.webContents.send('window-maximized-change', false);
    });

    // ── Close guard ────────────────────────────────────────────
    let forceClose = false;
    let closeTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearCloseTimeout = () => {
      if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
      }
    };

    app.on('before-quit', () => {
      forceClose = true;
    });

    mainWindow.on('close', (e) => {
      if (!forceClose) {
        e.preventDefault();
        // Prevent duplicate timeouts from rapid clicks
        clearCloseTimeout();
        mainWindow!.webContents.send('app:confirm-close');
        closeTimeout = setTimeout(() => {
          forceClose = true;
          mainWindow?.close();
        }, 5000);
      }
    });

    // Use removeAllListeners to prevent handler accumulation from HMR
    ipcMain.removeAllListeners('app:close-confirmed');
    ipcMain.on('app:close-confirmed', () => {
      clearCloseTimeout();
      forceClose = true;
      mainWindow?.close();
    });

    ipcMain.removeAllListeners('app:close-cancelled');
    ipcMain.on('app:close-cancelled', () => {
      clearCloseTimeout();
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
    ipcMain.removeAllListeners('window-always-on-top');
    ipcMain.on('window-always-on-top', (_event: Electron.IpcMainEvent, flag: boolean) => {
      if (mainWindow) mainWindow.setAlwaysOnTop(flag);
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
    ipcMain.removeAllListeners('window-close');
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

    // ── CLI management ──────────────────────────────────────────────
    ipcMain.handle('cli-detect-status', async () => {
      // In dev, the CLI registers as `bobcorn-dev`; in prod as `bobcorn`
      const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
      const cmd = isDev ? 'bobcorn-dev' : 'bobcorn';
      const fs = require('fs');

      // First: try running the command (works if PATH already has it)
      try {
        const { execSync } = require('child_process');
        const version = execSync(`${cmd} --version`, {
          encoding: 'utf8',
          timeout: 5000,
        }).trim();
        return { installed: true, version, commandName: cmd };
      } catch {
        // PATH might not have propagated yet — check if wrapper file exists
        const ext = process.platform === 'win32' ? '.cmd' : '';
        const wrapperDir =
          process.platform === 'win32'
            ? path.join(process.env.LOCALAPPDATA || '', 'Bobcorn', 'cli')
            : path.join(os.homedir(), '.local', 'bin');
        const wrapperPath = path.join(wrapperDir, cmd + ext);
        if (fs.existsSync(wrapperPath)) {
          // Wrapper exists but not in PATH yet — read version from our own package
          const version = app.getVersion();
          return { installed: true, version, commandName: cmd };
        }
        return { installed: false, version: null, commandName: cmd };
      }
    });

    // Resolve CLI binary path — works in both dev and packaged
    const resolveCliPath = (): string => {
      const base = app.getAppPath().replace('app.asar', 'app.asar.unpacked');
      return path.join(base, 'out', 'cli', 'index.cjs');
    };

    // Find system Node.js (not Electron) to run CLI scripts — async
    const findNode = (): Promise<string> => {
      const { execFile: ef } = require('child_process');
      const fs = require('fs');
      const which = process.platform === 'win32' ? 'where' : 'which';
      return new Promise((resolve) => {
        ef(which, ['node'], { encoding: 'utf8', timeout: 5000 }, (err: any, stdout: string) => {
          if (err || !stdout) return resolve(process.execPath);
          const candidates = stdout
            .split('\n')
            .map((l: string) => l.replace(/\r/g, '').trim())
            .filter(Boolean);
          for (const c of candidates) {
            if (fs.existsSync(c)) return resolve(c);
          }
          resolve(candidates[0] || process.execPath);
        });
      });
    };

    // Run CLI command async — returns parsed JSON output
    const runCli = (args: string[]): Promise<any> => {
      const { execFile: ef } = require('child_process');
      const fs = require('fs');
      const cliPath = resolveCliPath();
      if (!fs.existsSync(cliPath)) {
        return Promise.resolve({
          ok: false,
          error: `CLI not built. Run "npx tsup" first.\n(${cliPath})`,
        });
      }
      return findNode().then((nodeBin: string) => {
        return new Promise((resolve) => {
          ef(
            nodeBin,
            [cliPath, ...args, '--json'],
            { encoding: 'utf8', timeout: 15000 },
            (err: any, stdout: string) => {
              try {
                const text = (err?.stdout || stdout || '').trim();
                if (text) return resolve(JSON.parse(text));
                resolve({ ok: false, error: err?.message || 'No output' });
              } catch {
                resolve({ ok: false, error: err?.message || 'Parse error' });
              }
            }
          );
        });
      });
    };

    ipcMain.handle('cli-install', async () => {
      try {
        const result: any = await runCli(['install']);
        return result.ok
          ? { success: true, message: 'installed', ...result.data }
          : { success: false, message: result.error };
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    });

    ipcMain.handle('cli-uninstall', async () => {
      try {
        const result: any = await runCli(['uninstall']);
        return result.ok
          ? { success: true, message: 'uninstalled', ...result.data }
          : { success: false, message: result.error };
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    });

    // Screen color picker
    registerPixelPicker();

    // ── Auto-update ───────────────────────────────────────────────
    const prefs = readUpdatePreferences();
    autoUpdater.autoDownload = prefs.autoDownloadUpdate;
    autoUpdater.allowPrerelease = prefs.updateChannel === 'beta';
    autoUpdater.autoInstallOnAppQuit = true;
    // Force updater to work in dev mode using dev-app-update.yml
    if (!app.isPackaged) {
      autoUpdater.forceDevUpdateConfig = true;
    }

    // ── Analytics initialization ─────────────────────────────────
    const analyticsConsent = readAnalyticsConsent();

    // Ensure a persistent client ID exists (UUID v4, never tied to identity)
    const analyticsClientIdPath = path.join(app.getPath('userData'), 'analytics-client-id');
    let clientId: string;
    try {
      clientId = fs.readFileSync(analyticsClientIdPath, 'utf-8').trim();
    } catch {
      clientId = randomUUID();
      fs.writeFileSync(analyticsClientIdPath, clientId, 'utf-8');
    }

    initLocalStore(app.getPath('userData'));
    initGA4(clientId);
    initGateway(analyticsConsent, app.getVersion());

    // Track app launch
    track('app.launch');

    // Track whether the current action (check/download) was user-initiated
    let userInitiatedAction = false;

    // Debug helper — send logs to renderer devtools (no console.log to avoid EPIPE in dev)
    const updaterLog = (...args: any[]) => {
      const msg = args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
        .join(' ');
      try {
        mainWindow?.webContents.send('updater-debug', msg);
      } catch {}
    };

    // Forward autoUpdater events to renderer
    autoUpdater.on('checking-for-update', () => {
      updaterLog('[updater] checking-for-update');
      mainWindow?.webContents.send('update-checking');
      track('app.update_check');
    });
    autoUpdater.on('update-available', (info) => {
      updaterLog('[updater] update-available:', info.version);
      const releaseNotes =
        typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : Array.isArray(info.releaseNotes)
            ? info.releaseNotes.map((n: any) => n.note || n).join('\n')
            : '';
      mainWindow?.webContents.send('update-available', {
        version: info.version,
        releaseNotes,
      });
    });
    autoUpdater.on('update-not-available', (info) => {
      updaterLog('[updater] update-not-available, current:', info?.version);
      mainWindow?.webContents.send('update-not-available');
    });
    autoUpdater.on('download-progress', (progress) => {
      updaterLog('[updater] download-progress:', Math.round(progress.percent) + '%');
      mainWindow?.webContents.send('update-progress', { percent: Math.round(progress.percent) });
    });
    autoUpdater.on('update-downloaded', (info) => {
      updaterLog('[updater] update-downloaded:', info?.version);
      mainWindow?.webContents.send('update-downloaded');
    });
    autoUpdater.on('error', (err) => {
      updaterLog('[updater] error:', err?.message);
      if (userInitiatedAction) {
        mainWindow?.webContents.send('update-error', { message: err?.message || 'Unknown error' });
      } else {
        // Auto-check errors are silent — just reset to idle
        mainWindow?.webContents.send('update-not-available');
      }
      userInitiatedAction = false;
    });

    // IPC handlers from renderer
    ipcMain.on('check-for-update', () => {
      updaterLog('[updater] check-for-update IPC received');
      updaterLog('[updater] app.isPackaged:', app.isPackaged);
      updaterLog('[updater] app.getAppPath():', app.getAppPath());
      updaterLog('[updater] autoUpdater.currentVersion:', autoUpdater.currentVersion?.version);
      userInitiatedAction = true;
      autoUpdater
        .checkForUpdates()
        .then((result) => {
          updaterLog(
            '[updater] checkForUpdates() resolved:',
            result ? `v${result.updateInfo?.version}` : 'null (updater inactive)'
          );
        })
        .catch((err) => {
          updaterLog('[updater] checkForUpdates() rejected:', err?.message || err);
        });
    });
    ipcMain.on('download-update', () => {
      userInitiatedAction = true;
      autoUpdater.downloadUpdate().catch(() => {});
    });
    ipcMain.on('install-update', () => {
      track('app.update_install');
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

    // ── Analytics IPC ─────────────────────────────────────────────
    ipcMain.handle('analytics:get-consent', () => {
      return readAnalyticsConsent();
    });

    ipcMain.on(
      'analytics:update-consent',
      (_event: Electron.IpcMainEvent, incoming: Partial<AnalyticsConsent>) => {
        writeAnalyticsConsent(incoming);
        updateConsent(readAnalyticsConsent());
      }
    );

    ipcMain.on(
      'analytics:track',
      (
        _event: Electron.IpcMainEvent,
        { event, params }: { event: string; params?: Record<string, unknown> }
      ) => {
        track(event as any, params);
      }
    );

    ipcMain.on(
      'analytics:set-project',
      (_event: Electron.IpcMainEvent, projectName: string | null) => {
        setCurrentProject(projectName);
      }
    );

    // Auto-check for updates on startup
    // NOTE: temporarily enabled in dev for sparkle E2E testing
    updaterLog('[updater] startup config:', {
      autoCheckUpdate: prefs.autoCheckUpdate,
      autoDownload: autoUpdater.autoDownload,
      allowPrerelease: autoUpdater.allowPrerelease,
      currentVersion: app.getVersion(),
    });
    if (prefs.autoCheckUpdate) {
      if (app.isPackaged) {
        autoUpdater.checkForUpdates().catch(() => {});
      } else if (autoUpdater.forceDevUpdateConfig) {
        // Dev mode with forceDevUpdateConfig — delay to ensure renderer is ready
        setTimeout(() => {
          autoUpdater.checkForUpdates().catch(() => {});
        }, 3000);
      }
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
