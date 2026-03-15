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

  // Auto-update
  onUpdateAvailable: (callback: (...args: any[]) => void) => void;
  onUpdateDownloaded: (callback: (...args: any[]) => void) => void;
  installUpdate: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
