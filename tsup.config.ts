import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  outDir: 'out/cli',
  format: ['cjs'],
  target: 'node18',
  clean: true,
  external: ['sql.js', '@napi-rs/canvas', 'pdf-lib'],
  banner: { js: '#!/usr/bin/env node' },
  outExtension: () => ({ js: '.cjs' }),
});
