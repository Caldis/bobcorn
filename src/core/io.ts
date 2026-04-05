/**
 * IoAdapter — file system abstraction for dependency injection.
 *
 * Core operations receive an IoAdapter instance instead of importing
 * Node.js `fs` or Electron APIs directly. This allows the same business
 * logic to run in CLI (fs/path), GUI (electronAPI), and test (in-memory)
 * environments.
 */
export interface IoAdapter {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  resolve(...parts: string[]): string;
  join(...parts: string[]): string;
  basename(p: string, ext?: string): string;
  dirname(p: string): string;
  extname(p: string): string;
}
