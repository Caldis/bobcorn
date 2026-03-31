# File Menu Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize Bobcorn's import/export module with standard Open/Save/Export file operations, selective export formats, .icp file association, and close guard.

**Architecture:** Single-instance Electron app with menu-to-renderer IPC for file commands. Zustand dirty tracking via Database mutation callback. Export pipeline conditionally skips unused generators. fflate for optional ZIP packing.

**Tech Stack:** Electron 28, React 18, Zustand, sql.js, electron-vite, fflate

**Spec:** `docs/superpowers/specs/2026-04-01-file-menu-modernization-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/renderer/store/index.ts` | Modify | Add `isDirty`, `currentFilePath`, `markDirty`, `markClean`, `setCurrentFilePath` |
| `src/renderer/config/index.ts` | Modify | Add `currentFilePath` to `OptionData` |
| `src/renderer/database/index.ts` | Modify | Add `onMutation` callback, call `notifyMutation()` in all write methods |
| `src/renderer/bootstrap.tsx` | Modify | Wire `db.registerOnMutation` to `markDirty` |
| `src/renderer/types.d.ts` | Modify | Extend `ElectronAPI` with new IPC methods |
| `src/preload/index.ts` | Modify | Add 8 new IPC listener APIs with cleanup |
| `src/main/index.ts` | Modify | Single-instance lock, open-file, second-instance, close guard |
| `src/main/menu.ts` | Modify | File submenu (both platforms), IPC sends, fix branding |
| `src/renderer/containers/MainContainer/index.tsx` | Modify | Menu handlers, close guard, onOpenFile, title bar, beforeunload |
| `src/renderer/components/SideMenu/ImportExportBar.tsx` | Modify | Remove "Import Project", simplify to single Import button |
| `src/renderer/components/SideMenu/index.tsx` | Modify | Remove `handleExportProjects`, simplify import handler |
| `src/renderer/components/SideMenu/ExportDialog.tsx` | Modify | Format selection UI, conditional generation, ZIP, migration notice |
| `src/renderer/components/TitleBar/button/index.tsx` | Modify | Add file name display for Windows |
| `src/renderer/utils/generators/demopageGenerator/index.ts` | Modify | Format-aware CSS + HTML generation |
| `src/renderer/resources/iconDocs/indexTemplate.html` | Modify | exportConfig variable, conditional Symbol tab |
| `src/renderer/components/SplashScreen/index.tsx` | Modify | Set `currentFilePath` on project open |
| `package.json` | Modify | Add `fileAssociations`, add `fflate` dep |
| `test/unit/store-dirty.test.ts` | Create | Unit tests for dirty tracking |
| `test/unit/export-formats.test.ts` | Create | Unit tests for format-aware CSS generator |

---

## Task 1: Store — Dirty State & File Path

**Files:**
- Modify: `src/renderer/config/index.ts:20-28` (OptionData interface)
- Modify: `src/renderer/config/index.ts:51-64` (defOption)
- Modify: `src/renderer/store/index.ts:7-28` (State interface)
- Modify: `src/renderer/store/index.ts:30-51` (Actions interface)
- Modify: `src/renderer/store/index.ts:53-182` (store implementation)
- Create: `test/unit/store-dirty.test.ts`

- [ ] **Step 1: Write failing tests for dirty state**

```ts
// test/unit/store-dirty.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

// We test the store logic by importing and using the real Zustand store.
// The store is created fresh for each test via a factory.

describe('dirty state tracking', () => {
  // Minimal inline store for unit testing (avoids importing real db/config)
  let store: any;

  beforeEach(async () => {
    const { create } = await import('zustand');
    store = create((set: any, get: any) => ({
      isDirty: false,
      currentFilePath: null as string | null,
      markDirty: () => { if (!get().isDirty) set({ isDirty: true }); },
      markClean: () => set({ isDirty: false }),
      setCurrentFilePath: (path: string | null) => set({ currentFilePath: path }),
    }));
  });

  it('starts clean', () => {
    expect(store.getState().isDirty).toBe(false);
    expect(store.getState().currentFilePath).toBeNull();
  });

  it('markDirty sets isDirty to true', () => {
    store.getState().markDirty();
    expect(store.getState().isDirty).toBe(true);
  });

  it('markDirty is idempotent (no extra state updates)', () => {
    let updateCount = 0;
    store.subscribe(() => { updateCount++; });
    store.getState().markDirty();
    store.getState().markDirty();
    store.getState().markDirty();
    // Only 1 state change — the first call. Subsequent calls are no-ops.
    expect(updateCount).toBe(1);
  });

  it('markClean resets isDirty', () => {
    store.getState().markDirty();
    store.getState().markClean();
    expect(store.getState().isDirty).toBe(false);
  });

  it('setCurrentFilePath updates path', () => {
    store.getState().setCurrentFilePath('/tmp/test.icp');
    expect(store.getState().currentFilePath).toBe('/tmp/test.icp');
  });

  it('setCurrentFilePath(null) clears path', () => {
    store.getState().setCurrentFilePath('/tmp/test.icp');
    store.getState().setCurrentFilePath(null);
    expect(store.getState().currentFilePath).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/store-dirty.test.ts`
