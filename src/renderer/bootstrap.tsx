import React from 'react';
import { createRoot } from 'react-dom/client';
import MainContainer from './containers/MainContainer';
import { dbReady } from './database';
import { getOption } from './config';
// Initialize profiler (attaches to window.__BOBCORN_PERF__)
import './utils/profiler';

// Apply dark mode synchronously before first render to avoid flash
const opts = getOption() as { darkMode?: boolean };
if (opts.darkMode) {
  document.documentElement.classList.add('dark');
}

async function mount() {
  // Wait for sql.js WASM engine to initialize before rendering
  await dbReady;

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
