# Sparkle Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app auto-update system with a bottom-bar indicator, preferences dialog, and dirty-state protection before installing updates.

**Architecture:** electron-updater (already installed) polls GitHub Releases for `latest*.yml`. Main process manages update lifecycle and reads preferences from a JSON file in `userData`. Renderer shows update state via an indicator in the FileMenuBar row, with preferences exposed in the existing SettingsDialog.

**Tech Stack:** electron-updater 6.x, Zustand, React 18, Tailwind CSS, Radix UI, react-i18next, Vitest

**Spec:** `docs/superpowers/specs/2026-04-02-sparkle-auto-update-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/main/update-preferences.ts` | Create | Read/write `userData/update-preferences.json` |
| `src/main/index.ts` | Modify | Rework autoUpdater setup, add IPC handlers |
| `src/preload/index.ts` | Modify | Add 7 new bridge methods |
| `src/renderer/types.d.ts` | Modify | Extend ElectronAPI interface |
| `src/renderer/config/index.ts` | Modify | Add 3 update preference fields to OptionData |
| `src/renderer/store/index.ts` | Modify | Add update state slice |
| `src/renderer/utils/dirtyGuard.ts` | Create | Shared dirty-state check + save prompt |
| `src/renderer/components/SideMenu/UpdateIndicator.tsx` | Create | Bottom-bar update status component |
| `src/renderer/components/SideMenu/SettingsDialog.tsx` | Modify | Add Appearance + Update + Version sections |
| `src/renderer/components/SideMenu/FileMenuBar.tsx` | Modify | Integrate UpdateIndicator in the bar |
| `src/renderer/containers/MainContainer/index.tsx` | Modify | Register update IPC listeners, refactor close-guard to use dirtyGuard |
| `src/locales/zh-CN.json` | Modify | Add ~18 i18n keys |
| `src/locales/en.json` | Modify | Add ~18 i18n keys |
| `.github/workflows/release.yml` | Modify | Add pre-release flag for beta tags |
| `test/unit/store-update.test.ts` | Create | Unit tests for update store slice |
| `test/unit/config-update.test.ts` | Create | Unit tests for new config fields |

---

### Task 1: i18n Keys

All subsequent tasks depend on i18n keys existing. Add them first.

**Files:**
- Modify: `src/locales/zh-CN.json`
- Modify: `src/locales/en.json`
- Test: `test/unit/i18n.test.ts` (existing — validates key parity)

- [ ] **Step 1: Add keys to zh-CN.json**

Add after the existing `settings.*` keys:

```json
  "settings.appearance": "外观",
  "settings.darkMode": "深色模式",
  "settings.update": "更新",
  "settings.autoCheck": "自动检查更新",
  "settings.autoDownload": "发现新版本时自动下载",
  "settings.channel": "更新通道",
  "settings.channelStable": "稳定版",
  "settings.channelBeta": "测试版",
  "settings.version": "版本",

  "update.checking": "检查更新…",
  "update.available": "{{version}} 可用",
  "update.downloading": "{{percent}}%",
  "update.downloaded": "{{version}} 就绪",
  "update.error": "更新失败",
  "update.installTooltip": "点击安装更新",
  "update.downloadTooltip": "点击下载",
  "update.retryTooltip": "点击重试",

  "update.saveAndUpdate": "保存并更新",
  "update.unsavedTitle": "未保存的更改",
  "update.unsavedContent": "安装更新将重启应用。当前项目有未保存的更改。",
```

- [ ] **Step 2: Add matching keys to en.json**

```json
  "settings.appearance": "Appearance",
  "settings.darkMode": "Dark Mode",
  "settings.update": "Updates",
  "settings.autoCheck": "Auto-check for updates",
  "settings.autoDownload": "Auto-download when available",
  "settings.channel": "Update channel",
  "settings.channelStable": "Stable",
  "settings.channelBeta": "Beta",
  "settings.version": "Version",

  "update.checking": "Checking for updates…",
  "update.available": "{{version}} available",
  "update.downloading": "{{percent}}%",
  "update.downloaded": "{{version}} ready",
  "update.error": "Update failed",
  "update.installTooltip": "Click to install update",
  "update.downloadTooltip": "Click to download",
  "update.retryTooltip": "Click to retry",

  "update.saveAndUpdate": "Save & Update",
  "update.unsavedTitle": "Unsaved Changes",
  "update.unsavedContent": "Installing the update will restart the app. You have unsaved changes.",
```

- [ ] **Step 3: Run i18n test to verify key parity**

Run: `npx vitest run test/unit/i18n.test.ts`
Expected: PASS — all keys present in both locales

- [ ] **Step 4: Commit**

