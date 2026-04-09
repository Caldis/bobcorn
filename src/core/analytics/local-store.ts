// src/core/analytics/local-store.ts

import fs from 'fs';
import path from 'path';
import type { AnalyticsEvent } from './types';

const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

interface AnalyticsData {
  events: AnalyticsEvent[];
  /** Daily aggregation: { "2026-04-10": { "app.launch": 3, "icon.import": 5 } } */
  daily: Record<string, Record<string, number>>;
}

let storePath = '';
let data: AnalyticsData = { events: [], daily: {} };

/** Initialize the local analytics store */
export function initLocalStore(userDataPath: string): void {
  storePath = path.join(userDataPath, 'analytics-data.json');
  try {
    const raw = fs.readFileSync(storePath, 'utf-8');
    data = JSON.parse(raw);
    if (!Array.isArray(data.events)) data.events = [];
    if (!data.daily || typeof data.daily !== 'object') data.daily = {};
  } catch {
    data = { events: [], daily: {} };
  }
  cleanup();
}

/** Record an analytics event (always called, regardless of consent) */
export function recordEvent(
  event: string,
  category: string,
  project: string | null,
  params: Record<string, unknown> | null
): void {
  const ts = Date.now();
  data.events.push({ e: event, c: category, p: project, d: params, t: ts });

  // Update daily aggregation
  const date = new Date(ts).toISOString().slice(0, 10);
  if (!data.daily[date]) data.daily[date] = {};
  data.daily[date][event] = (data.daily[date][event] || 0) + 1;

  flush();
}

/** Remove events older than 90 days */
function cleanup(): void {
  const cutoff = Date.now() - MAX_AGE_MS;
  const before = data.events.length;
  data.events = data.events.filter((ev) => ev.t > cutoff);

  // Clean old daily entries
  const cutoffDate = new Date(cutoff).toISOString().slice(0, 10);
  for (const date of Object.keys(data.daily)) {
    if (date < cutoffDate) delete data.daily[date];
  }

  if (data.events.length !== before) flush();
}

/** Write data to disk */
function flush(): void {
  if (!storePath) return;
  try {
    fs.writeFileSync(storePath, JSON.stringify(data), 'utf-8');
  } catch {
    // Non-critical — best-effort persistence
  }
}

/** Get stored data (for future usage stats UI) */
export function getAnalyticsData(): AnalyticsData {
  return data;
}

/** Reset store (for testing) */
export function resetLocalStore(): void {
  data = { events: [], daily: {} };
}
