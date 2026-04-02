declare const __APP_VERSION__: string;

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

interface ElectronAPI {
  // Window controls
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
  windowIsMaximized: () => boolean;

  // Dialogs (via IPC to main process)
  showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
  showSaveDialog: (options: any) => Promise<{ canceled: boolean; filePath?: string }>;

  // App paths
  getAppPath: (name: string) => string;

  // File system
  readFileSync: {
    (filePath: string, encoding: BufferEncoding): string;
    (filePath: string): Uint8Array;
  };
  writeFileSync: (filePath: string, data: string | Uint8Array) => void;
  writeFile: (filePath: string, data: string | Uint8Array) => Promise<void>;
  existsSync: (filePath: string) => boolean;
  statSync: (filePath: string) => { size: number; isFile: boolean; isDirectory: boolean };
  accessSync: (filePath: string) => boolean;
  mkdirSync: (dirPath: string, options?: { recursive?: boolean }) => void;

  // Path utilities
  pathJoin: (...args: string[]) => string;
  pathResolve: (...args: string[]) => string;
  pathBasename: (p: string, ext?: string) => string;
  pathExtname: (p: string) => string;
  pathDirname: (p: string) => string;

  // OS
  platform: string;

  // Shell
  openPath: (fullPath: string) => Promise<string>;

  // Screen color picker
  pickScreenColor: () => Promise<string>;

  // Auto-update
  onUpdateChecking: (callback: () => void) => () => void;
  onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
  onUpdateNotAvailable: (callback: () => void) => () => void;
  onUpdateProgress: (callback: (info: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (callback: () => void) => () => void;
  onUpdateError: (callback: (info: { message: string }) => void) => () => void;
  installUpdate: () => void;
  checkForUpdate: () => void;
  downloadUpdate: () => void;
  setUpdateChannel: (channel: 'stable' | 'beta') => void;
  syncUpdatePreferences: (prefs: {
    autoCheckUpdate: boolean;
    autoDownloadUpdate: boolean;
    updateChannel: 'stable' | 'beta';
  }) => void;

  // Menu IPC (main → renderer)
  onMenuNewProject: (callback: () => void) => () => void;
  onMenuOpenProject: (callback: () => void) => () => void;
  onMenuImportIcons: (callback: () => void) => () => void;
  onMenuSave: (callback: () => void) => () => void;
  onMenuSaveAs: (callback: () => void) => () => void;
  onMenuExportFonts: (callback: () => void) => () => void;

  // File association (main → renderer)
  onOpenFile: (callback: (filePath: string) => void) => () => void;

  // Close guard (main → renderer, renderer → main)
  onConfirmClose: (callback: () => void) => () => void;
  confirmClose: () => void;
  closeCancelled: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
