# Analytics Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate GA4 analytics with a type-safe gateway layer, tiered consent system, privacy policy, and website updates.

**Architecture:** All analytics events are declared in a TypeScript Event Catalog. An Analytics Gateway dispatches events to GA4 (Measurement Protocol) and a local JSON store, gated by a two-tier consent system (basic opt-out / detailed opt-in). Main process owns the gateway; renderer communicates via IPC.

**Tech Stack:** TypeScript, Electron IPC, GA4 Measurement Protocol, JSON file storage, Radix Dialog, Tailwind CSS, react-i18next

**Spec:** `docs/superpowers/specs/2026-04-10-analytics-integration-design.md`

---

## Prerequisite

The implementor needs a GA4 Measurement Protocol API secret. Create one at:
Google Analytics → Admin → Data Streams → your stream → Measurement Protocol API secrets → Create.
Store the secret value — it will be hardcoded in `src/core/analytics/ga4.ts` as `GA4_API_SECRET`.
Until the real secret is available, use the placeholder `'REPLACE_WITH_GA4_API_SECRET'`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/analytics/types.ts` | Create | Shared types (ConsentTier, AnalyticsConsent, EnvironmentMeta, AnalyticsEvent) |
| `src/core/analytics/catalog.ts` | Create | Event registry (EVENT_CATALOG, EventName type) |
| `src/core/analytics/environment.ts` | Create | OS/version/locale/resolution collector |
| `src/core/analytics/ga4.ts` | Create | GA4 Measurement Protocol HTTP client |
| `src/core/analytics/local-store.ts` | Create | JSON-file event recording + daily aggregation |
| `src/core/analytics/gateway.ts` | Create | Central dispatcher (consent check → GA4 + local) |
| `src/core/analytics/index.ts` | Create | Public API re-exports |
| `src/main/analytics-consent.ts` | Create | File-based consent persistence (same pattern as update-preferences.ts) |
| `src/main/index.ts` | Modify | Init gateway + register analytics IPC handlers |
| `src/preload/index.ts` | Modify | Expose analytics IPC bridge |
| `src/renderer/store/index.ts` | Modify | Add consent state + analytics track helper |
| `src/renderer/components/ConsentDialog/index.tsx` | Create | First-launch consent dialog |
| `src/renderer/components/SideMenu/SettingsDialog.tsx` | Modify | Add "Data Sharing" section |
| `src/renderer/containers/MainContainer/index.tsx` | Modify | Wire ConsentDialog on first launch |
| `src/locales/en.json` | Modify | Analytics i18n keys |
| `src/locales/zh-CN.json` | Modify | Analytics i18n keys (Chinese) |
| `docs/privacy.html` | Create | Privacy policy page |
| `docs/index.html` | Modify | Cookie consent banner + download click events |
| `docs/CONVENTIONS.md` | Modify | Analytics section |
| `test/unit/analytics/catalog.test.ts` | Create | Catalog validation tests |
| `test/unit/analytics/gateway.test.ts` | Create | Gateway consent + dispatch tests |
| `test/unit/analytics/local-store.test.ts` | Create | Local store read/write tests |

---

## Dependency Graph

```
Tasks 1,2,3 (parallel) → Task 4 (needs 1-3) → Task 5 (needs 4)
Task 6 (i18n, independent)
Task 7 (needs 5,6) → Task 8 (needs 7) → Task 9 (needs 8)
Tasks 10,11 (independent, parallel)
Task 12 (needs all, final)
```

---

### Task 1: Core Types & Event Catalog

**Dependencies:** None (can start immediately)

**Files:**
- Create: `src/core/analytics/types.ts`
- Create: `src/core/analytics/catalog.ts`
- Create: `test/unit/analytics/catalog.test.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// src/core/analytics/types.ts

export type ConsentTier = 'basic' | 'detailed';

export interface AnalyticsConsent {
  basicEnabled: boolean;       // default: true (opt-out)
  detailedEnabled: boolean;    // default: false (opt-in)
  consentShownAt: string;      // ISO date string, '' if never shown
  consentVersion: number;      // bump to re-show consent dialog
}

export const CONSENT_DEFAULTS: AnalyticsConsent = {
  basicEnabled: true,
  detailedEnabled: false,
  consentShownAt: '',
  consentVersion: 1,
};

export interface EnvironmentMeta {
  app_version: string;
  os: string;
  os_version: string;
  locale: string;
  screen_res: string;
  arch: string;
}

export interface AnalyticsEvent {
  /** Event name from catalog */
  e: string;
  /** Category */
  c: string;
  /** Project name (null for cross-project events) */
  p: string | null;
  /** Extra params */
  d: Record<string, unknown> | null;
  /** Unix timestamp ms */
  t: number;
}
```

- [ ] **Step 2: Create catalog.ts**

```typescript
// src/core/analytics/catalog.ts

import type { ConsentTier } from './types';

export interface EventDef {
  category: string;
  tier: ConsentTier;
  description: string;
}

/**
 * Event Catalog — single source of truth for all analytics events.
 *
 * Rules:
 * - Every user-visible action MUST have an entry here
 * - The `tier` field determines which consent level is required
 * - Adding a new event: add entry here, then call track() in the action
 * - TypeScript will enforce that track() only accepts registered event names
 */
export const EVENT_CATALOG = {
  // ── Basic tier (opt-out) — anonymous counts + environment ──
  'app.launch':        { category: 'app',    tier: 'basic', description: 'App started' },
  'app.update_check':  { category: 'app',    tier: 'basic', description: 'Checked for updates' },
  'app.update_install':{ category: 'app',    tier: 'basic', description: 'Installed an update' },

  // ── Detailed tier (opt-in) — feature usage ──
  'project.create':    { category: 'project', tier: 'detailed', description: 'Created a project' },
  'project.open':      { category: 'project', tier: 'detailed', description: 'Opened a project' },
  'project.save':      { category: 'project', tier: 'detailed', description: 'Saved a project' },
  'icon.import':       { category: 'icon',    tier: 'detailed', description: 'Imported icons' },
  'icon.delete':       { category: 'icon',    tier: 'detailed', description: 'Deleted icons' },
  'icon.export':       { category: 'export',  tier: 'detailed', description: 'Exported icon files' },
  'font.generate':     { category: 'export',  tier: 'detailed', description: 'Generated font files' },
  'group.create':      { category: 'project', tier: 'detailed', description: 'Created a group' },
  'group.delete':      { category: 'project', tier: 'detailed', description: 'Deleted a group' },
  'search.execute':    { category: 'icon',    tier: 'detailed', description: 'Searched icons' },
  'cli.command':       { category: 'cli',     tier: 'detailed', description: 'Executed CLI command' },
} as const satisfies Record<string, EventDef>;