```bash
git add src/locales/zh-CN.json src/locales/en.json
git commit -m "feat(i18n): add auto-update and preferences keys"
```

---

### Task 2: Config — Add Update Preference Fields

**Files:**
- Modify: `src/renderer/config/index.ts:20-28` (OptionData interface) and `:52-66` (defOption)
- Modify: `test/unit/config.test.js:78-89` (defOption assertion)
- Create: `test/unit/config-update.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/config-update.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub localStorage (same pattern as config.test.js)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = String(value); }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();
const localStorageProxy = new Proxy(localStorageMock, {
  get(target, prop) {
    if (prop in target) return (target as any)[prop];
    return target.getItem(prop as string) ?? undefined;
  },
  set(target, prop, value) {
    if (prop in target) { (target as any)[prop] = value; return true; }
    target.setItem(prop as string, value);
    return true;
  },
  deleteProperty(target, prop) {
    target.removeItem(prop as string);
    return true;
  },
});
vi.stubGlobal('localStorage', localStorageProxy);
vi.mock('../../src/renderer/utils/tools', () => ({
  decToHex: (n: number) => n.toString(16).toUpperCase(),
}));

const { defOption, getOption, setOption, resetOption } = await import('../../src/renderer/config/index');

describe('update preference fields in config', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    resetOption();
  });

  it('defOption includes autoCheckUpdate=true', () => {
    expect(defOption.autoCheckUpdate).toBe(true);
  });

  it('defOption includes autoDownloadUpdate=false', () => {
    expect(defOption.autoDownloadUpdate).toBe(false);
  });

  it('defOption includes updateChannel=stable', () => {
    expect(defOption.updateChannel).toBe('stable');
  });

  it('getOption returns new defaults', () => {
    const opt = getOption() as any;
    expect(opt.autoCheckUpdate).toBe(true);
    expect(opt.autoDownloadUpdate).toBe(false);
    expect(opt.updateChannel).toBe('stable');
  });

  it('setOption can toggle autoDownloadUpdate', () => {
    setOption({ autoDownloadUpdate: true } as any);
    expect((getOption() as any).autoDownloadUpdate).toBe(true);
  });

  it('setOption can change updateChannel', () => {
    setOption({ updateChannel: 'beta' } as any);
    expect((getOption() as any).updateChannel).toBe('beta');
  });

  it('merges new fields into old localStorage without resetting', () => {
    // Simulate old localStorage without the new fields
    localStorageMock.clear();
    localStorageMock.setItem('option', JSON.stringify({
      iconBlockNameVisible: true,
      iconBlockCodeVisible: false,
      iconBlockSize: 150,
      histProj: [],
      sideMenuWidth: 250,
      sideEditorWidth: 250,
      darkMode: true,
      currentFilePath: '/old/path.icp',
    }));
    const opt = getOption() as any;
    // Old values preserved
    expect(opt.iconBlockCodeVisible).toBe(false);
    expect(opt.iconBlockSize).toBe(150);
    expect(opt.darkMode).toBe(true);
    // New fields merged with defaults
    expect(opt.autoCheckUpdate).toBe(true);
    expect(opt.autoDownloadUpdate).toBe(false);
    expect(opt.updateChannel).toBe('stable');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/config-update.test.ts`
Expected: FAIL — `defOption.autoCheckUpdate` is `undefined`

- [ ] **Step 3: Add fields to OptionData and defOption**

In `src/renderer/config/index.ts`, extend `OptionData` interface (after line 28):

```ts
export interface OptionData {
  iconBlockNameVisible: boolean;
  iconBlockCodeVisible: boolean;
  iconBlockSize: number;
  histProj: string[];
  sideMenuWidth: number;
  sideEditorWidth: number;
  darkMode: boolean;
  currentFilePath: string | null;
  // Update preferences
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
  updateChannel: 'stable' | 'beta';
}
```

Add defaults in `defOption` (after `currentFilePath: null`):

```ts
  currentFilePath: null,
  // Update preferences
  autoCheckUpdate: true,
  autoDownloadUpdate: false,
  updateChannel: 'stable',
```

- [ ] **Step 4: Update the existing config.test.js defOption assertion**

In `test/unit/config.test.js`, update the `defOption` `toEqual` assertion (around line 79) to include the new fields:

```js
  it('has expected default keys', () => {
    expect(defOption).toEqual({
      iconBlockNameVisible: true,
      iconBlockCodeVisible: true,
      iconBlockSize: 100,
      histProj: [],
      sideMenuWidth: 250,
      sideEditorWidth: 250,
      darkMode: false,
      currentFilePath: null,
      autoCheckUpdate: true,
      autoDownloadUpdate: false,
      updateChannel: 'stable',
    });
  });
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run test/unit/config-update.test.ts test/unit/config.test.js`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/config/index.ts test/unit/config-update.test.ts test/unit/config.test.js
git commit -m "feat(config): add update preference fields (autoCheck, autoDownload, channel)"
```

---

### Task 3: Store — Update State Slice

**Files:**
- Modify: `src/renderer/store/index.ts:7-60` (State + Actions interfaces, store initializer)
- Create: `test/unit/store-update.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/store-update.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('update state slice', () => {
  let store: any;

  beforeEach(async () => {
    const { create } = await import('zustand');
    // Minimal reproduction of the update slice
    store = create((set: any, get: any) => ({
      updateStatus: 'idle' as 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error',
      updateVersion: null as string | null,
      updateProgress: 0,
      updateError: null as string | null,
      setUpdateStatus: (status: string, version?: string) => {
        set({
          updateStatus: status,
          ...(version !== undefined ? { updateVersion: version } : {}),
          ...(status === 'idle' ? { updateVersion: null, updateProgress: 0, updateError: null } : {}),
        });
      },
      setUpdateProgress: (percent: number) => set({ updateProgress: percent }),
      setUpdateError: (error: string | null) => set({ updateError: error }),
    }));
  });

  it('starts with idle status', () => {
    const s = store.getState();
    expect(s.updateStatus).toBe('idle');
    expect(s.updateVersion).toBeNull();
    expect(s.updateProgress).toBe(0);
    expect(s.updateError).toBeNull();
  });

  it('setUpdateStatus("checking") transitions to checking', () => {
    store.getState().setUpdateStatus('checking');
    expect(store.getState().updateStatus).toBe('checking');
  });

  it('setUpdateStatus("available", "1.8.0") stores version', () => {
    store.getState().setUpdateStatus('available', '1.8.0');
    const s = store.getState();
    expect(s.updateStatus).toBe('available');
    expect(s.updateVersion).toBe('1.8.0');
  });

  it('setUpdateProgress updates percent', () => {
    store.getState().setUpdateStatus('downloading');
    store.getState().setUpdateProgress(42);
    expect(store.getState().updateProgress).toBe(42);
  });

  it('setUpdateStatus("downloaded") preserves version', () => {
    store.getState().setUpdateStatus('available', '1.8.0');
    store.getState().setUpdateStatus('downloaded');
    const s = store.getState();
    expect(s.updateStatus).toBe('downloaded');
    expect(s.updateVersion).toBe('1.8.0');
  });

  it('setUpdateError stores error message', () => {
    store.getState().setUpdateError('Network error');
    expect(store.getState().updateError).toBe('Network error');
  });

  it('setUpdateStatus("idle") resets all update state', () => {
    store.getState().setUpdateStatus('available', '1.8.0');
    store.getState().setUpdateProgress(50);
    store.getState().setUpdateError('some error');
    store.getState().setUpdateStatus('idle');
    const s = store.getState();
    expect(s.updateStatus).toBe('idle');
    expect(s.updateVersion).toBeNull();
    expect(s.updateProgress).toBe(0);
    expect(s.updateError).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it passes (slice is standalone)**

Run: `npx vitest run test/unit/store-update.test.ts`
Expected: PASS (test creates its own Zustand store with the slice)

- [ ] **Step 3: Add update slice to the real store**

In `src/renderer/store/index.ts`, add to `State` interface (after line 31, before the closing `}`):

```ts
  // Update state (UI only, not persisted)
  updateStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  updateVersion: string | null;
  updateProgress: number;
  updateError: string | null;
```

Add to `Actions` interface (after line 59, before the closing `}`):

```ts
  // Update actions
  setUpdateStatus: (status: State['updateStatus'], version?: string) => void;
  setUpdateProgress: (percent: number) => void;
  setUpdateError: (error: string | null) => void;
```

Add to the store initializer (after `isDirty: false,` around line 84):

```ts
  // Update state
  updateStatus: 'idle',
  updateVersion: null,
  updateProgress: 0,
  updateError: null,
```

Add actions (after `markClean` around line 206, before the closing `}));`):

```ts
  // Update actions
  setUpdateStatus: (status, version?) => {
    set({
      updateStatus: status,
      ...(version !== undefined ? { updateVersion: version } : {}),
      ...(status === 'idle' ? { updateVersion: null, updateProgress: 0, updateError: null } : {}),
    });
  },
  setUpdateProgress: (percent) => set({ updateProgress: percent }),
  setUpdateError: (error) => set({ updateError: error }),
```

- [ ] **Step 4: Run all store tests**

Run: `npx vitest run test/unit/store-update.test.ts test/unit/store-dirty.test.ts test/unit/store.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/index.ts test/unit/store-update.test.ts
git commit -m "feat(store): add update state slice (status, version, progress, error)"
```

---

### Task 4: Types + Preload — Extend ElectronAPI Bridge

**Files:**
- Modify: `src/renderer/types.d.ts:63-66` (existing auto-update section)
- Modify: `src/preload/index.ts:74-81` (existing auto-update section)

- [ ] **Step 1: Extend ElectronAPI types**

In `src/renderer/types.d.ts`, replace the existing auto-update section (lines 63-66):

```ts
  // Auto-update
  onUpdateChecking: (callback: () => void) => () => void;
  onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
  onUpdateProgress: (callback: (info: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (callback: () => void) => () => void;
  onUpdateError: (callback: (info: { message: string }) => void) => () => void;
  installUpdate: () => void;
  checkForUpdate: () => void;
  downloadUpdate: () => void;
  setUpdateChannel: (channel: 'stable' | 'beta') => void;
  syncUpdatePreferences: (prefs: { autoCheckUpdate: boolean; autoDownloadUpdate: boolean; updateChannel: 'stable' | 'beta' }) => void;
```

- [ ] **Step 2: Update preload bridge**

In `src/preload/index.ts`, replace lines 74-81 (the existing auto-update section):

```ts
  // Auto-update
  onUpdateChecking: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('update-checking', handler);
    return () => { ipcRenderer.removeListener('update-checking', handler); };
  },
  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    const handler = (_event: IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => { ipcRenderer.removeListener('update-available', handler); };
  },
  onUpdateProgress: (callback: (info: { percent: number }) => void) => {
    const handler = (_event: IpcRendererEvent, info: { percent: number }) => callback(info);
    ipcRenderer.on('update-progress', handler);
    return () => { ipcRenderer.removeListener('update-progress', handler); };
  },
  onUpdateDownloaded: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('update-downloaded', handler);
    return () => { ipcRenderer.removeListener('update-downloaded', handler); };
  },
  onUpdateError: (callback: (info: { message: string }) => void) => {
    const handler = (_event: IpcRendererEvent, info: { message: string }) => callback(info);
    ipcRenderer.on('update-error', handler);
    return () => { ipcRenderer.removeListener('update-error', handler); };
  },
  installUpdate: (): void => ipcRenderer.send('install-update'),
  checkForUpdate: (): void => ipcRenderer.send('check-for-update'),
  downloadUpdate: (): void => ipcRenderer.send('download-update'),
  setUpdateChannel: (channel: 'stable' | 'beta'): void => ipcRenderer.send('set-update-channel', { channel }),
  syncUpdatePreferences: (prefs: { autoCheckUpdate: boolean; autoDownloadUpdate: boolean; updateChannel: 'stable' | 'beta' }): void => ipcRenderer.send('sync-update-preferences', prefs),
```

- [ ] **Step 3: Build to verify types compile**

Run: `npx electron-vite build`
Expected: Clean build, no type errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/types.d.ts src/preload/index.ts
git commit -m "feat(ipc): extend ElectronAPI with update bridge methods"
```

---

### Task 5: Main Process — Update Preferences + autoUpdater Rework

**Files:**
- Create: `src/main/update-preferences.ts`
- Modify: `src/main/index.ts:11,235-250` (autoUpdater section)

- [ ] **Step 1: Create update-preferences.ts**

Create `src/main/update-preferences.ts`:

```ts
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface UpdatePreferences {
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
  updateChannel: 'stable' | 'beta';
}

const DEFAULTS: UpdatePreferences = {
  autoCheckUpdate: true,
  autoDownloadUpdate: false,
  updateChannel: 'stable',
};

function getPrefsPath(): string {
  return path.join(app.getPath('userData'), 'update-preferences.json');
}

export function readUpdatePreferences(): UpdatePreferences {
  try {
    const raw = fs.readFileSync(getPrefsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeUpdatePreferences(prefs: Partial<UpdatePreferences>): void {
  const current = readUpdatePreferences();
  const merged = { ...current, ...prefs };
  fs.writeFileSync(getPrefsPath(), JSON.stringify(merged, null, 2), 'utf-8');
}
```

- [ ] **Step 2: Rework main process autoUpdater**

In `src/main/index.ts`, replace the entire auto-update section (lines 235-250) with:

```ts
    // ── Auto-update ───────────────────────────────────────────────
    import { readUpdatePreferences, writeUpdatePreferences } from './update-preferences';

    const prefs = readUpdatePreferences();
    autoUpdater.autoDownload = prefs.autoDownloadUpdate;
    autoUpdater.allowPrerelease = prefs.updateChannel === 'beta';
    autoUpdater.autoInstallOnAppQuit = true;

    // Forward autoUpdater events to renderer
    autoUpdater.on('checking-for-update', () => {
      mainWindow?.webContents.send('update-checking');
    });
    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update-available', { version: info.version });
    });
    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('update-progress', { percent: Math.round(progress.percent) });
    });
    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update-downloaded');
    });
    autoUpdater.on('error', (err) => {
      mainWindow?.webContents.send('update-error', { message: err?.message || 'Unknown error' });
    });

    // IPC handlers from renderer
    ipcMain.on('check-for-update', () => {
      autoUpdater.checkForUpdates().catch(() => {});
    });
    ipcMain.on('download-update', () => {
      autoUpdater.downloadUpdate().catch(() => {});
    });
    ipcMain.on('install-update', () => {
      autoUpdater.quitAndInstall();
    });
    ipcMain.on('set-update-channel', (_event, { channel }: { channel: 'stable' | 'beta' }) => {
      autoUpdater.allowPrerelease = channel === 'beta';
      writeUpdatePreferences({ updateChannel: channel });
      autoUpdater.checkForUpdates().catch(() => {});
    });
    ipcMain.on('sync-update-preferences', (_event, incoming: any) => {
      writeUpdatePreferences(incoming);
      autoUpdater.autoDownload = incoming.autoDownloadUpdate ?? autoUpdater.autoDownload;
      if (incoming.updateChannel) {
        autoUpdater.allowPrerelease = incoming.updateChannel === 'beta';
      }
    });

    // Only auto-check in production
    if (process.env.NODE_ENV !== 'development' && prefs.autoCheckUpdate) {
      autoUpdater.checkForUpdates().catch(() => {});
    }
```

**Important:** Move the `import` for `update-preferences` to the top of the file (with other imports), not inline. The code above shows it inline for context only.

Also remove the old `autoUpdater.checkForUpdatesAndNotify()` call and the old event listeners (lines 239-250).

- [ ] **Step 3: Build to verify compilation**

Run: `npx electron-vite build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add src/main/update-preferences.ts src/main/index.ts
git commit -m "feat(main): rework autoUpdater with preferences, IPC handlers, and channel support"
```

---

### Task 6: dirtyGuard Utility

**Files:**
- Create: `src/renderer/utils/dirtyGuard.ts`

- [ ] **Step 1: Create dirtyGuard.ts**

```ts
import useAppStore from '../store';
import { confirm } from '../components/ui/dialog';
import i18n from '../i18n';

/**
 * Check if the project has unsaved changes. If dirty, prompt the user
 * to save before proceeding. Returns true if safe to continue.
 *
 * @param opts.saveHandler — the save function (returns Promise, rejects on failure)
 * @param opts.title — dialog title override (default: update.unsavedTitle)
 * @param opts.content — dialog content override (default: update.unsavedContent)
 * @param opts.okText — OK button text override (default: update.saveAndUpdate)
 */
export async function guardDirtyState(opts: {
  saveHandler: () => Promise<void>;
  title?: string;
  content?: string;
  okText?: string;
}): Promise<boolean> {
  const { isDirty } = useAppStore.getState();
  if (!isDirty) return true;

  const t = i18n.t.bind(i18n);
  return new Promise<boolean>((resolve) => {
    confirm({
      title: opts.title ?? t('update.unsavedTitle'),
      content: opts.content ?? t('update.unsavedContent'),
      okText: opts.okText ?? t('update.saveAndUpdate'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await opts.saveHandler();
          resolve(true);
        } catch {
          resolve(false);
        }
      },
      onCancel: () => resolve(false),
    });
  });
}
```

- [ ] **Step 2: Build to verify**

Run: `npx electron-vite build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/renderer/utils/dirtyGuard.ts
git commit -m "feat(utils): add guardDirtyState shared utility"
```

---

### Task 7: UpdateIndicator Component

**Files:**
- Create: `src/renderer/components/SideMenu/UpdateIndicator.tsx`

- [ ] **Step 1: Create UpdateIndicator.tsx**

```tsx
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../store';
import { cn } from '../../lib/utils';

