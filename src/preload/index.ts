import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent, OpenDialogOptions, SaveDialogOptions } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Auto-forward updater debug logs to renderer console
ipcRenderer.on('updater-debug', (_event: IpcRendererEvent, msg: string) => {
  console.log('%c' + msg, 'color: #60a5fa; font-weight: bold');
});

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  windowMinimize: (): void => ipcRenderer.send('window-minimize'),
  windowMaximize: (): void => ipcRenderer.send('window-maximize'),
  windowClose: (): void => ipcRenderer.send('window-close'),
  windowIsMaximized: (): boolean => ipcRenderer.sendSync('window-is-maximized'),

  // Dialogs (via IPC to main process)
  showOpenDialog: (options: OpenDialogOptions) => ipcRenderer.invoke('dialog-show-open', options),
  showSaveDialog: (options: SaveDialogOptions) => ipcRenderer.invoke('dialog-show-save', options),

  // App paths
  getAppPath: (name: string): string => ipcRenderer.sendSync('get-app-path', name),

  // File system
  readFileSync: (filePath: string, encoding?: BufferEncoding): string | Uint8Array => {
    if (encoding) {
      return fs.readFileSync(filePath, encoding);
    }
    // Return a copy of the Buffer data as Uint8Array (structured-cloneable)
    const buf = fs.readFileSync(filePath);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  },
  writeFileSync: (filePath: string, data: string | NodeJS.ArrayBufferView): void =>
    fs.writeFileSync(filePath, data),
  writeFile: (filePath: string, data: string | NodeJS.ArrayBufferView): Promise<void> => {
    // contextBridge cannot pass callbacks, so we make it promise-based
    return new Promise<void>((resolve, reject) => {
      fs.writeFile(filePath, data, (err: NodeJS.ErrnoException | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },
  existsSync: (filePath: string): boolean => fs.existsSync(filePath),
  statSync: (filePath: string): { size: number; isFile: boolean; isDirectory: boolean } => {
    const stat = fs.statSync(filePath);
    // Return a plain object (structured-cloneable)
    return { size: stat.size, isFile: stat.isFile(), isDirectory: stat.isDirectory() };
  },
  accessSync: (filePath: string): boolean => {
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  },
  mkdirSync: (dirPath: string, options?: fs.MakeDirectoryOptions): string | undefined =>
    fs.mkdirSync(dirPath, options),

  // Shell
  openPath: (fullPath: string): Promise<string> => ipcRenderer.invoke('shell-open-path', fullPath),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell-open-external', url),

  // Screen color picker (fullscreen overlay with magnifier)
  pickScreenColor: (): Promise<string> => ipcRenderer.invoke('pick-screen-color'),

  // Path utilities
  pathJoin: (...args: string[]): string => path.join(...args),
  pathResolve: (...args: string[]): string => path.resolve(...args),
  pathBasename: (p: string, ext?: string): string => path.basename(p, ext),
  pathExtname: (p: string): string => path.extname(p),
  pathDirname: (p: string): string => path.dirname(p),

  // OS
  platform: os.platform(),

  // Auto-update
  onUpdateChecking: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('update-checking', handler);
    return () => {
      ipcRenderer.removeListener('update-checking', handler);
    };
  },
  onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string }) => void) => {
    const handler = (_event: IpcRendererEvent, info: { version: string; releaseNotes?: string }) =>
      callback(info);
    ipcRenderer.on('update-available', handler);
    return () => {
      ipcRenderer.removeListener('update-available', handler);
    };
  },
  onUpdateNotAvailable: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('update-not-available', handler);
    return () => {
      ipcRenderer.removeListener('update-not-available', handler);
    };
  },
  onUpdateProgress: (callback: (info: { percent: number }) => void) => {
    const handler = (_event: IpcRendererEvent, info: { percent: number }) => callback(info);
    ipcRenderer.on('update-progress', handler);
    return () => {
      ipcRenderer.removeListener('update-progress', handler);
    };
  },
  onUpdateDownloaded: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('update-downloaded', handler);
    return () => {
      ipcRenderer.removeListener('update-downloaded', handler);
    };
  },
  onUpdateError: (callback: (info: { message: string }) => void) => {
    const handler = (_event: IpcRendererEvent, info: { message: string }) => callback(info);
    ipcRenderer.on('update-error', handler);
    return () => {
      ipcRenderer.removeListener('update-error', handler);
    };
  },
  installUpdate: (): void => ipcRenderer.send('install-update'),
  checkForUpdate: (): void => ipcRenderer.send('check-for-update'),
  downloadUpdate: (): void => ipcRenderer.send('download-update'),
  setUpdateChannel: (channel: 'stable' | 'beta'): void =>
    ipcRenderer.send('set-update-channel', { channel }),
  syncUpdatePreferences: (prefs: {
    autoCheckUpdate: boolean;
    autoDownloadUpdate: boolean;
    updateChannel: 'stable' | 'beta';
  }): void => ipcRenderer.send('sync-update-preferences', prefs),

  // ── Menu commands (main → renderer) ──────────────────────────────
  onMenuNewProject: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:new-project', handler);
    return () => {
      ipcRenderer.removeListener('menu:new-project', handler);
    };
  },
  onMenuOpenProject: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:open-project', handler);
    return () => {
      ipcRenderer.removeListener('menu:open-project', handler);
    };
  },
  onMenuImportIcons: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:import-icons', handler);
    return () => {
      ipcRenderer.removeListener('menu:import-icons', handler);
    };
  },
  onMenuSave: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:save', handler);
    return () => {
      ipcRenderer.removeListener('menu:save', handler);
    };
  },
  onMenuSaveAs: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:save-as', handler);
    return () => {
      ipcRenderer.removeListener('menu:save-as', handler);
    };
  },
  onMenuExportFonts: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:export-fonts', handler);
    return () => {
      ipcRenderer.removeListener('menu:export-fonts', handler);
    };
  },

  // ── File association (main → renderer) ───────────────────────────
  onOpenFile: (callback: (filePath: string) => void) => {
    const handler = (_event: IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on('open-file', handler);
    return () => {
      ipcRenderer.removeListener('open-file', handler);
    };
  },

  // ── Close guard ──────────────────────────────────────────────────
  onConfirmClose: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('app:confirm-close', handler);
    return () => {
      ipcRenderer.removeListener('app:confirm-close', handler);
    };
  },
  confirmClose: (): void => ipcRenderer.send('app:close-confirmed'),
  closeCancelled: (): void => ipcRenderer.send('app:close-cancelled'),

  // ── Language (i18n) ─────────────────────────────────────────────
  languageChanged: (lng: string): void => ipcRenderer.send('language-changed', lng),
  onLanguageRequest: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('request-language', handler);
    return () => {
      ipcRenderer.removeListener('request-language', handler);
    };
  },
});