/** Union type of all registered event names — track() only accepts these */
export type EventName = keyof typeof EVENT_CATALOG;

/** Get all event names for a specific tier */
export function getEventsByTier(tier: ConsentTier): EventName[] {
  return (Object.entries(EVENT_CATALOG) as [EventName, EventDef][])
    .filter(([, def]) => def.tier === tier)
    .map(([name]) => name);
}
```

- [ ] **Step 3: Write catalog tests**

```typescript
// test/unit/analytics/catalog.test.ts

import { describe, it, expect } from 'vitest';
import { EVENT_CATALOG, getEventsByTier } from '../../src/core/analytics/catalog';

describe('Event Catalog', () => {
  it('every event has required fields', () => {
    for (const [name, def] of Object.entries(EVENT_CATALOG)) {
      expect(def.category, `${name} missing category`).toBeTruthy();
      expect(['basic', 'detailed'], `${name} invalid tier`).toContain(def.tier);
      expect(def.description, `${name} missing description`).toBeTruthy();
    }
  });

  it('has at least one basic and one detailed event', () => {
    const basic = getEventsByTier('basic');
    const detailed = getEventsByTier('detailed');
    expect(basic.length).toBeGreaterThan(0);
    expect(detailed.length).toBeGreaterThan(0);
  });

  it('app.launch is basic tier', () => {
    expect(EVENT_CATALOG['app.launch'].tier).toBe('basic');
  });

  it('feature events are detailed tier', () => {
    expect(EVENT_CATALOG['icon.import'].tier).toBe('detailed');
    expect(EVENT_CATALOG['font.generate'].tier).toBe('detailed');
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/unit/analytics/catalog.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/analytics/types.ts src/core/analytics/catalog.ts test/unit/analytics/catalog.test.ts
git commit -m "feat(analytics): add core types and event catalog"
```

---

### Task 2: Environment Metadata & Consent Persistence

**Dependencies:** Task 1 (needs types.ts)

**Files:**
- Create: `src/core/analytics/environment.ts`
- Create: `src/main/analytics-consent.ts`
- Create: `test/unit/analytics/consent.test.ts`

- [ ] **Step 1: Create environment.ts**

This module collects OS/version/locale/resolution. It uses Electron APIs so it runs in the main process only.

```typescript
// src/core/analytics/environment.ts

import type { EnvironmentMeta } from './types';

let cached: EnvironmentMeta | null = null;

/**
 * Collect environment metadata. Call once at startup from main process.
 * Uses Electron `app` and `screen` APIs — must be called after app.ready.
 */
export function collectEnvironmentMeta(): EnvironmentMeta {
  if (cached) return cached;

  // These are available in both main process and CLI (Node.js)
  const os = require('os');
  const meta: EnvironmentMeta = {
    app_version: '',  // set by gateway init
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
```

- [ ] **Step 2: Create analytics-consent.ts**

Follow the exact same pattern as `src/main/update-preferences.ts`:

```typescript
// src/main/analytics-consent.ts

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { AnalyticsConsent } from '../core/analytics/types';
import { CONSENT_DEFAULTS } from '../core/analytics/types';

function getConsentPath(): string {
  return path.join(app.getPath('userData'), 'analytics-consent.json');
}

export function readAnalyticsConsent(): AnalyticsConsent {
  try {
    const raw = fs.readFileSync(getConsentPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...CONSENT_DEFAULTS, ...parsed };
  } catch {
    return { ...CONSENT_DEFAULTS };
  }
}

export function writeAnalyticsConsent(consent: Partial<AnalyticsConsent>): void {
  const current = readAnalyticsConsent();
  const merged = { ...current, ...consent };
  fs.writeFileSync(getConsentPath(), JSON.stringify(merged, null, 2), 'utf-8');
}
```

- [ ] **Step 3: Write consent persistence test**

```typescript
// test/unit/analytics/consent.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CONSENT_DEFAULTS } from '../../src/core/analytics/types';

// We test the merge logic directly since the file I/O uses Electron app.getPath
describe('AnalyticsConsent defaults', () => {
  it('basicEnabled defaults to true (opt-out)', () => {
    expect(CONSENT_DEFAULTS.basicEnabled).toBe(true);
  });

  it('detailedEnabled defaults to false (opt-in)', () => {
    expect(CONSENT_DEFAULTS.detailedEnabled).toBe(false);
  });

  it('consentVersion starts at 1', () => {
    expect(CONSENT_DEFAULTS.consentVersion).toBe(1);
  });

  it('merge preserves user overrides', () => {
    const userPrefs = { detailedEnabled: true };
    const merged = { ...CONSENT_DEFAULTS, ...userPrefs };
    expect(merged.detailedEnabled).toBe(true);
    expect(merged.basicEnabled).toBe(true); // default preserved
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/unit/analytics/consent.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/analytics/environment.ts src/main/analytics-consent.ts test/unit/analytics/consent.test.ts
git commit -m "feat(analytics): add environment collector and consent persistence"
```

---

### Task 3: GA4 Client & Local Store

**Dependencies:** Task 1 (needs types.ts)

**Files:**
- Create: `src/core/analytics/ga4.ts`
- Create: `src/core/analytics/local-store.ts`
- Create: `test/unit/analytics/local-store.test.ts`

- [ ] **Step 1: Create ga4.ts**

```typescript
// src/core/analytics/ga4.ts

import type { EnvironmentMeta } from './types';

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const MEASUREMENT_ID = 'G-H1DCS6LF3S';
const GA4_API_SECRET = 'REPLACE_WITH_GA4_API_SECRET'; // write-only, safe to embed

let clientId = '';

/** Initialize with a persistent client ID (UUID v4 stored in userData) */
export function initGA4(persistedClientId: string): void {
  clientId = persistedClientId;
}

/** Send a single event to GA4 via Measurement Protocol */
export async function sendToGA4(
  eventName: string,
  params: Record<string, unknown>,
  envMeta: EnvironmentMeta
): Promise<void> {
  if (!clientId) return;

  const url = `${GA4_ENDPOINT}?measurement_id=${MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;

  try {
    // Use global fetch (Node 18+ / Electron main process)
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        events: [{
          name: eventName,
          params: {
            engagement_time_msec: 1,
            ...envMeta,
            ...params,
          },
        }],
      }),
    });
  } catch {
    // Silent failure — local store has the record
  }
}
```

- [ ] **Step 2: Create local-store.ts**

Uses a JSON file in userData for simplicity (no extra WASM/SQLite init needed):

```typescript
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
```

- [ ] **Step 3: Write local store tests**

```typescript
// test/unit/analytics/local-store.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordEvent, getAnalyticsData, resetLocalStore } from '../../src/core/analytics/local-store';

// Mock fs to avoid real file I/O in tests
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(() => { throw new Error('not found'); }),
    writeFileSync: vi.fn(),
  },
}));

describe('Local Analytics Store', () => {
  beforeEach(() => {
    resetLocalStore();
  });

  it('records an event', () => {
    recordEvent('app.launch', 'app', null, null);
    const data = getAnalyticsData();
    expect(data.events).toHaveLength(1);
    expect(data.events[0].e).toBe('app.launch');
    expect(data.events[0].c).toBe('app');
    expect(data.events[0].p).toBeNull();
  });

  it('records event with project context', () => {
    recordEvent('icon.import', 'icon', 'my-icons', { count: 5 });
    const data = getAnalyticsData();
    expect(data.events[0].p).toBe('my-icons');
    expect(data.events[0].d).toEqual({ count: 5 });
  });

  it('aggregates daily counts', () => {
    recordEvent('app.launch', 'app', null, null);
    recordEvent('app.launch', 'app', null, null);
    recordEvent('icon.import', 'icon', null, null);
    const data = getAnalyticsData();
    const today = new Date().toISOString().slice(0, 10);
    expect(data.daily[today]['app.launch']).toBe(2);
    expect(data.daily[today]['icon.import']).toBe(1);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/unit/analytics/local-store.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/analytics/ga4.ts src/core/analytics/local-store.ts test/unit/analytics/local-store.test.ts
git commit -m "feat(analytics): add GA4 client and local JSON store"
```

---

### Task 4: Analytics Gateway & Module Entry

**Dependencies:** Tasks 1, 2, 3

**Files:**
- Create: `src/core/analytics/gateway.ts`
- Create: `src/core/analytics/index.ts`
- Create: `test/unit/analytics/gateway.test.ts`

- [ ] **Step 1: Create gateway.ts**

```typescript
// src/core/analytics/gateway.ts

import { EVENT_CATALOG, type EventName } from './catalog';
import type { AnalyticsConsent, EnvironmentMeta } from './types';
import { CONSENT_DEFAULTS } from './types';
import { collectEnvironmentMeta } from './environment';
import { sendToGA4 } from './ga4';
import { recordEvent } from './local-store';

let consent: AnalyticsConsent = { ...CONSENT_DEFAULTS };
let envMeta: EnvironmentMeta | null = null;
let currentProject: string | null = null;

/** Initialize the analytics gateway. Call once from main process after app.ready. */
export function initGateway(initialConsent: AnalyticsConsent, appVersion: string): void {
  consent = initialConsent;
  envMeta = collectEnvironmentMeta();
  envMeta.app_version = appVersion;
}

/** Update consent state (when user toggles in settings) */
export function updateConsent(newConsent: AnalyticsConsent): void {
  consent = newConsent;
}

/** Set the current project context (for per-project attribution) */
export function setCurrentProject(projectName: string | null): void {
  currentProject = projectName;
}

/**
 * Track an analytics event.
 *
 * - Always records to local store (not affected by consent)
 * - Only sends to GA4 if consent allows for the event's tier
 * - TypeScript enforces that `event` must be a key in EVENT_CATALOG
 */
export function track(event: EventName, params?: Record<string, unknown>): void {
  const def = EVENT_CATALOG[event];

  // Always write to local store (user's own data, like iOS Screen Time)
  recordEvent(event, def.category, currentProject, params ?? null);

  // Check consent for GA4 remote reporting
  if (def.tier === 'basic' && !consent.basicEnabled) return;
  if (def.tier === 'detailed' && !consent.detailedEnabled) return;

  // Send to GA4 (fire-and-forget)
  if (envMeta) {
    sendToGA4(event, params ?? {}, envMeta).catch(() => {});
  }
}
```

- [ ] **Step 2: Create index.ts (module entry)**

```typescript
// src/core/analytics/index.ts

export { track, initGateway, updateConsent, setCurrentProject } from './gateway';
export { EVENT_CATALOG, type EventName, getEventsByTier } from './catalog';
export type { AnalyticsConsent, ConsentTier, EnvironmentMeta, AnalyticsEvent } from './types';
export { CONSENT_DEFAULTS } from './types';
export { initGA4 } from './ga4';
export { initLocalStore, getAnalyticsData } from './local-store';
```

- [ ] **Step 3: Write gateway tests**

```typescript
// test/unit/analytics/gateway.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies before importing gateway
vi.mock('../../src/core/analytics/ga4', () => ({
  sendToGA4: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../src/core/analytics/local-store', () => ({
  recordEvent: vi.fn(),
}));
vi.mock('../../src/core/analytics/environment', () => ({
  collectEnvironmentMeta: vi.fn(() => ({
    app_version: '1.0.0',
    os: 'win32',
    os_version: '10.0',
    locale: 'en-US',
    screen_res: '1920x1080',
    arch: 'x64',
  })),
}));

import { initGateway, track, updateConsent } from '../../src/core/analytics/gateway';
import { sendToGA4 } from '../../src/core/analytics/ga4';
import { recordEvent } from '../../src/core/analytics/local-store';
import { CONSENT_DEFAULTS } from '../../src/core/analytics/types';

describe('Analytics Gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initGateway({ ...CONSENT_DEFAULTS }, '1.0.0');
  });

  it('always records to local store regardless of consent', () => {
    // Even with basic disabled, local store should record
    updateConsent({ ...CONSENT_DEFAULTS, basicEnabled: false, detailedEnabled: false });
    track('app.launch');
    expect(recordEvent).toHaveBeenCalledWith('app.launch', 'app', null, null);
  });

  it('sends basic events to GA4 when basicEnabled=true', () => {
    track('app.launch');
    expect(sendToGA4).toHaveBeenCalled();
  });

  it('blocks basic events from GA4 when basicEnabled=false', () => {
    updateConsent({ ...CONSENT_DEFAULTS, basicEnabled: false });
    track('app.launch');
    expect(sendToGA4).not.toHaveBeenCalled();
  });

  it('blocks detailed events from GA4 when detailedEnabled=false (default)', () => {
    track('icon.import');
    expect(sendToGA4).not.toHaveBeenCalled();
    // But local store still records
    expect(recordEvent).toHaveBeenCalled();
  });

  it('sends detailed events to GA4 when detailedEnabled=true', () => {
    updateConsent({ ...CONSENT_DEFAULTS, detailedEnabled: true });
    track('icon.import', { count: 5 });
    expect(sendToGA4).toHaveBeenCalled();
  });

  it('passes params through to GA4 and local store', () => {
    updateConsent({ ...CONSENT_DEFAULTS, detailedEnabled: true });
    track('icon.import', { count: 5 });
    expect(recordEvent).toHaveBeenCalledWith('icon.import', 'icon', null, { count: 5 });
    expect(sendToGA4).toHaveBeenCalledWith(
      'icon.import',
      { count: 5 },
      expect.objectContaining({ app_version: '1.0.0' })
    );
  });
});
```

- [ ] **Step 4: Run all analytics tests**

Run: `npx vitest run test/unit/analytics/`
Expected: All tests PASS (catalog + consent + local-store + gateway)

- [ ] **Step 5: Commit**

```bash
git add src/core/analytics/gateway.ts src/core/analytics/index.ts test/unit/analytics/gateway.test.ts
git commit -m "feat(analytics): add gateway with consent-gated dual dispatch"
```

---

### Task 5: Main Process IPC Integration

**Dependencies:** Tasks 2, 4

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add imports to src/main/index.ts**

At the top of `src/main/index.ts`, after the existing `import { readUpdatePreferences, writeUpdatePreferences } from './update-preferences';` (line 15), add:

```typescript
import { readAnalyticsConsent, writeAnalyticsConsent } from './analytics-consent';
import { initGateway, initGA4, initLocalStore, track, updateConsent, setCurrentProject } from '../core/analytics';
import type { AnalyticsConsent } from '../core/analytics';
import { randomUUID } from 'crypto';
```

- [ ] **Step 2: Initialize analytics in app.ready handler**

In `src/main/index.ts`, inside the `app.on('ready', async () => {` handler (line 96), after the update preferences are read (around line 394 area, where `const prefs = readUpdatePreferences();` is), add analytics initialization:

```typescript
    // ── Analytics initialization ─────────────────────────────────
    const analyticsConsent = readAnalyticsConsent();

    // Ensure a persistent client ID exists (UUID v4, never tied to identity)
    const analyticsPrefsPath = path.join(app.getPath('userData'), 'analytics-client-id');
    let clientId: string;
    try {
      clientId = fs.readFileSync(analyticsPrefsPath, 'utf-8').trim();
    } catch {
      clientId = randomUUID();
      fs.writeFileSync(analyticsPrefsPath, clientId, 'utf-8');
    }

    initLocalStore(app.getPath('userData'));
    initGA4(clientId);
    initGateway(analyticsConsent, app.getVersion());

    // Track app launch
    track('app.launch');
```

- [ ] **Step 3: Register analytics IPC handlers**

In `src/main/index.ts`, after the existing `ipcMain.on('sync-update-preferences', ...)` block (around line 497), add:

```typescript
    // ── Analytics IPC ─────────────────────────────────────────────
    ipcMain.handle('analytics:get-consent', () => {
      return readAnalyticsConsent();
    });

    ipcMain.on('analytics:update-consent', (_event: Electron.IpcMainEvent, incoming: Partial<AnalyticsConsent>) => {
      writeAnalyticsConsent(incoming);
      updateConsent(readAnalyticsConsent());
    });

    ipcMain.on('analytics:track', (_event: Electron.IpcMainEvent, { event, params }: { event: string; params?: Record<string, unknown> }) => {
      // The event name is validated as EventName on the renderer side via TypeScript.
      // Here we cast because IPC serialization loses the type.
      track(event as any, params);
    });

    ipcMain.on('analytics:set-project', (_event: Electron.IpcMainEvent, projectName: string | null) => {
      setCurrentProject(projectName);
    });
```

- [ ] **Step 4: Add track calls to existing auto-update events**

In `src/main/index.ts`, find the auto-updater event handlers. Add `track()` calls:

After `autoUpdater.on('checking-for-update', ...)` — add: `track('app.update_check');`

After `autoUpdater.on('update-downloaded', ...)` — the install handler `ipcMain.on('install-update', ...)` (line 480) — add: `track('app.update_install');`

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(analytics): integrate gateway into main process with IPC handlers"
```

---

### Task 6: i18n Keys

**Dependencies:** None (can run in parallel with anything)

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh-CN.json`

- [ ] **Step 1: Read current locale files to find insertion point**

Read `src/locales/en.json` and `src/locales/zh-CN.json`. Find the `settings.ai` section — the new `settings.analytics` keys should be added after it (but before `settings.version`).

Also find an appropriate place for the `consent` namespace (for the first-launch dialog).

- [ ] **Step 2: Add English i18n keys to en.json**

Add these keys in the appropriate sections:

```json
{
  "settings.analytics": "Data Sharing",
  "settings.analyticsBasic": "Anonymous basic data (launch count, system info)",
  "settings.analyticsBasicHint": "Contains no project content, helps us understand compatibility",
  "settings.analyticsDetailed": "Feature usage statistics",
  "settings.analyticsDetailedHint": "Share import/export frequency to help improve features",
  "settings.analyticsFooter": "All data is anonymous and contains no project content.",
  "settings.privacyPolicy": "Privacy Policy",

  "consent.title": "Help Improve Bobcorn",
  "consent.body": "To improve your experience, Bobcorn collects anonymous basic usage data (such as launch count and system version). No project content or personal information is included.",
  "consent.detailedCheckbox": "Also share feature usage statistics (e.g. import/export counts) to help us understand which features are most valuable",
  "consent.settingsHint": "You can change these options anytime in Settings → Data Sharing.",
  "consent.privacyLink": "Privacy Policy",
  "consent.confirm": "OK, I understand"
}
```

- [ ] **Step 3: Add Chinese i18n keys to zh-CN.json**

```json
{
  "settings.analytics": "数据共享",
  "settings.analyticsBasic": "匿名基础数据（启动次数、系统信息）",
  "settings.analyticsBasicHint": "不含任何项目内容，帮助我们了解兼容性",
  "settings.analyticsDetailed": "功能使用统计",
  "settings.analyticsDetailedHint": "分享导入/导出等操作频次，帮助改进功能",
  "settings.analyticsFooter": "所有数据均匿名且不含项目内容。",
  "settings.privacyPolicy": "隐私政策",

  "consent.title": "帮助改进 Bobcorn",
  "consent.body": "为了改进产品体验，Bobcorn 会收集匿名的基础使用数据（如启动次数、系统版本）。不包含任何项目内容或个人信息。",
  "consent.detailedCheckbox": "同时分享功能使用统计（如导入/导出次数），帮助我们了解哪些功能最有价值",
  "consent.settingsHint": "你可以随时在 设置 → 数据共享 中更改这些选项。",
  "consent.privacyLink": "隐私政策",
  "consent.confirm": "好的，我了解了"
}
```

- [ ] **Step 4: Verify all locale files have matching keys**

Manually verify both files have the same set of new keys. Run:
`npx vitest run test/unit/i18n.test.ts`
Expected: PASS (existing i18n tests verify key parity)

- [ ] **Step 5: Commit**

```bash
git add src/locales/en.json src/locales/zh-CN.json
git commit -m "feat(analytics): add i18n keys for consent dialog and data sharing settings"
```

---

### Task 7: Preload Bridge & Store State

**Dependencies:** Task 5 (needs IPC handlers in main), Task 6 (needs i18n keys)

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/store/index.ts`

- [ ] **Step 1: Add analytics IPC to preload**

In `src/preload/index.ts`, after the existing auto-update section (after `syncUpdatePreferences` around line 141), add a new analytics section:

```typescript
  // ── Analytics ────────────────────────────────────────────────────
  analyticsGetConsent: (): Promise<{
    basicEnabled: boolean;
    detailedEnabled: boolean;
    consentShownAt: string;
    consentVersion: number;
  }> => ipcRenderer.invoke('analytics:get-consent'),

  analyticsUpdateConsent: (consent: {
    basicEnabled?: boolean;
    detailedEnabled?: boolean;
    consentShownAt?: string;
    consentVersion?: number;
  }): void => ipcRenderer.send('analytics:update-consent', consent),

  analyticsTrack: (event: string, params?: Record<string, unknown>): void =>
    ipcRenderer.send('analytics:track', { event, params }),

  analyticsSetProject: (projectName: string | null): void =>
    ipcRenderer.send('analytics:set-project', projectName),
```

- [ ] **Step 2: Add consent state to store**

In `src/renderer/store/index.ts`, add to the `State` interface (after `updateError` around line 48):

```typescript
  // Analytics consent (synced with main process)
  analyticsBasicEnabled: boolean;
  analyticsDetailedEnabled: boolean;
  analyticsConsentShown: boolean; // true if consent dialog has been shown
```

Add to the `Actions` interface (after `setUpdateError`):

```typescript
  // Analytics
  setAnalyticsConsent: (basic: boolean, detailed: boolean) => void;
  markConsentShown: () => void;
  loadAnalyticsConsent: () => Promise<void>;
```

Add initial state values (after `updateError: null`):

```typescript
  // Analytics consent
  analyticsBasicEnabled: true,
  analyticsDetailedEnabled: false,
  analyticsConsentShown: false,
```

Add action implementations:

```typescript
  setAnalyticsConsent: (basic: boolean, detailed: boolean) => {
    set({ analyticsBasicEnabled: basic, analyticsDetailedEnabled: detailed });
    (window as any).electronAPI.analyticsUpdateConsent({
      basicEnabled: basic,
      detailedEnabled: detailed,
    });
  },

  markConsentShown: () => {
    set({ analyticsConsentShown: true });
    (window as any).electronAPI.analyticsUpdateConsent({
      consentShownAt: new Date().toISOString(),
    });
  },

  loadAnalyticsConsent: async () => {
    const consent = await (window as any).electronAPI.analyticsGetConsent();
    set({
      analyticsBasicEnabled: consent.basicEnabled,
      analyticsDetailedEnabled: consent.detailedEnabled,
      analyticsConsentShown: !!consent.consentShownAt,
    });
  },
```

- [ ] **Step 3: Add analytics track helper for renderer**

Also in the store file, add a standalone helper function that wraps the IPC call with type safety. Place it after the store definition, before the default export:

```typescript
/**
 * Track an analytics event from the renderer process.
 * Import this instead of calling electronAPI directly.
 */
export function analyticsTrack(event: string, params?: Record<string, unknown>): void {
  (window as any).electronAPI.analyticsTrack(event, params);
}
```

- [ ] **Step 4: Sync project context on file open/save**

In `src/renderer/store/index.ts`, find the `setCurrentFilePath` action. After the existing `set({ currentFilePath: path })` call, add project context sync:

```typescript
  setCurrentFilePath: (filePath: string | null) => {
    set({ currentFilePath: filePath });
    if (filePath) {
      setOption('currentFilePath', filePath);
      const projectName = (window as any).electronAPI.pathBasename(filePath, '.icp');
      (window as any).electronAPI.analyticsSetProject(projectName);
    } else {
      (window as any).electronAPI.analyticsSetProject(null);
    }
  },
```

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/renderer/store/index.ts
git commit -m "feat(analytics): add preload bridge and store consent state"
```

---

### Task 8: ConsentDialog Component

**Dependencies:** Task 7 (needs store + preload)

**Files:**
- Create: `src/renderer/components/ConsentDialog/index.tsx`

**Note:** Use the `/frontend-design` skill for this component to ensure the dialog is polished, friendly, and doesn't feel intrusive. The dialog should feel warm and trustworthy, not like a legal obligation.

- [ ] **Step 1: Create ConsentDialog component**

```tsx
// src/renderer/components/ConsentDialog/index.tsx

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../ui';
import { cn } from '../../lib/utils';
import useAppStore from '../../store';

interface ConsentDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ConsentDialog({ open, onClose }: ConsentDialogProps) {
  const { t } = useTranslation();
  const [detailedChecked, setDetailedChecked] = useState(false);
  const setAnalyticsConsent = useAppStore((s) => s.setAnalyticsConsent);
  const markConsentShown = useAppStore((s) => s.markConsentShown);

  const handleConfirm = () => {
    setAnalyticsConsent(true, detailedChecked);
    markConsentShown();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleConfirm}
      closable={false}
      maskClosable={false}
      className="max-w-[420px]"
    >
      {/* Title area with subtle analytics icon */}
      <div className="flex flex-col items-center pt-2 pb-4">
        <div
          className={cn(
            'w-10 h-10 rounded-xl mb-3 flex items-center justify-center',
            'bg-gradient-to-br from-accent/10 to-accent/5',
            'border border-accent/10'
          )}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent"
          >
            <path d="M3 3v18h18" />
            <path d="M18 17V9" />
            <path d="M13 17V5" />
            <path d="M8 17v-3" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-foreground">
          {t('consent.title')}
        </h3>
      </div>

      {/* Body */}
      <div className="space-y-4 px-1">
        <p className="text-sm text-foreground-muted leading-relaxed">
          {t('consent.body')}
        </p>

        {/* Opt-in checkbox for detailed tier */}
        <label
          className={cn(
            'flex items-start gap-3 p-3 rounded-lg cursor-pointer',
            'border transition-colors duration-150',
            detailedChecked
              ? 'border-accent/30 bg-accent/[0.04]'
              : 'border-border hover:border-foreground/20 hover:bg-surface-accent/50'
          )}
        >
          <input
            type="checkbox"
            checked={detailedChecked}
            onChange={(e) => setDetailedChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent/30"
          />
          <span className="text-sm text-foreground leading-relaxed">
            {t('consent.detailedCheckbox')}
          </span>
        </label>

        {/* Settings hint */}
        <p className="text-xs text-foreground-muted/60 leading-relaxed">
          {t('consent.settingsHint')}{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              (window as any).electronAPI.openExternal('https://bobcorn.caldis.me/privacy.html');
            }}
            className="text-accent hover:text-accent/80 transition-colors"
          >
            {t('consent.privacyLink')}
          </a>
        </p>
      </div>

      {/* Confirm button */}
      <div className="flex justify-end pt-5 pb-1">
        <button
          onClick={handleConfirm}
          className={cn(
            'px-5 py-2 rounded-lg text-sm font-medium',
            'bg-accent text-accent-foreground',
            'hover:bg-accent/90 active:bg-accent/80',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 focus:ring-offset-surface'
          )}
        >
          {t('consent.confirm')}
        </button>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify the component renders without errors**

Start the dev server and manually verify the dialog can be imported. No automated test needed for pure UI components — this will be verified in the MainContainer integration step.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ConsentDialog/index.tsx
git commit -m "feat(analytics): add first-launch consent dialog component"
```

---

### Task 9: Settings Data Sharing Section

**Dependencies:** Task 7 (needs store consent state)

**Files:**
- Modify: `src/renderer/components/SideMenu/SettingsDialog.tsx`

- [ ] **Step 1: Add consent state to SettingsDialog**

In `src/renderer/components/SideMenu/SettingsDialog.tsx`, add imports and state. After the existing `const themeMode = useAppStore(...)` lines (around line 45-46), add:

```typescript
  const analyticsBasic = useAppStore((s: any) => s.analyticsBasicEnabled);
  const analyticsDetailed = useAppStore((s: any) => s.analyticsDetailedEnabled);
  const setAnalyticsConsent = useAppStore((s: any) => s.setAnalyticsConsent);
```

- [ ] **Step 2: Add Data Sharing section**

In `src/renderer/components/SideMenu/SettingsDialog.tsx`, after the AI section closing `</section>` tag and its divider (around lines 551-554), add a new divider + Data Sharing section BEFORE the Version section:

```tsx
        {/* ── Divider ───────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Data Sharing ──────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-foreground-muted/60 mb-2.5'
            )}
          >
            {t('settings.analytics')}
          </h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-3">
                <span className="text-sm text-foreground">{t('settings.analyticsBasic')}</span>
                <p className="text-xs text-foreground-muted/50 mt-0.5">
                  {t('settings.analyticsBasicHint')}
                </p>
              </div>
              <Switch
                checked={analyticsBasic}
                onChange={(v) => setAnalyticsConsent(v, analyticsDetailed)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-3">
                <span className="text-sm text-foreground">{t('settings.analyticsDetailed')}</span>
                <p className="text-xs text-foreground-muted/50 mt-0.5">
                  {t('settings.analyticsDetailedHint')}
                </p>
              </div>
              <Switch
                checked={analyticsDetailed}
                onChange={(v) => setAnalyticsConsent(analyticsBasic, v)}
              />
            </div>
            <p className="text-xs text-foreground-muted/50 pt-1">
              {t('settings.analyticsFooter')}{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  (window as any).electronAPI.openExternal('https://bobcorn.caldis.me/privacy.html');
                }}
                className="text-accent hover:text-accent/80 transition-colors duration-150 cursor-pointer"
              >
                {t('settings.privacyPolicy')}
              </a>
            </p>
          </div>
        </section>
```

- [ ] **Step 3: Verify in dev mode**

Start the app with `npx electron-vite dev`, open Settings, and verify the Data Sharing section renders correctly with two toggles and the privacy policy link.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/SideMenu/SettingsDialog.tsx
git commit -m "feat(analytics): add data sharing section to settings dialog"
```

---

### Task 10: MainContainer Wiring & Feature Integration

**Dependencies:** Tasks 8, 9

**Files:**
- Modify: `src/renderer/containers/MainContainer/index.tsx`

- [ ] **Step 1: Import ConsentDialog and wire it up**

In `src/renderer/containers/MainContainer/index.tsx`:

Add import at the top (with other component imports):

```typescript
import ConsentDialog from '../../components/ConsentDialog';
```

Add state and store selector (with the other store selectors at the component top):

```typescript
  const analyticsConsentShown = useAppStore((s: any) => s.analyticsConsentShown);
  const loadAnalyticsConsent = useAppStore((s: any) => s.loadAnalyticsConsent);
  const [consentDialogVisible, setConsentDialogVisible] = useState(false);
```

Add a useEffect to load consent and show dialog on first launch. Place it after the existing theme initialization useEffect:

```typescript
  // ── Analytics consent ─────────────────────────────────────────
  useEffect(() => {
    loadAnalyticsConsent().then(() => {
      // Show consent dialog if never shown before
      const consent = useAppStore.getState();
      if (!consent.analyticsConsentShown) {
        // Small delay so splash screen is visible first
        setTimeout(() => setConsentDialogVisible(true), 800);
      }
    });
  }, []);
```

- [ ] **Step 2: Render ConsentDialog in the component JSX**

In the `return` block of MainContainer, add `<ConsentDialog>` right before the closing `</div>` (after `TitleBarButtonGroup`, around line 538-539):

```tsx
      {/* Analytics consent dialog — shown once on first launch */}
      <ConsentDialog
        open={consentDialogVisible}
        onClose={() => setConsentDialogVisible(false)}
      />
    </div>
```

- [ ] **Step 3: Add track() calls to existing renderer actions**

In `src/renderer/containers/MainContainer/index.tsx`, find the key user action handlers and add analytics tracking. Import at the top:

```typescript
import { analyticsTrack } from '../../store';
```

Add tracking calls at strategic points:
- After `handleNewProject()` is called → `analyticsTrack('project.create');`
- After `handleOpenProject()` successfully opens a file → `analyticsTrack('project.open');`
- After save operations → `analyticsTrack('project.save');`

Note: These are the renderer-side operations. Other track calls (icon.import, font.generate, etc.) should be added to their respective components/handlers in a follow-up pass. The key operations to cover now are the ones in MainContainer.

- [ ] **Step 4: Verify consent flow**

To test the first-launch consent flow:
1. Delete the `analytics-consent.json` file from the app's userData directory
2. Start the app with `npx electron-vite dev`
3. Verify the consent dialog appears after a brief delay
4. Click confirm, restart app, verify dialog does not appear again

- [ ] **Step 5: Commit**

```bash
git add src/renderer/containers/MainContainer/index.tsx
git commit -m "feat(analytics): wire consent dialog and add track calls to main actions"
```

---

### Task 11: Privacy Policy Page

**Dependencies:** None (independent)

**Files:**
- Create: `docs/privacy.html`

- [ ] **Step 1: Create privacy.html**

Create `docs/privacy.html` as a standalone page styled consistently with the existing `docs/index.html`. The page should be bilingual (EN/ZH), auto-detecting language like the main site.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — Bobcorn</title>
  <link rel="icon" type="image/png" href="https://bobcorn.caldis.me/favicon.png">
  <style>
    :root {
      --bg: #fafafa;
      --fg: #1a1a1a;
      --muted: #666;
      --border: #e5e5e5;
      --accent: #f97316;
      --surface: #fff;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0a0a0a;
        --fg: #e5e5e5;
        --muted: #999;
        --border: #333;
        --surface: #141414;
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--fg);
      line-height: 1.7;
      padding: 3rem 1.5rem;
    }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
    .subtitle { color: var(--muted); font-size: 0.875rem; margin-bottom: 2rem; }
    h2 { font-size: 1.1rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.75rem; }
    p, li { font-size: 0.9375rem; color: var(--fg); margin-bottom: 0.75rem; }
    ul { padding-left: 1.25rem; }
    li { margin-bottom: 0.5rem; }
    .tier-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 0.75rem;
    }
    .tier-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 0.5rem;
    }
    .tier-card ul { margin-bottom: 0; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .back-link {
      display: inline-block;
      margin-bottom: 2rem;
      font-size: 0.875rem;
      color: var(--muted);
    }
    .lang-toggle {
      position: absolute;
      top: 1.5rem;
      right: 1.5rem;
      font-size: 0.8rem;
      color: var(--muted);
      cursor: pointer;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.25rem 0.75rem;
    }
    .lang-toggle:hover { color: var(--fg); border-color: var(--fg); }
    [data-lang="zh"] { display: none; }
    body.zh [data-lang="en"] { display: none; }
    body.zh [data-lang="zh"] { display: block; }
    body.zh [data-lang="zh-inline"] { display: inline; }
    body.zh [data-lang="en-inline"] { display: none; }
    body:not(.zh) [data-lang="zh-inline"] { display: none; }
  </style>
</head>
<body>
  <button class="lang-toggle" onclick="document.body.classList.toggle('zh')">
    <span data-lang="en-inline">中文</span>
    <span data-lang="zh-inline">English</span>
  </button>
  <div class="container">
    <a href="/" class="back-link">&larr; <span data-lang="en-inline">Back to Bobcorn</span><span data-lang="zh-inline">返回 Bobcorn</span></a>

    <!-- English -->
    <div data-lang="en">
      <h1>Privacy Policy</h1>
      <p class="subtitle">Last updated: April 2026</p>

      <h2>What We Collect</h2>
      <div class="tier-card">
        <div class="tier-label">Basic (enabled by default, opt-out)</div>
        <ul>
          <li>App launch count</li>
          <li>Update check / install events</li>
          <li>System info: OS, version, language, screen resolution, architecture</li>
        </ul>
      </div>
      <div class="tier-card">
        <div class="tier-label">Detailed (disabled by default, opt-in)</div>
        <ul>
          <li>Feature usage frequency: import, export, font generation, search, group management</li>
          <li>CLI command usage</li>
        </ul>
      </div>

      <h2>What We Do NOT Collect</h2>
      <ul>
        <li>Project content, SVG data, or file names</li>
        <li>Personal information (name, email, IP address)</li>
        <li>Browsing history or keystrokes</li>
      </ul>

      <h2>Why We Collect</h2>
      <p>To understand which features are most used, which platforms to prioritize, and how to improve the product experience.</p>

      <h2>How We Collect</h2>
      <p>We use <strong>Google Analytics 4</strong> (Measurement Protocol) to receive anonymous events. Each installation is identified by a random UUID that is never linked to your identity.</p>
      <p>All events are also stored locally on your device for up to 90 days.</p>

      <h2>How to Opt Out</h2>
      <p>Go to <strong>Settings → Data Sharing</strong> in the app to toggle data collection on or off at any time.</p>

      <h2>Data Retention</h2>
      <ul>
        <li>Google Analytics: 14 months (Google's default)</li>
        <li>Local device: 90 days (raw events), aggregated summaries kept indefinitely</li>
      </ul>

      <h2>Contact</h2>
      <p>Questions? Open an issue on <a href="https://github.com/nichenqin/bobcorn">GitHub</a>.</p>
    </div>

    <!-- Chinese -->
    <div data-lang="zh">
      <h1>隐私政策</h1>
      <p class="subtitle">最后更新：2026 年 4 月</p>

      <h2>我们收集什么</h2>
      <div class="tier-card">
        <div class="tier-label">基础数据（默认开启，可关闭）</div>
        <ul>
          <li>应用启动次数</li>
          <li>更新检查/安装事件</li>
          <li>系统信息：操作系统、版本、语言、屏幕分辨率、架构</li>
        </ul>
      </div>
      <div class="tier-card">
        <div class="tier-label">详细数据（默认关闭，可开启）</div>
        <ul>
          <li>功能使用频率：导入、导出、字体生成、搜索、分组管理</li>
          <li>CLI 命令使用</li>
        </ul>
      </div>

      <h2>我们不收集什么</h2>
      <ul>
        <li>项目内容、SVG 数据或文件名</li>
        <li>个人信息（姓名、邮箱、IP 地址）</li>
        <li>浏览记录或键盘输入</li>
      </ul>

      <h2>为什么收集</h2>
      <p>为了了解哪些功能最常被使用、优先支持哪些平台，以及如何改进产品体验。</p>

      <h2>如何收集</h2>
      <p>我们使用 <strong>Google Analytics 4</strong>（Measurement Protocol）接收匿名事件。每个安装使用一个随机 UUID 标识，绝不会与你的身份关联。</p>
      <p>所有事件同时存储在你的设备本地，保留 90 天。</p>

      <h2>如何退出</h2>
      <p>打开应用中的 <strong>设置 → 数据共享</strong>，随时开启或关闭数据采集。</p>

      <h2>数据保留</h2>
      <ul>
        <li>Google Analytics：14 个月（Google 默认）</li>
        <li>本地设备：90 天（原始事件），聚合摘要永久保留</li>
      </ul>

      <h2>联系方式</h2>
      <p>有疑问？请在 <a href="https://github.com/nichenqin/bobcorn">GitHub</a> 提交 issue。</p>
    </div>
  </div>
  <script>
    // Auto-detect language
    if (/^zh/i.test(navigator.language)) document.body.classList.add('zh');
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify the page renders correctly**

Open `docs/privacy.html` in a browser. Verify:
- English renders by default (for non-Chinese browsers)
- Language toggle works
- Dark mode responds to system preference
- Links work

- [ ] **Step 3: Commit**

```bash
git add docs/privacy.html
git commit -m "docs: add bilingual privacy policy page"
```

---

### Task 12: Website Updates (Consent Banner + Download Events)

**Dependencies:** Task 11 (privacy page must exist for linking)

**Files:**
- Modify: `docs/index.html`

- [ ] **Step 1: Add download click tracking**

In `docs/index.html`, find the download button (around line 707-708). Add an onclick event to track downloads:

```html
<a id="downloadBtn" href="..." class="btn-download" onclick="gtag('event', 'download_click', { platform: detectPlatform() })">
```

If there isn't already a `detectPlatform()` function, add one in the existing script section:

```javascript
function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('linux')) return 'linux';
  return 'win';
}
```

- [ ] **Step 2: Add privacy policy link to footer**

Find the footer section in `docs/index.html` and add a privacy policy link:

```html
<a href="/privacy.html">Privacy Policy</a>
```

- [ ] **Step 3: Add cookie consent banner**

At the end of `<body>` in `docs/index.html`, before the closing `</body>` tag, add:

```html
<!-- Cookie consent banner -->
<div id="cookieConsent" style="display:none;position:fixed;bottom:0;left:0;right:0;padding:12px 24px;background:var(--bg-secondary,#1a1a1a);border-top:1px solid rgba(255,255,255,0.1);z-index:9999;font-size:13px;color:#ccc;text-align:center;">
  <span data-i18n="cookie-banner-en">This site uses Google Analytics for anonymous visit statistics. By continuing to browse, you agree. </span>
  <a href="/privacy.html" style="color:#f97316;margin-right:12px;">Privacy Policy</a>
  <button onclick="acceptCookies()" style="background:#f97316;color:#fff;border:none;padding:4px 16px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:500;">OK</button>
</div>
<script>
  if (!localStorage.getItem('cookie-consent')) {
    document.getElementById('cookieConsent').style.display = 'block';
  }
  function acceptCookies() {
    localStorage.setItem('cookie-consent', '1');
    document.getElementById('cookieConsent').style.display = 'none';
  }
</script>
```

- [ ] **Step 4: Verify**

Open `docs/index.html` in a browser (or via local server). Verify:
- Cookie banner shows on first visit
- Clicking OK hides it permanently
- Privacy Policy link works
- Download button click triggers GA4 event (check browser DevTools network tab for google-analytics requests)

- [ ] **Step 5: Commit**

```bash
git add docs/index.html
git commit -m "feat(site): add cookie consent banner, download tracking, and privacy link"
```

---

### Task 13: Documentation & Final Verification

**Dependencies:** All previous tasks

**Files:**
- Modify: `docs/CONVENTIONS.md`

- [ ] **Step 1: Add Analytics section to CONVENTIONS.md**

In `docs/CONVENTIONS.md`, add a new section. Find the "Core Operations Layer" section (around line 167) and add the Analytics section before it:

```markdown
## Analytics

All user-facing actions must be tracked through the Analytics Gateway:

1. **Register the event** in `src/core/analytics/catalog.ts` with name, category, tier, and description
2. **Call `analytics.track()`** in the store action or component handler
3. **Choose the correct tier**: `basic` for anonymous counts (opt-out), `detailed` for feature usage (opt-in)

Rules:
- Never call GA4 or write to the analytics store directly — always go through `track()`
- Never include project content, file names, or SVG data in event params
- The `track()` function's TypeScript type ensures only registered events compile
- Local store recording is always on (user's own data); GA4 is gated by consent
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new analytics tests)

- [ ] **Step 3: Build verification**

Run: `npx electron-vite build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add docs/CONVENTIONS.md
git commit -m "docs: add analytics conventions and verify full test suite"
```

---

## Post-Implementation Checklist

After all tasks are complete, verify:

- [ ] `npx vitest run` — all tests pass
- [ ] `npx electron-vite build` — builds without errors
- [ ] First launch shows consent dialog
- [ ] Settings → Data Sharing section works (toggles persist across restart)
- [ ] Privacy policy page accessible at `bobcorn.caldis.me/privacy.html`
- [ ] Website cookie banner shows and dismisses correctly
- [ ] GA4 events visible in GA4 Real-Time report (requires valid API secret)
- [ ] `analytics-data.json` created in userData after first launch