const { electronAPI } = window;

function UpdateIndicator({ onInstall }: { onInstall: () => void }) {
  const { t } = useTranslation();
  const status = useAppStore((s) => s.updateStatus);
  const version = useAppStore((s) => s.updateVersion);
  const progress = useAppStore((s) => s.updateProgress);
  const pulseRef = useRef<HTMLSpanElement>(null);

  // Single-round pulse: remove animation class after one cycle
  useEffect(() => {
    if (status !== 'available' || !pulseRef.current) return;
    const el = pulseRef.current;
    const handler = () => {
      el.classList.remove('animate-pulse');
    };
    el.addEventListener('animationiteration', handler, { once: true });
    return () => el.removeEventListener('animationiteration', handler);
  }, [status]);

  if (status === 'idle') return null;

  const isClickable = status === 'available' || status === 'downloaded' || status === 'error';

  const handleClick = () => {
    if (status === 'available') {
      electronAPI.downloadUpdate();
    } else if (status === 'downloaded') {
      onInstall();
    } else if (status === 'error') {
      electronAPI.checkForUpdate();
    }
  };

  const tooltip =
    status === 'available'
      ? t('update.downloadTooltip')
      : status === 'downloaded'
        ? t('update.installTooltip')
        : status === 'error'
          ? t('update.retryTooltip')
          : undefined;

  return (
    <button
      onClick={isClickable ? handleClick : undefined}
      title={tooltip}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md',
        'text-[11px] text-foreground-muted',
        'transition-colors duration-150',
        isClickable && 'cursor-pointer hover:bg-surface-accent hover:text-foreground',
        !isClickable && 'cursor-default'
      )}
    >
      {/* Status dot */}
      {status === 'available' && (
        <span
          ref={pulseRef}
          className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse"
        />
      )}
      {status === 'downloaded' && (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
      )}
      {status === 'error' && (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
      )}

      {/* Progress bar for downloading */}
      {status === 'downloading' && (
        <span className="inline-block w-12 h-0.5 rounded-full bg-surface-accent overflow-hidden">
          <span
            className="block h-full bg-brand-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </span>
      )}

      {/* Label */}
      <span>
        {status === 'checking' && t('update.checking')}
        {status === 'available' && t('update.available', { version: `v${version}` })}
        {status === 'downloading' && t('update.downloading', { percent: progress })}
        {status === 'downloaded' && t('update.downloaded', { version: `v${version}` })}
        {status === 'error' && t('update.error')}
      </span>
    </button>
  );
}