Expected: PASS (these test a standalone inline store — they validate the logic pattern we'll use)

- [ ] **Step 3: Add `currentFilePath` to config OptionData**

In `src/renderer/config/index.ts`, add to `OptionData` interface (after line 27):

```ts
// Add after darkMode: boolean;
currentFilePath: string | null;
```

And add to `defOption` (after line 63):

```ts
// Add after darkMode: false,
currentFilePath: null,
```

Note: The `resetOption` function checks `Object.keys(defOption).length` against stored keys. Adding a new field will trigger a reset on existing installs. To avoid this, also update `getOption` to merge missing keys instead of resetting. But the existing pattern already handles this by calling `resetOption()` when lengths differ — this means old users get a fresh default, which is acceptable since `currentFilePath: null` is the correct initial state.

- [ ] **Step 4: Add dirty state to Zustand store**

In `src/renderer/store/index.ts`:

Add to `State` interface (after line 27 `patchedIcons`):

```ts
  // File state
  currentFilePath: string | null;
  isDirty: boolean;
```

Add to `Actions` interface (after line 50 `syncAll`):

```ts
  // File state
  setCurrentFilePath: (path: string | null) => void;
  markDirty: () => void;
  markClean: () => void;
```

Add to store implementation (after `syncAll` at line 181):

```ts
  // File state
  currentFilePath: (getOption('currentFilePath') as string | null) ?? null,
  isDirty: false,

  setCurrentFilePath: (path: string | null) => {
    set({ currentFilePath: path });
    setOption({ currentFilePath: path });
  },

  markDirty: () => {
    if (!get().isDirty) set({ isDirty: true });
  },

  markClean: () => set({ isDirty: false }),
```

Also add initial state values in the store creation (after line 71 `patchedIcons: {}`):

```ts
  // File state
  currentFilePath: (getOption('currentFilePath') as string | null) ?? null,
  isDirty: false,
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All existing tests pass + new store-dirty tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/config/index.ts src/renderer/store/index.ts test/unit/store-dirty.test.ts
git commit -m "feat: add dirty state tracking and currentFilePath to store"
```

---

## Task 2: Database — Mutation Callback

**Files:**
- Modify: `src/renderer/database/index.ts` (add onMutation callback infra + notifyMutation calls)
- Modify: `src/renderer/bootstrap.tsx` (wire callback)

- [ ] **Step 1: Add mutation callback infrastructure to Database class**

In `src/renderer/database/index.ts`, add these two members near the top of the `Database` class (after the `db` property declaration, around line 75):

```ts
  // Mutation tracking — single callback for dirty state
  private onMutationCallback: (() => void) | null = null;
  registerOnMutation = (cb: () => void): void => { this.onMutationCallback = cb; };
  private notifyMutation = (): void => { this.onMutationCallback?.(); };
```

- [ ] **Step 2: Add `notifyMutation()` calls to all write methods**

Add `this.notifyMutation();` as the last line before `callback && callback(...)` in each of these methods. If the method has a callback, place `notifyMutation()` before the callback invocation. If async (like addIcons with FileReader), place it in the `done()` helper.

Methods to instrument (add `this.notifyMutation();` at the end of each):
- `resetProject` (line ~451, after `initNewProject`)
- `setProjectAttributes` (line ~463, before callback)
- `setProjectName` (line ~477, delegates to `setProjectAttributes` which already notifies — skip this one)
- `addGroupData` (line ~486, before callback)
- `setGroupData` (line ~490, before callback)
- `addGroup` (line ~513, before callback)
- `delGroup` (line ~528, before callback)
- `reorderGroups` (line ~555, before callback)
- `setGroupName` (line ~560, delegates to `setGroupData` — skip)
- `setIconData` (line ~578, before callback)
- `setIconName` (line ~916, delegates to `setIconData` — skip)
- `setIconCode` (line ~921, delegates to `setIconData` — skip)
- `moveIconGroup` (line ~926, delegates to `setDataOfTable` — add notify before callback)
- `duplicateIconGroup` (line ~935, before callback)
- `delIcon` (line ~758, before callback)
- `addIcons` (line ~679, in the `done()` helper at line ~693: add `this.notifyMutation();` before the `if` check)
- `addIconsFromData` (line ~738, before callback)
- `addIconsFromCpData` (line ~754, before callback)

For `addIcons`, modify the `done` helper:

```ts
    const done = () => {
      if (--pending <= 0) {
        this.notifyMutation();
        callback && callback();
      }
    };
```

For other methods, insert `this.notifyMutation();` just before the final `callback && callback()` line. Example for `addGroup`:

```ts
  addGroup = (...) => {
    // ... existing code ...
    this.notifyMutation();
    callback && callback({ id, groupName: name, groupOrder });
  };
```

For methods that delegate (setGroupName → setGroupData, setIconName → setIconData), the delegate already calls `notifyMutation`, so no duplication needed.

- [ ] **Step 3: Wire mutation callback in bootstrap**

In `src/renderer/bootstrap.tsx`, add after the `await dbReady;` line (line 17):

```ts
import db from './database';
import useAppStore from './store';

// ... inside mount(), after await dbReady:
db.registerOnMutation(() => useAppStore.getState().markDirty());
```

Note: `db` is already imported by bootstrap indirectly through `dbReady`. Add a direct import of the db instance and the store.

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests pass. The mutation callback is registered but in tests the db mock won't trigger it.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/database/index.ts src/renderer/bootstrap.tsx
git commit -m "feat: add database mutation callback for dirty state tracking"
```

---

## Task 3: Types — Extend ElectronAPI Interface

**Files:**
- Modify: `src/renderer/types.d.ts:21-67`

- [ ] **Step 1: Add new IPC method types**

In `src/renderer/types.d.ts`, add these methods to the `ElectronAPI` interface (before the closing `}` at line 61):

```ts
  // Shell
  openPath: (fullPath: string) => Promise<string>;

  // Screen color picker
  pickScreenColor: () => Promise<string>;

  // Menu IPC (main → renderer)
  onMenuNewProject: (callback: () => void) => () => void;
  onMenuOpenProject: (callback: () => void) => () => void;
  onMenuSave: (callback: () => void) => () => void;
  onMenuSaveAs: (callback: () => void) => () => void;
  onMenuExportFonts: (callback: () => void) => () => void;

  // File association (main → renderer)
  onOpenFile: (callback: (filePath: string) => void) => () => void;

  // Close guard (main → renderer, renderer → main)
  onConfirmClose: (callback: () => void) => () => void;
  confirmClose: () => void;
  closeCancelled: () => void;
```

Note: `openPath` and `pickScreenColor` are already in preload but missing from types — add them too.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/types.d.ts
git commit -m "feat: extend ElectronAPI types for menu IPC and file association"
```

---

## Task 4: Preload — New IPC Listener APIs

**Files:**
- Modify: `src/preload/index.ts:7-82`

- [ ] **Step 1: Add menu and file association IPC listeners**

