import React from 'react';
import { createRoot } from 'react-dom/client';
import MainContainer from './containers/MainContainer';
import db, { dbReady } from './database';
import useAppStore from './store';
import { getOption } from './config';
// Initialize profiler (attaches to window.__BOBCORN_PERF__)
import './utils/profiler';

// Apply dark mode synchronously before first render to avoid flash
const opts = getOption() as { darkMode?: boolean };
if (opts.darkMode) {
  document.documentElement.classList.add('dark');
}

// Register early open-file listener BEFORE async WASM init.
// Electron's did-finish-load sends the IPC before React mounts,
// so we buffer the path here for MainContainer to consume.
const { electronAPI } = window as any;
const earlyOpenFileCleanup = electronAPI.onOpenFile((filePath: string) => {
  (window as any).__BOBCORN_PENDING_FILE__ = filePath;
});
// Export cleanup so MainContainer can remove this early listener
(window as any).__BOBCORN_EARLY_OPEN_FILE_CLEANUP__ = earlyOpenFileCleanup;

async function mount() {
  // Wait for sql.js WASM engine to initialize before rendering
  await dbReady;

  // Wire dirty state tracking
  db.registerOnMutation(() => useAppStore.getState().markDirty());

  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(<MainContainer />);
  } else {
    // Script may load before DOM is ready (e.g., in <head>)
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.getElementById('root');
      if (!el) return;
      const root = createRoot(el);
      root.render(<MainContainer />);
    });
  }
}
mount();