export default React.memo(UpdateIndicator);
```

- [ ] **Step 2: Build to verify**

Run: `npx electron-vite build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SideMenu/UpdateIndicator.tsx
git commit -m "feat(ui): add UpdateIndicator component for bottom bar"
```

---

### Task 8: FileMenuBar — Integrate UpdateIndicator

**Files:**
- Modify: `src/renderer/components/SideMenu/FileMenuBar.tsx:136-179` (the bar's JSX)

- [ ] **Step 1: Add import and onInstall prop**

At the top of `FileMenuBar.tsx`, add imports:

```ts
import UpdateIndicator from './UpdateIndicator';
```

Add to `FileMenuBarProps`:

```ts
interface FileMenuBarProps {
  onMenuAction: (key: string) => void;
  onInstallUpdate: () => void;
}
```

Update the component signature:

```ts
const FileMenuBar = React.memo(function FileMenuBar({ onMenuAction, onInstallUpdate }: FileMenuBarProps) {
```

- [ ] **Step 2: Add UpdateIndicator to the bar**

In the JSX, inside the `<div className="flex shrink-0 items-center border-t ...">`, after the `<button>` for `[文件]`, add the indicator:

```tsx
      <div className="flex shrink-0 items-center border-t border-border px-2.5 h-[42px]">
        <button
          ref={triggerRef}
          onClick={() => setOpen(!open)}
          {/* ... existing button content ... */}
        </button>
        <UpdateIndicator onInstall={onInstallUpdate} />
      </div>
```

Note: `UpdateIndicator` uses `ml-auto` internally... actually it doesn't. We need to add a spacer. Wrap the indicator with a div:

```tsx
        <div className="ml-auto">
          <UpdateIndicator onInstall={onInstallUpdate} />
        </div>
```

- [ ] **Step 3: Build to verify**

Run: `npx electron-vite build`
Expected: Build will fail because `SideMenu/index.tsx` doesn't pass `onInstallUpdate` yet — that's expected. Fix in Task 10.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/SideMenu/FileMenuBar.tsx
git commit -m "feat(ui): integrate UpdateIndicator into FileMenuBar"
```

---

### Task 9: SettingsDialog — Add Update Preferences

**Files:**
- Modify: `src/renderer/components/SideMenu/SettingsDialog.tsx`

- [ ] **Step 1: Add update preference controls**

Add imports at the top:

```ts
import { Switch } from '../ui/switch';
import { getOption, setOption } from '../../config';
import type { OptionData } from '../../config';
```

Add state for update preferences inside the component (after the prefix state):

```ts
  const opts = getOption() as OptionData;
  const [autoCheck, setAutoCheck] = useState(opts.autoCheckUpdate);
  const [autoDownload, setAutoDownload] = useState(opts.autoDownloadUpdate);
  const [channel, setChannel] = useState<'stable' | 'beta'>(opts.updateChannel);
  const darkMode = useAppStore((s: any) => s.darkMode);
  const toggleDarkMode = useAppStore((s: any) => s.toggleDarkMode);

  const syncPrefsToMain = (updates: Partial<OptionData>) => {
    setOption(updates);
    const current = getOption() as OptionData;
    (window as any).electronAPI.syncUpdatePreferences({
      autoCheckUpdate: current.autoCheckUpdate,
      autoDownloadUpdate: current.autoDownloadUpdate,
      updateChannel: current.updateChannel,
    });
  };
```

After the existing Font Prefix `</section>` and before the closing `</div>`, add:

```tsx
        {/* ── Divider ───────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Appearance ──────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-foreground-muted/60 mb-2.5'
            )}
          >
            {t('settings.appearance')}
          </h4>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">{t('settings.darkMode')}</span>
            <Switch checked={darkMode} onChange={() => toggleDarkMode()} />
          </div>
        </section>

        {/* ── Divider ───────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Update ─────────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-foreground-muted/60 mb-2.5'
            )}
          >
            {t('settings.update')}
          </h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{t('settings.autoCheck')}</span>
              <Switch
                checked={autoCheck}
                onChange={(v) => {
                  setAutoCheck(v);
                  syncPrefsToMain({ autoCheckUpdate: v });
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{t('settings.autoDownload')}</span>
              <Switch
                checked={autoDownload}
                onChange={(v) => {
                  setAutoDownload(v);
                  syncPrefsToMain({ autoDownloadUpdate: v });
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{t('settings.channel')}</span>
              <select
                value={channel}
                onChange={(e) => {
                  const val = e.target.value as 'stable' | 'beta';
                  setChannel(val);
                  syncPrefsToMain({ updateChannel: val });
                  (window as any).electronAPI.setUpdateChannel(val);
                }}
                className={cn(
                  'px-2 py-1 rounded-md text-sm',
                  'border border-border bg-surface text-foreground',
                  'focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/30',
                  'transition-colors duration-150',
                  'cursor-pointer'
                )}
              >
                <option value="stable">{t('settings.channelStable')}</option>
                <option value="beta">{t('settings.channelBeta')}</option>
              </select>
            </div>
          </div>
        </section>

        {/* ── Divider ───────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Version ────────────────────────────────── */}
        <section>
          <h4
            className={cn(
              'text-[11px] font-semibold uppercase tracking-widest',
              'text-foreground-muted/60 mb-2.5'
            )}
          >
            {t('settings.version')}
          </h4>
          <p className="text-sm text-foreground-muted">
            Bobcorn v{(window as any).electronAPI?.getAppPath ? __APP_VERSION__ : '—'}
          </p>
        </section>
```

**Note:** For the version display, we need to inject the app version at build time. The simplest approach: use `import.meta.env.PACKAGE_VERSION` or define it in `electron.vite.config.js`. A simpler option: just read it from `require('../../../package.json').version` — but in the renderer (bundled), the cleanest way is a Vite `define`:

In `electron.vite.config.js`, in the `renderer` config, add to the existing `define`:

```js
    define: {
      'global': 'globalThis',
      '__APP_VERSION__': JSON.stringify(require('./package.json').version),
    },
```

And in the component, replace the version line with:

```tsx
          <p className="text-sm text-foreground-muted">
            Bobcorn v{__APP_VERSION__}
          </p>
```

Add a type declaration in `types.d.ts`:

```ts
declare const __APP_VERSION__: string;
```

- [ ] **Step 2: Build to verify**

Run: `npx electron-vite build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SideMenu/SettingsDialog.tsx electron.vite.config.js src/renderer/types.d.ts
git commit -m "feat(settings): add appearance, update preferences, and version sections"
```

---

### Task 10: MainContainer + SideMenu Wiring

**Files:**
- Modify: `src/renderer/containers/MainContainer/index.tsx`
- Modify: `src/renderer/components/SideMenu/index.tsx`

- [ ] **Step 1: Register update IPC listeners in MainContainer**

In `MainContainer/index.tsx`, add import:

```ts
import { guardDirtyState } from '../../utils/dirtyGuard';
```

Add a new `useEffect` for update IPC (after the language sync effect, around line 383):

```ts
  // ── Auto-update IPC ──────────────────────────────────────────
  useEffect(() => {
    const cleanups = [
      electronAPI.onUpdateChecking(() => {
        useAppStore.getState().setUpdateStatus('checking');
      }),
      electronAPI.onUpdateAvailable((info) => {
        useAppStore.getState().setUpdateStatus('available', info.version);
      }),
      electronAPI.onUpdateProgress((info) => {
        useAppStore.getState().setUpdateStatus('downloading');
        useAppStore.getState().setUpdateProgress(info.percent);
      }),
      electronAPI.onUpdateDownloaded(() => {
        useAppStore.getState().setUpdateStatus('downloaded');
      }),
      electronAPI.onUpdateError((info) => {
        useAppStore.getState().setUpdateStatus('error');
        useAppStore.getState().setUpdateError(info.message);
      }),
    ];
    return () => cleanups.forEach((fn) => fn());
  }, []);
```

Create the install handler that uses `guardDirtyState`:

```ts
  const handleInstallUpdate = useCallback(async () => {
    const canProceed = await guardDirtyState({
      saveHandler: handleSave,
    });
    if (canProceed) {
      electronAPI.installUpdate();
    }
  }, [handleSave]);
```

Expose the handler via a custom event (so SideMenu can receive it without prop drilling):

```ts
  // Expose install-update handler as a custom event for SideMenu
  useEffect(() => {
    const handler = () => handleInstallUpdate();
    window.addEventListener('bobcorn:install-update', handler);
    return () => window.removeEventListener('bobcorn:install-update', handler);
  }, [handleInstallUpdate]);
```

- [ ] **Step 2: Wire SideMenu → FileMenuBar**

In `src/renderer/components/SideMenu/index.tsx`, update the `FileMenuBar` usage (line 151):

```tsx
      <FileMenuBar
        onMenuAction={handleFileMenuAction}
        onInstallUpdate={() => window.dispatchEvent(new CustomEvent('bobcorn:install-update'))}
      />
```

- [ ] **Step 3: Refactor close-guard to use guardDirtyState**

In `MainContainer/index.tsx`, refactor the close guard `useEffect` (lines 333-375) to reuse `guardDirtyState`. Replace the `onConfirmClose` callback body:

```ts
  useEffect(() => {
    const cleanup = electronAPI.onConfirmClose(async () => {
      const dirty = useAppStore.getState().isDirty;
      if (!dirty) {
        electronAPI.confirmClose();
        return;
      }
      const canProceed = await guardDirtyState({
        saveHandler: handleSave,
        title: t('file.unsavedTitle'),
        content: t('file.unsavedCloseContent'),
        okText: t('file.saveAndClose'),
      });
      if (canProceed) {
        electronAPI.confirmClose();
      } else {
        electronAPI.closeCancelled();
      }
    });

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useAppStore.getState().isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      cleanup();
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [handleSave, t]);
```

- [ ] **Step 4: Build to verify everything compiles**

Run: `npx electron-vite build`
Expected: Clean build

- [ ] **Step 5: Run all unit tests**

Run: `npx vitest run`
Expected: All existing + new tests pass

- [ ] **Step 6: Commit**

```bash
git add src/renderer/containers/MainContainer/index.tsx src/renderer/components/SideMenu/index.tsx
git commit -m "feat: wire update IPC listeners, dirtyGuard, and install handler"
```

---

### Task 11: CI — Beta Pre-release Flag

**Files:**
- Modify: `.github/workflows/release.yml:186`

- [ ] **Step 1: Add pre-release detection**

In `.github/workflows/release.yml`, replace the `gh release create` line (line 186):

```yaml
          # Detect beta/alpha tags and mark as pre-release
          PRERELEASE_FLAG=""
          if [[ "${TAG}" == *"-beta"* || "${TAG}" == *"-alpha"* ]]; then
            PRERELEASE_FLAG="--prerelease"
          fi

          # Create fresh release
          gh release create "${TAG}" ${PRERELEASE_FLAG} --title "${TAG#v}" --notes-file changelog.md
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: mark beta/alpha tags as pre-release on GitHub"
```

---

### Task 12: Integration Smoke Test

- [ ] **Step 1: Build**

Run: `npx electron-vite build`
Expected: Clean build, no errors

- [ ] **Step 2: Run full unit test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new)

- [ ] **Step 3: Manual dev verification**

Run: `npx electron-vite dev`

Verify:
1. App launches without errors
2. Bottom bar shows `[文件]` button on the left — no update indicator visible (idle state)
3. Open Settings dialog → verify new sections: Appearance (dark mode toggle), Update (3 controls), Version
4. Toggle dark mode from settings → works
5. Toggling auto-check/auto-download switches → no errors in devtools console
6. Channel dropdown switches between 稳定版/测试版

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat: sparkle auto-update — indicator, preferences, dirty guard, beta channel"
```