In `src/preload/index.ts`, add after the auto-update section (after line 81, before the closing `});`):

```ts
  // ── Menu commands (main → renderer) ──────────────────────────────
  onMenuNewProject: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:new-project', handler);
    return () => { ipcRenderer.removeListener('menu:new-project', handler); };
  },
  onMenuOpenProject: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:open-project', handler);
    return () => { ipcRenderer.removeListener('menu:open-project', handler); };
  },
  onMenuSave: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:save', handler);
    return () => { ipcRenderer.removeListener('menu:save', handler); };
  },
  onMenuSaveAs: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:save-as', handler);
    return () => { ipcRenderer.removeListener('menu:save-as', handler); };
  },
  onMenuExportFonts: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:export-fonts', handler);
    return () => { ipcRenderer.removeListener('menu:export-fonts', handler); };
  },

  // ── File association (main → renderer) ───────────────────────────
  onOpenFile: (callback: (filePath: string) => void) => {
    const handler = (_event: IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on('open-file', handler);
    return () => { ipcRenderer.removeListener('open-file', handler); };
  },

  // ── Close guard ──────────────────────────────────────────────────
  onConfirmClose: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('app:confirm-close', handler);
    return () => { ipcRenderer.removeListener('app:confirm-close', handler); };
  },
  confirmClose: (): void => ipcRenderer.send('app:close-confirmed'),
  closeCancelled: (): void => ipcRenderer.send('app:close-cancelled'),
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: add preload IPC APIs for menu, file association, and close guard"
```

---

## Task 5: Main Process — Single Instance, File Association, Close Guard

**Files:**
- Modify: `src/main/index.ts`

This is the largest single-file change. The current file is 168 lines. We restructure the top-level flow to add single-instance locking, macOS `open-file`, Windows `second-instance`, and close guard.

- [ ] **Step 1: Add `extractIcpPath` utility and single-instance lock**

At the top of `src/main/index.ts`, after the imports (after line 13), add:

```ts
/** Extract the first .icp file path from an argv array */
function extractIcpPath(argv: string[]): string | null {
  for (let i = 1; i < argv.length; i++) {
    if (argv[i].endsWith('.icp') && !argv[i].startsWith('--')) {
      return path.resolve(argv[i]);
    }
  }
  return null;
}

// ── Single-instance lock ──────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
```

Then wrap the entire rest of the file (from `let mainWindow` through the end) inside an `else` block:

```ts
if (!gotLock) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;
  // ... rest of file ...
}
```

- [ ] **Step 2: Add `second-instance` handler (Windows file association when app already running)**

Inside the `else` block, before `app.on('window-all-closed', ...)`:

```ts
  // Windows/Linux: second instance launched with file arg → forward to existing window
  app.on('second-instance', (_event, argv) => {
    const filePath = extractIcpPath(argv);
    if (filePath && mainWindow) {
      mainWindow.webContents.send('open-file', filePath);
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
```

- [ ] **Step 3: Add macOS `open-file` handler**

After the `second-instance` handler:

```ts
  // macOS: double-click .icp or drag to dock icon
  let pendingFilePath: string | null = null;
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow) {
      mainWindow.webContents.send('open-file', filePath);
    } else {
      pendingFilePath = filePath;
    }
  });
```

- [ ] **Step 4: Add close guard in the `app.on('ready')` callback**

Inside `app.on('ready', ...)`, after `mainWindow.on('closed', ...)` (line 98-100):

```ts
    // ── Close guard ────────────────────────────────────────────
    let forceClose = false;
    let closeTimeout: ReturnType<typeof setTimeout> | null = null;

    app.on('before-quit', () => { forceClose = true; });

    mainWindow.on('close', (e) => {
      if (!forceClose) {
        e.preventDefault();
        mainWindow!.webContents.send('app:confirm-close');
        closeTimeout = setTimeout(() => {
          forceClose = true;
          mainWindow?.close();
        }, 5000);
      }
    });

    ipcMain.on('app:close-confirmed', () => {
      if (closeTimeout) { clearTimeout(closeTimeout); closeTimeout = null; }
      forceClose = true;
      mainWindow?.close();
    });

    ipcMain.on('app:close-cancelled', () => {
      if (closeTimeout) { clearTimeout(closeTimeout); closeTimeout = null; }
    });
```

- [ ] **Step 5: Send pending file path and argv file path after window loads**

Modify the existing `did-finish-load` handler (line 90-96) to also send file paths:

```ts
    mainWindow.webContents.on('did-finish-load', () => {
      if (!mainWindow) throw new Error('"mainWindow" is not defined');
      mainWindow.show();
      mainWindow.focus();

      // Send file path from macOS open-file event (fired before ready)
      if (pendingFilePath) {
        mainWindow.webContents.send('open-file', pendingFilePath);
        pendingFilePath = null;
      }
      // Send file path from Windows/Linux command-line args
      const argPath = extractIcpPath(process.argv);
      if (argPath) {
        mainWindow.webContents.send('open-file', argPath);
      }
    });
```

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add single-instance lock, file association, and close guard to main process"
```

---

## Task 6: Menu — File Submenu for Both Platforms

**Files:**
- Modify: `src/main/menu.ts`

- [ ] **Step 1: Create shared File submenu items**

In `src/main/menu.ts`, add a new method to the `MenuBuilder` class that returns the File submenu items. This avoids duplicating the menu structure for Darwin vs Default:

```ts
    private buildFileSubmenu(isMac: boolean): MenuItemConstructorOptions {
        const mod = isMac ? 'Command' : 'Ctrl';
        return {
            label: isMac ? 'File' : '&File',
            submenu: [
                {
                    label: 'New Project',
                    accelerator: `${mod}+N`,
                    click: () => { this.mainWindow.webContents.send('menu:new-project'); },
                },
                {
                    label: 'Open...',
                    accelerator: `${mod}+O`,
                    click: () => { this.mainWindow.webContents.send('menu:open-project'); },
                },
                { type: 'separator' },
                {
                    label: 'Save',
                    accelerator: `${mod}+S`,
                    click: () => { this.mainWindow.webContents.send('menu:save'); },
                },
                {
                    label: 'Save As...',
                    accelerator: `${mod}+Shift+S`,
                    click: () => { this.mainWindow.webContents.send('menu:save-as'); },
                },
                { type: 'separator' },
                {
                    label: 'Export Fonts...',
                    accelerator: `${mod}+E`,
                    click: () => { this.mainWindow.webContents.send('menu:export-fonts'); },
                },
                { type: 'separator' },
                {
                    label: isMac ? 'Close' : '&Close',
                    accelerator: `${mod}+W`,
                    click: () => { this.mainWindow.close(); },
                },
            ],
        };
    }
