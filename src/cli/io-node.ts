/**
 * Node.js implementation of IoAdapter.
 *
 * Used by the CLI entry point. Wraps Node's fs/promises and path modules
 * to satisfy the IoAdapter contract from src/core/io.ts.
 */
import fs from 'fs/promises';
import path from 'path';
import type { IoAdapter } from '../core/io';

export const nodeIo: IoAdapter = {
  readFile: (p) => fs.readFile(p),
  writeFile: (p, data) => fs.writeFile(p, data),
  exists: async (p) => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  },
  mkdir: (p, opts) => fs.mkdir(p, opts).then(() => {}),
  resolve: (...parts) => path.resolve(...parts),
  join: (...parts) => path.join(...parts),
  basename: (p, ext) => path.basename(p, ext),
  dirname: (p) => path.dirname(p),
  extname: (p) => path.extname(p),
};
