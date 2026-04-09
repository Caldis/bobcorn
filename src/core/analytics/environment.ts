// src/core/analytics/environment.ts

import type { EnvironmentMeta } from './types';

let cached: EnvironmentMeta | null = null;

/**
 * Collect environment metadata. Call once at startup from main process.
 * Uses Electron `app` and `screen` APIs — must be called after app.ready.
 */
export function collectEnvironmentMeta(): EnvironmentMeta {
  if (cached) return cached;

  const os = require('os');
  const meta: EnvironmentMeta = {
    app_version: '', // set by gateway init
    os: process.platform,
    os_version: os.release(),
    locale: Intl.DateTimeFormat().resolvedOptions().locale || 'unknown',
    screen_res: 'unknown',
    arch: process.arch,
  };

  // Screen resolution is only available in Electron main process
  try {
    const { screen } = require('electron');
    const primary = screen.getPrimaryDisplay();
    meta.screen_res = `${primary.size.width}x${primary.size.height}`;
  } catch {
    // CLI mode — no screen API
  }

  cached = meta;
  return meta;
}

/** Reset cache (for testing) */
export function resetEnvironmentCache(): void {
  cached = null;
}