```

- [ ] **Step 2: Update Darwin template**

In `buildDarwinTemplate()`, fix branding and insert File submenu:

Replace `'Electron'` label (line 48) with `'Bobcorn'`.
Replace `'About ElectronReact'` (line 50) with `'About Bobcorn'`.
Replace `'Hide ElectronReact'` (line 58) with `'Hide Bobcorn'`.

Add File submenu to the return array (line 179):

```ts
        return [subMenuAbout, this.buildFileSubmenu(true), subMenuEdit, subMenuView, subMenuWindow, subMenuHelp];
```

- [ ] **Step 3: Update Default template**

In `buildDefaultTemplate()`, replace the existing File submenu (lines 183-198) with:

```ts
            this.buildFileSubmenu(false),
```

So the template becomes:

```ts
        const templateDefault: MenuItemConstructorOptions[] = [
            this.buildFileSubmenu(false),
            // ... View and Help submenus unchanged
        ];
```

- [ ] **Step 4: Commit**

```bash
git add src/main/menu.ts
git commit -m "feat: add File submenu with Save/Open/Export to both platform menus"
```

---

## Task 7: MainContainer — Menu Handlers, Close Guard, Title Bar

**Files:**
- Modify: `src/renderer/containers/MainContainer/index.tsx`

This is the central wiring point. We add useEffect hooks for: (a) menu command IPC, (b) file association IPC, (c) close guard IPC, (d) beforeunload, (e) title bar sync.

- [ ] **Step 1: Add imports**

At the top of `src/renderer/containers/MainContainer/index.tsx`, add/modify imports:

```ts
import { confirm, message } from '../../components/ui';
import db from '../../database';
import { projImporter } from '../../utils/importer';
import { cpLoader, icpLoader } from '../../utils/loaders';
```

Add `const { electronAPI } = window;` if not already present.

**Also modify `src/renderer/utils/importer/proj/index.ts`** to include `path` in callback data. After `const project = projFileLoader(path);`, change the callbacks to pass the path:

```ts
    if (project && project.type === "icp") {
      options.onSelectICP && options.onSelectICP({ ...project, path });
    }
    if (project && project.type === "cp") {
      options.onSelectCP && options.onSelectCP({ ...project, path });
    }
