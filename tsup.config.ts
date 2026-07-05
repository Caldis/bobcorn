import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  outDir: 'out/cli',
  format: ['cjs'],
  target: 'node18',
  clean: true,
  // The packaged app runs this bundle with the SYSTEM Node.js from
  // app.asar.unpacked, where no node_modules exists (deps live inside
  // app.asar, unreadable to plain Node). tsup externalizes package.json
  // `dependencies` by default, so force-bundle everything the CLI uses.
  noExternal: [/.*/],
  banner: { js: '#!/usr/bin/env node' },
  outExtension: () => ({ js: '.cjs' }),
});
