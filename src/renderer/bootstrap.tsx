import React from 'react';
import { createRoot } from 'react-dom/client';
import MainContainer from './containers/MainContainer';
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): project.create
import db, { dbReady } from './database';
import useAppStore from './store';
import i18n from './i18n';
import { getOption } from './config';
// Initialize profiler (attaches to window.__BOBCORN_PERF__)
import './utils/profiler';

// Apply theme synchronously before first render to avoid flash
import { resolveTheme, applyThemeClass } from './config/themes';
const opts = getOption() as { themeMode?: 'light' | 'dark' | 'system'; darkMode?: boolean };
const themeMode = opts.themeMode ?? (opts.darkMode ? 'dark' : 'light'); // migrate old boolean
const { resolved } = resolveTheme(themeMode as 'light' | 'dark' | 'system');
applyThemeClass(resolved);

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

  // 数据层 → store 的内容变更桥: 所有 iconContent 写入 (替换/改色/批量改色...)
  // 由 db 层统一广播, store 失效对应缓存并触发画布/编辑器刷新 (见 contentCache.ts)
  db.registerOnIconContentChanged((ids: string[]) =>
    useAppStore.getState().invalidateIconContent(ids)
  );

  // Expose internals for E2E / screenshot automation
  (window as any).__BOBCORN_STORE__ = useAppStore;
  (window as any).__BOBCORN_I18N__ = i18n;
  (window as any).__BOBCORN_DB__ = db;

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