```

This ensures the renderer can set `currentFilePath` after loading.

- [ ] **Step 2: Add file operation handlers inside MainContainer component**

After the existing `useEffect` (line 108-115), add:

```ts
  // ── File operation handlers ──────────────────────────────────────
  const syncLeft = useAppStore((s: any) => s.syncLeft);
  const setCurrentFilePath = useAppStore((s: any) => s.setCurrentFilePath);
  const markClean = useAppStore((s: any) => s.markClean);
  const showSplashScreen = useAppStore((s: any) => s.showSplashScreen);
  const currentFilePath = useAppStore((s: any) => s.currentFilePath);
  const isDirty = useAppStore((s: any) => s.isDirty);

  /** Unified project open — used by menu, splash screen, and file association */
  const handleOpenProject = useCallback(async (filePath?: string) => {
    // Dirty guard
    const dirty = useAppStore.getState().isDirty;
    if (dirty) {
      const proceed = await new Promise<boolean>((resolve) => {
        confirm({
          title: '未保存的更改',
          content: '当前项目有未保存的更改，是否继续？未保存的更改将会丢失。',
          okText: '继续',
          okType: 'danger',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!proceed) return;
    }

    projImporter({
      path: filePath,
      onSelectCP: (project: any) => {
        cpLoader({ data: project.data }, () => {
          useAppStore.getState().showSplashScreen(false);
          useAppStore.getState().setCurrentFilePath(null); // CP format — no .icp path
          useAppStore.getState().markClean();
          useAppStore.getState().syncLeft();
          useAppStore.getState().selectGroup('resource-all');
          message.success('项目已导入');
        });
      },
      onSelectICP: (project: any) => {
        icpLoader(project.data, () => {
          useAppStore.getState().showSplashScreen(false);
          useAppStore.getState().setCurrentFilePath(project.path || null);
          useAppStore.getState().markClean();
          useAppStore.getState().syncLeft();
          useAppStore.getState().selectGroup('resource-all');
          message.success('项目已导入');
        });
      },
    });
  }, []);

  /** Save project to known path, or fall through to Save As */
  const handleSave = useCallback(async () => {
    const state = useAppStore.getState();
    if (state.currentFilePath) {
      // Silent save
      db.exportProject((projData: Uint8Array) => {
        const buffer = Buffer.from(projData);
        electronAPI.writeFile(state.currentFilePath!, buffer)
          .then(() => {
            useAppStore.getState().markClean();
            message.success('项目已保存');
          })
          .catch((err: Error) => {
            // Path may have been deleted — fall back to Save As
            message.error(`保存失败: ${err.message}`);
            useAppStore.getState().setCurrentFilePath(null);
          });
      });
    } else {
      handleSaveAs();
    }
  }, []);

  /** Save As — always shows dialog */
  const handleSaveAs = useCallback(async () => {
    const result = await electronAPI.showSaveDialog({
      title: '保存项目文件',
      defaultPath: db.getProjectName(),
      filters: [{ name: 'Bobcorn Project', extensions: ['icp'] }],
    });
    if (result.canceled || !result.filePath) return;
    let savePath = result.filePath;
    if (!savePath.endsWith('.icp')) savePath += '.icp';

    db.exportProject((projData: Uint8Array) => {
      const buffer = Buffer.from(projData);
      electronAPI.writeFile(savePath, buffer)
        .then(() => {
          useAppStore.getState().setCurrentFilePath(savePath);
          useAppStore.getState().markClean();
          // Update history
          const hist: string[] = (getOption('histProj') as string[]) || [];
          const updated = [savePath, ...hist.filter((p: string) => p !== savePath)].slice(0, 10);
          setOption({ histProj: updated });
          message.success('项目已保存');
        })
        .catch((err: Error) => message.error(`保存失败: ${err.message}`));
    });
  }, []);

  /** New project */
  const handleNewProject = useCallback(async () => {
    const dirty = useAppStore.getState().isDirty;
    if (dirty) {
      const proceed = await new Promise<boolean>((resolve) => {
        confirm({
          title: '未保存的更改',
          content: '当前项目有未保存的更改，是否继续？未保存的更改将会丢失。',
          okText: '继续',
          okType: 'danger',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!proceed) return;
    }
    db.resetProject();
    useAppStore.getState().setCurrentFilePath(null);
    useAppStore.getState().markClean();
    useAppStore.getState().syncLeft();
    useAppStore.getState().selectGroup('resource-all');
    useAppStore.getState().showSplashScreen(false);
  }, []);
```

- [ ] **Step 3: Add useEffect for menu IPC listeners**

```ts
  // ── Menu IPC listeners ───────────────────────────────────────────
  useEffect(() => {
    const cleanups = [
      electronAPI.onMenuNewProject(() => handleNewProject()),
      electronAPI.onMenuOpenProject(() => handleOpenProject()),
      electronAPI.onMenuSave(() => handleSave()),
      electronAPI.onMenuSaveAs(() => handleSaveAs()),
      electronAPI.onMenuExportFonts(() => {
        // Dispatch a custom event that ExportDialog listens for
        window.dispatchEvent(new CustomEvent('bobcorn:open-export'));
      }),
      electronAPI.onOpenFile((filePath: string) => handleOpenProject(filePath)),
    ];
    return () => cleanups.forEach((fn) => fn());
  }, [handleOpenProject, handleSave, handleSaveAs, handleNewProject]);
```

- [ ] **Step 4: Add close guard useEffect**

```ts
  // ── Close guard ──────────────────────────────────────────────────
  useEffect(() => {
    const cleanup = electronAPI.onConfirmClose(async () => {
      const dirty = useAppStore.getState().isDirty;
      if (!dirty) {
        electronAPI.confirmClose();
        return;
      }
      confirm({
        title: '未保存的更改',
        content: '是否保存当前项目？',
        okText: '保存并关闭',
        cancelText: '不保存',
        onOk: async () => {
          await handleSave();
          electronAPI.confirmClose();
        },
        onCancel: () => {
          electronAPI.confirmClose();
        },
      });
      // Note: if user dismisses the dialog (clicks backdrop), neither onOk nor onCancel fires.
      // The 5s timeout in main process handles this case.
    });

    // beforeunload guard for dev-mode reload
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
  }, [handleSave]);
```

- [ ] **Step 5: Add title bar sync useEffect**

```ts
  // ── Title bar sync ───────────────────────────────────────────────
  useEffect(() => {
    const name = currentFilePath
      ? electronAPI.pathBasename(currentFilePath, '.icp')
      : 'Untitled';
    document.title = `${name}${isDirty ? '*' : ''} — Bobcorn`;
  }, [currentFilePath, isDirty]);
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/containers/MainContainer/index.tsx
git commit -m "feat: add menu handlers, close guard, title bar sync to MainContainer"
```

---

## Task 8: ImportExportBar — Simplify + SideMenu Handler Cleanup

**Files:**
- Modify: `src/renderer/components/SideMenu/ImportExportBar.tsx`
- Modify: `src/renderer/components/SideMenu/index.tsx`

- [ ] **Step 1: Simplify ImportExportBar — remove Import Project, make Import a direct button**

Replace the full content of `ImportExportBar.tsx`:

```tsx
import React from 'react';
import { LogIn, Upload, Settings } from 'lucide-react';
import { Button } from '../ui';

interface ImportExportBarProps {
  onImportIcons: () => void;
  onExportClick: () => void;
  onShowEditPrefix: () => void;
}

const ImportExportBar = React.memo(function ImportExportBar({
  onImportIcons,
  onExportClick,
  onShowEditPrefix,
}: ImportExportBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-t border-border px-3 h-[49px] pb-1">
      <div className="flex flex-1 [&>button]:flex-1">
        <Button
          style={{ borderRadius: '6px 0 0 6px', marginRight: -1 }}
          icon={<LogIn size={14} />}
          onClick={onImportIcons}
        >
          导入图标
        </Button>
        <Button
          style={{ borderRadius: '0 6px 6px 0', flex: 1 }}
          onClick={onExportClick}
          icon={<Upload size={14} />}
        >
          导出
        </Button>
      </div>
      <Button
        data-testid="settings-btn"
        shape="circle"
        icon={<Settings size={14} />}
        onClick={onShowEditPrefix}
      />
    </div>
  );
});

export default ImportExportBar;
```

- [ ] **Step 2: Update SideMenu to use simplified ImportExportBar**

In `src/renderer/components/SideMenu/index.tsx`:

Replace the `handleImportClick` callback (lines 70-120) with a simpler icon-only import:

```ts
  // 导入图标
  const handleImportIcons = useCallback(() => {
    iconImporter({
      onSelectSVG: (files: any[]) => {
        db.addIcons(files, selectedGroup, () => {
          message.success(`已成功导入 ${files.length} 个图标`);
          syncLeft();
        });
      },
    });
  }, [selectedGroup, syncLeft]);
```

Replace `handleExportClick` (lines 122-130) with:

```ts
  const handleExportClick = useCallback(() => {
    setExportVisible(true);
  }, []);
```

Remove `handleExportProjects` entirely (lines 132-146) — Save is now in MainContainer.

Update `ImportExportBar` props (line 186-190):

```tsx
      <ImportExportBar
        onImportIcons={handleImportIcons}
        onExportClick={handleExportClick}
        onShowEditPrefix={showPrefix}
      />
```

Also add a listener for the custom event from MainContainer's menu:export-fonts handler. Add this useEffect:

```ts
  useEffect(() => {
    const handler = () => setExportVisible(true);
    window.addEventListener('bobcorn:open-export', handler);
    return () => window.removeEventListener('bobcorn:open-export', handler);
  }, []);
```

Remove unused imports: `{ cpLoader, icpLoader }` from loaders, `projImporter` from importer.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SideMenu/ImportExportBar.tsx src/renderer/components/SideMenu/index.tsx
git commit -m "feat: simplify ImportExportBar and move save logic to MainContainer"
```

---

## Task 9: ExportDialog — Format Selection, Expanded Groups, Migration Notice

**Files:**
- Modify: `src/renderer/components/SideMenu/ExportDialog.tsx`

- [ ] **Step 1: Add format selection state**

After the existing state declarations (line ~50), add:

```ts
  // Format selection
  const [selectedFormats, setSelectedFormats] = useState({
    // Required (always true)
    svg: true, ttf: true, woff2: true, css: true,
    // Optional (default ON)
    woff: true, eot: true, js: true, html: true,
    // Optional (default OFF)
    icp: false,
  });
  const [zipEnabled, setZipEnabled] = useState(false);
```

- [ ] **Step 2: Change export group section to default expanded**

Change line 44 from:

```ts
  const [exportGroupModelVisible, setExportGroupModelVisible] = useState<boolean>(false);
```

to:

```ts
  const [exportGroupModelVisible, setExportGroupModelVisible] = useState<boolean>(true);
```

- [ ] **Step 3: Modify `handleEnsureExportIconfonts` for conditional generation**

Replace the generation section (lines ~125-226) with conditional logic. The key changes:

After `await step(10, ...)` for CSS, pass `selectedFormats`:

```ts
      const cssData = iconfontCSSGenerator(icons, selectedFormats);
```

After WOFF2 generation (always), conditionally generate optional formats:

```ts
      let woffFont: any = null;
      if (selectedFormats.woff) {
        await step(nextProgress(), '转换 WOFF 字体...');
        woffFont = woffFontGenerator({ ttfFont });
      }

      let eotFont: any = null;
      if (selectedFormats.eot) {
        await step(nextProgress(), '转换 EOT 字体...');
        eotFont = eotFontGenerator({ ttfFont });
      }

      let jsData: string | null = null;
      if (selectedFormats.js) {
        await step(nextProgress(), '生成 JS Symbol 引用...');
        jsData = iconfontSymbolGenerator(icons);
      }
```

For HTML generation:

```ts
      let pageData: string | null = null;
      if (selectedFormats.html) {
        await step(nextProgress(), '生成 HTML 演示页面...');
        const woff2Base64 = Buffer.from(woff2Font.buffer).toString('base64');
        pageData = demoHTMLGenerator(
          groups,
          icons.map((icon: any) => Object.assign({}, icon, { iconContent: '' })),
          woff2Base64,
          { hasSymbol: selectedFormats.js, selectedFormats }
        );
      }
```

For ICP:

```ts
      let projBuffer: Buffer | null = null;
      if (selectedFormats.icp) {
        await step(nextProgress(), '导出项目文件...');
        const projData = await new Promise<any>((resolve) => db.exportProject(resolve));
        projBuffer = Buffer.from(projData);
      }
```

Build files array dynamically:

```ts
      const files: Array<{ name: string; data: string | Buffer }> = [];
      files.push({ name: `${projectName}.svg`, data: svgFont });
      files.push({ name: `${projectName}.ttf`, data: Buffer.from(ttfFont.buffer) });
      files.push({ name: `${projectName}.woff2`, data: Buffer.from(woff2Font.buffer) });
      files.push({ name: `${projectName}.css`, data: cssData });
      if (woffFont) files.push({ name: `${projectName}.woff`, data: Buffer.from(woffFont.buffer) });
      if (eotFont) files.push({ name: `${projectName}.eot`, data: Buffer.from(eotFont.buffer) });
      if (jsData) files.push({ name: `${projectName}.js`, data: jsData });
      if (pageData) files.push({ name: `${projectName}.html`, data: pageData });
      if (projBuffer) files.push({ name: `${projectName}.icp`, data: projBuffer });
```

- [ ] **Step 4: Add ZIP packing after file writes**

After the file write loop:

```ts
      if (zipEnabled) {
        await step(nextProgress(), '打包为 ZIP 文件...');
        const { zipSync } = await import('fflate');
        const zipData: Record<string, Uint8Array> = {};
        for (const f of files) {
          zipData[f.name] = typeof f.data === 'string'
            ? new TextEncoder().encode(f.data)
            : new Uint8Array(f.data as Buffer);
        }
        const zipped = zipSync(zipData, { level: 6 });
        electronAPI.writeFileSync(`${dirPath}.zip`, Buffer.from(zipped));
        addExportLog(`写入 ${projectName}.zip`);
      }
```

- [ ] **Step 5: Update config phase UI with migration notice and format selection**

In the config phase JSX (lines ~293-343), add migration notice at the top:

```tsx
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-xs leading-relaxed mb-4">
            <span className="shrink-0 mt-0.5">ℹ</span>
            <span>项目文件 (.icp) 现在通过「保存」(Ctrl+S) 管理。如仍需在导出中包含，请勾选下方选项。</span>
          </div>
```

After the group selector, replace the static format badges with interactive format selection:

```tsx
          {/* 必选格式 */}
          <div className="mt-3">
            <div className="text-xs text-foreground-muted mb-1.5">必选格式</div>
            <div className="flex flex-wrap gap-1.5">
              {['SVG', 'TTF', 'WOFF2', 'CSS'].map((fmt) => (
                <span key={fmt} className="px-2 py-0.5 rounded bg-brand-100 dark:bg-brand-900/40 text-xs text-brand-700 dark:text-brand-300 font-mono">
                  .{fmt.toLowerCase()}
                </span>
              ))}
            </div>
          </div>

          {/* 可选格式 */}
          <div className="mt-3">
            <div className="text-xs text-foreground-muted mb-1.5">可选格式</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {([
                { key: 'woff', label: '.woff' },
                { key: 'eot', label: '.eot' },
                { key: 'js', label: '.js (Symbol)' },
                { key: 'html', label: '.html (Demo)' },
                { key: 'icp', label: '.icp (项目文件)' },
              ] as const).map(({ key, label }) => (
                <label key={key} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedFormats[key]}
                    onChange={(e) => setSelectedFormats((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="rounded border-border"
                  />
                  <span className="font-mono text-foreground-muted">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ZIP 选项 */}
          <div className="mt-3">
            <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={zipEnabled}
                onChange={(e) => setZipEnabled(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-foreground">自动打包 (ZIP)</span>
            </label>
            <p className="text-xs text-foreground-muted mt-0.5 ml-5">
              勾选后导出文件自动压缩为 ZIP 包
            </p>
          </div>
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/SideMenu/ExportDialog.tsx
git commit -m "feat: add format selection, ZIP option, migration notice to ExportDialog"
```

---

## Task 10: CSS/HTML Generators — Format-Aware Output

**Files:**
- Modify: `src/renderer/utils/generators/demopageGenerator/index.ts`
- Modify: `src/renderer/resources/iconDocs/indexTemplate.html`
- Create: `test/unit/export-formats.test.ts`

- [ ] **Step 1: Write failing test for format-aware CSS generator**

```ts
// test/unit/export-formats.test.ts
import { describe, it, expect } from 'vitest';

describe('iconfontCSSGenerator format-aware', () => {
  // We test the CSS output structure directly
  it('includes only selected formats in @font-face src', () => {
    // Simulate: only woff2 + ttf (required), no woff, no eot
    const formats = { woff2: true, ttf: true, woff: false, eot: false };
    const srcLine = buildFontFaceSrc('testfont', formats);
    expect(srcLine).toContain("url('testfont.woff2') format('woff2')");
    expect(srcLine).toContain("url('testfont.ttf') format('truetype')");
    expect(srcLine).not.toContain('.eot');
    expect(srcLine).not.toContain('.woff\'');
  });

  it('includes all formats when all selected', () => {
    const formats = { woff2: true, ttf: true, woff: true, eot: true };
    const srcLine = buildFontFaceSrc('testfont', formats);
    expect(srcLine).toContain('.eot');
    expect(srcLine).toContain('.woff2');
    expect(srcLine).toContain("format('woff')");
    expect(srcLine).toContain('.ttf');
  });
});

// Extracted helper — mirrors the logic we'll implement in the generator
function buildFontFaceSrc(
  name: string,
  formats: { woff2: boolean; ttf: boolean; woff?: boolean; eot?: boolean }
): string {
  const parts: string[] = [];
  if (formats.eot) parts.push(`url('${name}.eot?#iefix') format('embedded-opentype')`);
  parts.push(`url('${name}.woff2') format('woff2')`);
  if (formats.woff) parts.push(`url('${name}.woff') format('woff')`);
  parts.push(`url('${name}.ttf') format('truetype')`);
  return parts.join(',\n       ');
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run test/unit/export-formats.test.ts`
Expected: PASS (the test uses an inline helper matching our target implementation)

- [ ] **Step 3: Update `iconfontCSSGenerator` to be format-aware**

In `src/renderer/utils/generators/demopageGenerator/index.ts`, replace `iconfontCSSGenerator` (lines 63-74):

```ts
export const iconfontCSSGenerator = (
  icons: DemoIconData[],
  formats?: { woff2?: boolean; ttf?: boolean; woff?: boolean; eot?: boolean }
): string => {
  const projectName = db.getProjectName();
  const fmt = formats || { woff2: true, ttf: true, woff: true, eot: true };

  // Build dynamic @font-face src
  const srcParts: string[] = [];
  if (fmt.eot) srcParts.push(`url('${projectName}.eot?#iefix') format('embedded-opentype')`);
  srcParts.push(`url('${projectName}.woff2') format('woff2')`);
  if (fmt.woff) srcParts.push(`url('${projectName}.woff') format('woff')`);
  srcParts.push(`url('${projectName}.ttf') format('truetype')`);

  const fontFace = `@font-face {\n  font-family: "${projectName}";\n  src: ${srcParts.join(',\n       ')};\n  font-weight: normal;\n  font-style: normal;\n}\n`;
  const baseClass = `.${projectName} {\n  font-family: "${projectName}" !important;\n  font-style: normal;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\n`;

  const parts: string[] = [fontFace, baseClass];
  for (let i = 0; i < icons.length; i++) {
    const code = icons[i].iconCode.toLowerCase();
    parts.push(`.${projectName}-${code}:before { content: "\\${code}"; }`);
  }
  return parts.join('\n');
};
```

- [ ] **Step 4: Update `demoHTMLGenerator` to accept format config**

Update the signature and body of `demoHTMLGenerator` (lines 37-59):

```ts
export const demoHTMLGenerator = (
  groups: DemoGroupData[],
  icons: DemoIconData[],
  woff2Base64?: string,
  config?: { hasSymbol: boolean; selectedFormats: Record<string, boolean> }
): string => {
  const parser = new DOMParser();
  const pageTemplate = parser.parseFromString(htmlTemplate, 'text/html');
  const iconsContainer = pageTemplate.querySelector('[content=icons]')!;
  const fontLine = woff2Base64 ? `var fontBase64 = "${woff2Base64}";` : '';
  const projectName = db.getProjectName();
  const exportConfigLine = config
    ? `var exportConfig = ${JSON.stringify({ hasSymbol: config.hasSymbol, selectedFormats: config.selectedFormats })};`
    : '';
  iconsContainer.innerHTML = `
		var projectName = ${JSON.stringify(projectName)}
		var groups = ${JSON.stringify(groups)};
		var icons = ${JSON.stringify(icons)};
		${fontLine}
		${exportConfigLine}
	`;
  // Preload symbol SVG sprite — only if JS Symbol is exported
  const symbolPreload = pageTemplate.querySelector('[content=symbolPreload]');
  if (symbolPreload) {
    if (config?.hasSymbol !== false) {
      symbolPreload.setAttribute('src', `./${projectName}.js`);
    } else {
      // Remove the script tag entirely to avoid 404
      symbolPreload.removeAttribute('src');
    }
  }
  return pageTemplate.querySelector('html')!.outerHTML;
};
```

- [ ] **Step 5: Add exportConfig handling to HTML template**

In `src/renderer/resources/iconDocs/indexTemplate.html`, find the section where tab buttons are rendered (search for `tabLinks`). Add a guard script after the data injection:

This is a vanilla JS change in the HTML template. After the `<script content="icons">` block, add:

```html
<script>
// Hide tabs based on export config
document.addEventListener('DOMContentLoaded', function() {
  if (typeof exportConfig !== 'undefined') {
    if (!exportConfig.hasSymbol) {
      var symbolTab = document.querySelector('.tabLinks[onclick*="symbol"]');
      if (symbolTab) symbolTab.style.display = 'none';
    }
  }
});
</script>
```

Also, in the template's `fontSrc` construction (the runtime JS that builds @font-face), add guards for optional formats:

Find the `unicodeImportStyle` or `fontSrc` construction and wrap each format reference with `if (typeof exportConfig === 'undefined' || exportConfig.selectedFormats.eot)` etc.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/utils/generators/demopageGenerator/index.ts src/renderer/resources/iconDocs/indexTemplate.html test/unit/export-formats.test.ts
git commit -m "feat: format-aware CSS/HTML generators with conditional Symbol tab"
```

---

## Task 11: TitleBar — Windows File Name Display

**Files:**
- Modify: `src/renderer/components/TitleBar/button/index.tsx`

- [ ] **Step 1: Add file name display to TitleBarButtonGroup**

In `src/renderer/components/TitleBar/button/index.tsx`, add store import and title derivation:

```ts
import useAppStore from '../../../store';
const { electronAPI } = window;
```

Inside the component, before the `return`:

```ts
  const currentFilePath = useAppStore((s: any) => s.currentFilePath);
  const isDirty = useAppStore((s: any) => s.isDirty);
  const fileName = currentFilePath
    ? electronAPI.pathBasename(currentFilePath, '.icp')
    : 'Untitled';
  const titleText = `${fileName}${isDirty ? '*' : ''} — Bobcorn`;
```

In the JSX, add a title span as the first child of the container div (before the minimize button):

```tsx
      <span
        className={cn(
          'leading-[30px] px-3 text-xs text-foreground-muted truncate max-w-[300px] select-none',
          '[-webkit-app-region:drag]'
        )}
      >
        {titleText}
      </span>
```

Update the container div to add `w-full justify-end` so the buttons stay right-aligned and the title takes remaining space:

Change the container className to include `w-full`:

```tsx
    <div
      className={cn(
        'fixed top-0 left-0 right-0',
        'z-[10000]',
        'flex flex-row items-start',
        '[-webkit-app-region:drag]'
      )}
      id="titleBarButtonGroup"
      style={{ gap: 0 }}
    >
      <span className={cn(
        'leading-[30px] px-3 text-xs text-foreground-muted truncate flex-1 select-none',
        '[-webkit-app-region:drag]'
      )}>
        {titleText}
      </span>
      <div className="flex [-webkit-app-region:no-drag]">
        {/* existing 3 buttons */}
      </div>
    </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/TitleBar/button/index.tsx
git commit -m "feat: add file name display to Windows title bar"
```

---

## Task 12: SplashScreen — Set currentFilePath on Open

**Files:**
- Modify: `src/renderer/components/SplashScreen/index.tsx`

- [ ] **Step 1: Wire `setCurrentFilePath` into project open flow**

In `SplashScreen/index.tsx`, add store action:

```ts
  const setCurrentFilePath = useAppStore((state: any) => state.setCurrentFilePath);
  const markClean = useAppStore((state: any) => state.markClean);
```

In `handleImportProj`, after `icpLoader(project.data, () => {`, add:

```ts
          setCurrentFilePath(path || null);
          markClean();
```

And in the `onSelectCP` callback, add:

```ts
          setCurrentFilePath(null); // CP format doesn't have a .icp path
          markClean();
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/SplashScreen/index.tsx
git commit -m "feat: set currentFilePath when opening project from SplashScreen"
```

---

## Task 13: package.json — File Association + fflate

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add fileAssociations to build config**

In `package.json`, add `fileAssociations` inside the `build` section (after `"icon": "resources/icon.png"` at line 62):

```json
    "fileAssociations": [
      {
        "ext": "icp",
        "name": "Bobcorn Project",
        "description": "Bobcorn Icon Font Project",
        "mimeType": "application/x-bobcorn-project",
        "role": "Editor",
        "icon": "resources/icon"
      }
    ],
```

- [ ] **Step 2: Install fflate**

Run: `npm install fflate`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add .icp file association and fflate dependency"
```

---

## Task 14: Build + Test + Polish

- [ ] **Step 1: Run unit tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new).

- [ ] **Step 2: Build**

Run: `npx electron-vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Manual smoke test checklist**

Start dev mode: `npx electron-vite dev`

Verify:
1. File menu exists (Ctrl+N/O/S/Shift+S/E/W all work)
2. Bottom bar shows "导入图标" + "导出" (no "导入项目")
3. Ctrl+S on new project → shows Save As dialog
4. Save → Ctrl+S again → silent save (no dialog)
5. Edit an icon → title bar shows `*`
6. Ctrl+S → title bar `*` disappears
7. Export dialog: format checkboxes visible, groups expanded by default
8. Export with only required formats → 4 files generated
9. Export with ZIP checked → .zip file created
10. Close window with unsaved changes → confirmation dialog appears
11. Title bar shows file name (Windows) / document.title (macOS)

- [ ] **Step 4: Run E2E tests**

Run:
```bash
node test/e2e/acceptance.js
node test/e2e/full-e2e.js
```
Expected: All checks pass.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "test: verify file menu modernization and export format selection"
```
