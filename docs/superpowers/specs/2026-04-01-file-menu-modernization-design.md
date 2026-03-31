# File Menu Modernization & .icp File Association

> Spec v2 — 2026-04-01 | 2-round cross-review (Architect + CODEX Reviewer)

## 1. Goals

Align Bobcorn's file operations with the standard Open/Save/Export mental model familiar to designers (Photoshop, Figma, Sketch). Add .icp file association for double-click launch on macOS and Windows.

### Success Criteria

- File menu with Open / Save / Save As / Export + keyboard shortcuts
- Ctrl+S / Cmd+S silently saves to current .icp path (Save As if no path)
- Export dialog: selective output types, ZIP option, groups expanded by default
- .icp file double-click launches app (or focuses existing instance) and opens the project
- Close guard prevents data loss on unsaved changes
- Zero performance regression: export pipeline ≤ current speed; UI stays responsive during all operations

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  main/index.ts                                              │
│  ┌───────────────┐  ┌──────────┐  ┌──────────────────────┐ │
│  │ Single-instance│  │ File menu│  │ Close guard          │ │
│  │ lock + argv    │  │ IPC send │  │ confirm-close IPC    │ │
│  └───────┬───────┘  └────┬─────┘  └──────────┬───────────┘ │
│          │               │                    │             │
│  macOS: open-file    menu:save/open/...   app:confirm-close │
│  Win:   second-instance                                     │
└──────────┼───────────────┼────────────────────┼─────────────┘
           │               │                    │
     ┌─────▼───────────────▼────────────────────▼─────────┐
     │  preload/index.ts                                   │
     │  onOpenFile / onMenuSave / onConfirmClose / ...     │
     └─────────────────────────┬───────────────────────────┘
                               │
     ┌─────────────────────────▼───────────────────────────┐
     │  Renderer                                            │
     │  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
     │  │ Store     │  │MainContainer│ │ ExportDialog    │  │
     │  │ isDirty   │  │handleSave  │  │ format selection│  │
     │  │ filePath  │  │handleOpen  │  │ conditional gen │  │
     │  │ markDirty │  │closeGuard  │  │ ZIP packing     │  │
     │  └──────────┘  └───────────┘  └──────────────────┘  │
     └─────────────────────────────────────────────────────┘
```

## 3. Bottom Bar (ImportExportBar) — Retained, Simplified

The bottom bar stays for discoverability. Its role narrows to additive/export quick actions:

```
[ Import Icons ]  [ Export... ]  |  [Settings]
```

- **Import Icons**: single button, triggers SVG icon import (no "Import Project" — that's now File > Open)
- **Export...**: opens ExportDialog (unchanged entry point)
- **Settings**: opens PrefixDialog (unchanged)

"Open Project" and "Save" are file-level operations accessible only via File menu + keyboard shortcuts — consistent with Photoshop/Figma where sidebars don't contain Open/Save buttons.

## 4. File Menu & Keyboard Shortcuts

### Menu Structure (both platforms)

| Item | Win/Linux | macOS | IPC Channel | Description (tooltip) |
|------|-----------|-------|-------------|----------------------|
| New Project | Ctrl+N | Cmd+N | `menu:new-project` | Start a blank project |
| Open... | Ctrl+O | Cmd+O | `menu:open-project` | Open .icp project file |
| Save | Ctrl+S | Cmd+S | `menu:save` | Save project to .icp |
| Save As... | Ctrl+Shift+S | Cmd+Shift+S | `menu:save-as` | Save to a new path |
| --- | | | | |
| Export Fonts... | Ctrl+E | Cmd+E | `menu:export-fonts` | Open export dialog |
| --- | | | | |
| Close | Ctrl+W | Cmd+W | (window close) | |

### macOS-specific

- Add `subMenuFile` between App and Edit submenus in `buildDarwinTemplate()`
- Fix stale "Electron"/"ElectronReact" branding → "Bobcorn"
- Settings accessible via Cmd+, (standard macOS convention)

### IPC Pattern

```
menu.ts click handler
  → mainWindow.webContents.send('menu:save')
    → preload: ipcRenderer.on('menu:save', handler)
      → renderer useEffect registers handler, returns cleanup function
```

Every preload listener returns an unsubscribe function to prevent leaks on HMR:
```ts
onMenuSave: (cb) => {
  const handler = (_e, ...args) => cb(...args);
  ipcRenderer.on('menu:save', handler);
  return () => ipcRenderer.removeListener('menu:save', handler);
}
```

## 5. Zustand Store Additions

```ts
// State
currentFilePath: string | null   // current .icp path on disk (null = untitled)
isDirty: boolean                 // unsaved changes exist

// Actions
setCurrentFilePath(path: string | null): void  // also persists to localStorage
markDirty(): void
markClean(): void
```

### Dirty Tracking — Database Callback Pattern

Instead of instrumenting 15+ UI call sites, register a single mutation callback in the Database class:

```ts
// database/index.ts
private onMutationCallback: (() => void) | null = null;
registerOnMutation(cb: () => void) { this.onMutationCallback = cb; }
private notifyMutation() { this.onMutationCallback?.(); }
// Called at the end of: addIcons, delIcon, setIconData, addGroup, delGroup,
// setGroupData, setProjectName, moveIcons, renewIcon, addIconsFromData, addIconsFromCpData
```

```ts
// bootstrap.tsx (after db.ready)
db.registerOnMutation(() => useAppStore.getState().markDirty());
```

### Performance: Batched Dirty Marking

For bulk operations (importing 100+ icons), `notifyMutation()` fires per icon. To avoid 100+ React re-renders of the title bar, `markDirty` uses a guard:

```ts
markDirty: () => {
  if (!get().isDirty) set({ isDirty: true });  // no-op if already dirty
}
```

Since `isDirty` is boolean (not a counter), repeated calls are O(1) with zero re-renders after the first.

### Clean Points

`markClean()` is called after:
- Successful Save / Save As
- Opening a project (fresh load = clean)
- New Project

### Persistence

`currentFilePath` persisted to `localStorage` via existing `setOption` mechanism. `isDirty` is never persisted (always starts `false`).

## 6. Save / Save As / Open / New Project Flows

### Save (Ctrl+S / Cmd+S)

```
currentFilePath !== null
  → silent write to currentFilePath via electronAPI.writeFile
  → markClean() → message.success('Saved')
currentFilePath === null
  → fall through to Save As flow
```

Performance: `db.export()` is synchronous and returns a Uint8Array snapshot (sql.js in-memory). For a 3000-icon project (~5 MB .icp), this takes <50ms. File write is async via preload's `writeFile` (non-blocking).

### Save As (Ctrl+Shift+S / Cmd+Shift+S)

```
showSaveDialog(filters: [{name: "Bobcorn Project", extensions: ["icp"]}])
  → write to chosen path
  → setCurrentFilePath(path) → markClean() → update histProj
```

### Open (Ctrl+O / Cmd+O)

```
isDirty? → unsaved-changes dialog (Save / Discard / Cancel)
showOpenDialog(filters: [{name: "项目文件", extensions: ["icp", "json"]}])
  → projFileLoader(path) → icpLoader(data) or cpLoader(data)
  → setCurrentFilePath(path) → markClean() → syncLeft() → selectGroup('resource-all')
```

Accepts both `.icp` and legacy `.json` to preserve backward compatibility.

### New Project (Ctrl+N / Cmd+N)

```
isDirty? → unsaved-changes dialog
  → db.resetProject() → setCurrentFilePath(null) → markClean() → syncLeft()
```

## 7. Close Guard

### Main Process

```ts
let forceClose = false;
let isQuitting = false;
let closeTimeout: ReturnType<typeof setTimeout> | null = null;

app.on('before-quit', () => { isQuitting = true; });

mainWindow.on('close', (e) => {
  if (!forceClose) {
    e.preventDefault();
    mainWindow.webContents.send('app:confirm-close');
    // Timeout: force-close after 5s if renderer unresponsive
    closeTimeout = setTimeout(() => { forceClose = true; mainWindow?.close(); }, 5000);
  }
});

ipcMain.on('app:close-confirmed', () => {
  if (closeTimeout) { clearTimeout(closeTimeout); closeTimeout = null; }
  forceClose = true;
  mainWindow?.close();
});

// Renderer can also cancel the close (user clicked "Cancel")
ipcMain.on('app:close-cancelled', () => {
  if (closeTimeout) { clearTimeout(closeTimeout); closeTimeout = null; }
});
```

### Renderer

On `app:confirm-close`:
- `isDirty === false` → immediately `electronAPI.confirmClose()`
- `isDirty === true` → dialog: "Save & Close" / "Discard & Close" / "Cancel"
  - Cancel: `electronAPI.closeCancelled()` (clears main process timeout)

### Platform Behavior

| Trigger | macOS | Windows |
|---------|-------|---------|
| Red/green/yellow buttons | `performClose:` → `close` event → guard fires | N/A |
| Cmd+Q / Alt+F4 | `before-quit` → `close` event → guard fires | `close` event → guard fires |
| Custom close button | N/A | `window-close` IPC → `mainWindow.close()` → guard fires |
| Taskbar right-click close | `close` event → guard fires | `close` event → guard fires |

## 8. .icp File Association

### electron-builder Configuration

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
]
```

Placed at the top level of `build` in `package.json`. electron-builder handles platform-specific registration:
- macOS: `Info.plist` CFBundleDocumentTypes
- Windows: NSIS registry entries (HKCR\.icp)
- Linux: .desktop MimeType

### Single-Instance Lock

```ts
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); return; }
```

### File Path Reception

| Scenario | macOS | Windows |
|----------|-------|---------|
| App not running, double-click .icp | `app.on('open-file')` fires before ready → `pendingFilePath` → send after `did-finish-load` | `process.argv[1]` = file path → send after `did-finish-load` |
| App running, double-click .icp | `app.on('open-file')` → `send('open-file', path)` directly | `app.on('second-instance', argv)` → extract path → `send('open-file', path)` + focus window |

### Path Extraction Utility

```ts
function extractIcpPath(argv: string[]): string | null {
  for (let i = 1; i < argv.length; i++) {
    if (argv[i].endsWith('.icp') && !argv[i].startsWith('--')) {
      return path.resolve(argv[i]);
    }
  }
  return null;
}
```

### Renderer Handling

`electronAPI.onOpenFile(filePath => handleOpenProject(filePath))` in MainContainer useEffect.

`handleOpenProject(filePath)` is the same unified method used by File > Open, SplashScreen history click, and file association — one code path, three entry points.

## 9. Export Dialog Overhaul

### Format Classification

| Category | Formats | Rationale |
|----------|---------|-----------|
| **Required** (locked on) | .svg .ttf .woff2 .css | Pipeline chain: SVG→TTF→WOFF2. CSS is @font-face + class selectors. |
| **Optional** (default ON) | .woff .eot .js (Symbol) .html (Demo) | Legacy compat + convenience |
| **Optional** (default OFF) | .icp (Project) | Now managed by Save; opt-in for export |

### Migration Notice

At the top of the config phase:
> 项目文件 (.icp) 现在通过「保存」管理。如仍需在导出中包含，请勾选下方选项。

### UI Layout

```
┌──────────────────────────────────────────────┐
│  导出图标字体                                 │
├──────────────────────────────────────────────┤
│  ℹ️ 项目文件 (.icp) 现在通过「保存」管理。     │
│                                              │
│  ▼ 导出分组  (默认展开)                       │
│  ┌──────────────────────────────────────┐    │
│  │ [x] 全选                             │    │
│  │ [x] GroupA  [x] GroupB  [x] GroupC   │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  必选格式:                                    │
│   .svg  .ttf  .woff2  .css                   │
│                                              │
│  可选格式:                                    │
│   [x] .woff  [x] .eot  [x] .js (Symbol)     │
│   [x] .html (Demo)     [ ] .icp (项目文件)   │
│                                              │
│  ☐ 自动打包 (ZIP)                             │
│    勾选后导出文件自动压缩为 ZIP 包              │
│                                              │
│              [取消]  [导出图标字体]             │
└──────────────────────────────────────────────┘
```

### Export Group Section — Default Expanded

Change `exportGroupModelVisible` initial state from `false` to `true`.

### Conditional Generation Pipeline

Required pipeline always runs:
1. `iconfontCSSGenerator(icons, selectedFormats)` — format-aware @font-face
2. `svgFontGenerator(icons, options)` — SVG font with progress callback
3. `ttfFontGenerator({ svgFont })` — TTF intermediate
4. `woff2FontGenerator({ ttfFont })` — WOFF2 (required output)

Optional, gated by checkboxes:
5. `woffFontGenerator({ ttfFont })` — only if `formats.woff`
6. `eotFontGenerator({ ttfFont })` — only if `formats.eot`
7. `iconfontSymbolGenerator(icons)` — only if `formats.js`
8. `demoHTMLGenerator(groups, icons, woff2Base64, { hasSymbol, selectedFormats })` — only if `formats.html`
9. `db.exportProject()` — only if `formats.icp`

### Performance: Dynamic Progress Weights

With fewer formats selected, the progress bar must remain proportional. Use weighted steps:

```ts
type ExportStep = { id: string; weight: number; run: () => Promise<void> };
const steps: ExportStep[] = [
  { id: 'css',   weight: 5,  run: () => { ... } },  // always
  { id: 'svg',   weight: 25, run: () => { ... } },  // always, heaviest
  { id: 'ttf',   weight: 8,  run: () => { ... } },  // always
  { id: 'woff2', weight: 10, run: () => { ... } },  // always
  // conditional steps added only if selected:
  ...(formats.woff ? [{ id: 'woff', weight: 5, run: () => { ... } }] : []),
  ...(formats.eot  ? [{ id: 'eot',  weight: 5, run: () => { ... } }] : []),
  // ...
];
const totalWeight = steps.reduce((s, step) => s + step.weight, 0);
// Each step sets progress = accumulatedWeight / totalWeight * 100
```

This ensures the progress bar never stalls or jumps regardless of format selection.

### Performance: Skip Unnecessary Computation

When fewer formats are selected:
- Skipping WOFF saves `ttf2woff` call (~20ms for 1000 icons)
- Skipping EOT saves `ttf2eot` call (~15ms for 1000 icons)
- Skipping JS Symbol saves `iconfontSymbolGenerator` + `flattenSvgUseRefs` per icon (~100ms for 1000 icons)
- Skipping HTML saves `demoHTMLGenerator` + DOMParser + base64 encode (~50ms for 1000 icons)
- Net saving for minimal export (4 required only): ~185ms on 1000-icon project

### CSS Generator: Format-Aware @font-face

Replace naive `cssTemplate.replace(/iconfont/g, projectName)` with programmatic generation:

```ts
export const iconfontCSSGenerator = (
  icons: DemoIconData[],
  formats: { woff2: true; ttf: true; woff?: boolean; eot?: boolean }
): string => {
  const name = db.getProjectName();
  const srcParts: string[] = [];
  if (formats.eot) srcParts.push(`url('${name}.eot?#iefix') format('embedded-opentype')`);
  srcParts.push(`url('${name}.woff2') format('woff2')`);
  if (formats.woff) srcParts.push(`url('${name}.woff') format('woff')`);
  srcParts.push(`url('${name}.ttf') format('truetype')`);

  const fontFace = `@font-face {\n  font-family: "${name}";\n  src: ${srcParts.join(',\n       ')};\n}\n`;

  // Class definitions (pre-allocate array, single join — existing optimization)
  const parts: string[] = [fontFace, `.${name} { font-family: "${name}" !important; font-style: normal; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }\n`];
  for (let i = 0; i < icons.length; i++) {
    const code = icons[i].iconCode.toLowerCase();
    parts.push(`.${name}-${code}:before { content: "\\${code}"; }`);
  }
  return parts.join('\n');
};
```

### HTML Template: Conditional Symbol Tab + Dynamic Font Sources

`demoHTMLGenerator` gains new parameters:

```ts
export const demoHTMLGenerator = (
  groups, icons, woff2Base64?,
  config?: { hasSymbol: boolean; selectedFormats: Record<string, boolean> }
)
```

Injected into the HTML as `var exportConfig = {...}`:
- Template JS uses `exportConfig.selectedFormats` to build `fontSrc` (only references exported formats)
- Template JS uses `exportConfig.hasSymbol` to hide Symbol tab button and skip JS loading
- `symbolPreload` script `src` only set when `hasSymbol === true`

### ZIP Packing

Library: **fflate** (`^0.8.2`, ~29KB minified, pure JS, MIT, async-capable)

```ts
if (zipEnabled) {
  const { zipSync } = await import('fflate');  // dynamic import — zero cost when unchecked
  const zipData: Record<string, Uint8Array> = {};
  for (const f of files) {
    zipData[f.name] = typeof f.data === 'string'
      ? new TextEncoder().encode(f.data)
      : new Uint8Array(f.data);
  }
  const zipped = zipSync(zipData, { level: 6 });
  electronAPI.writeFileSync(`${dirPath}.zip`, zipped);
}
```

Performance: `fflate.zipSync` with level 6 compresses ~5 MB of font files in <100ms. Dynamic import ensures fflate is not loaded unless ZIP is checked.

When ZIP is enabled:
- Save dialog changes to file picker (not directory picker)
- Output is a single `.zip` file
- Individual files are NOT also written to disk (ZIP-only output)

When ZIP is disabled: behavior unchanged (write files to directory).

## 10. Title Bar — File Name Display

### macOS

Native `hiddenInset` title bar automatically renders `document.title`. A `useEffect` in MainContainer keeps it in sync:

```ts
useEffect(() => {
  const name = currentFilePath
    ? electronAPI.pathBasename(currentFilePath, '.icp')
    : 'Untitled';
  document.title = `${name}${isDirty ? '*' : ''} — Bobcorn`;
}, [currentFilePath, isDirty]);
```

### Windows

Custom frameless window — `TitleBarButtonGroup` component gains a title text element:
- Reads `currentFilePath` and `isDirty` from store
- Renders `fileName* — Bobcorn` with `[-webkit-app-region:drag]` for window dragging
- Truncated with `max-w-[300px] truncate` to avoid overflow

## 11. Performance Requirements

| Operation | Target | Mechanism |
|-----------|--------|-----------|
| Save (Ctrl+S, known path) | <100ms for 3000-icon project | `db.export()` sync snapshot + async `writeFile` |
| Open (.icp) | <200ms for 3000-icon project | `db.initNewProjectFromData` sync load |
| Export (4 required formats) | No regression vs current 9-file export | Skip 5 optional generators |
| Export (all 9 formats) | Same as current | Identical pipeline |
| markDirty() bulk (100 icons) | Zero extra re-renders | Boolean guard: `if (!isDirty) set(true)` |
| ZIP packing | <100ms for typical 5MB export | fflate level 6 |
| File menu open/close | <16ms (single frame) | Reuse existing Dropdown component |
| Title bar update | <1ms | Simple string derivation in useEffect |
| File association launch | <500ms to show project | Single-instance focus + send IPC + load |

### Critical Performance Rules

1. **No synchronous file I/O on the renderer main thread during save** — `db.export()` is sync (unavoidable, sql.js design) but <50ms. File write is async.
2. **Dynamic import for fflate** — not loaded into bundle unless ZIP is used.
3. **SVG font generator keeps existing yield pattern** — `queueMicrotask` for every glyph, `setTimeout` every 50 glyphs. No change.
4. **Format-aware progress weights** — no stalled progress bar.
5. **Single mutation callback in Database** — not per-component dirty subscriptions.
6. **Store selector granularity** — `isDirty` and `currentFilePath` are separate selectors to avoid unnecessary re-renders of components that only need one.

## 12. File Change List

### Modified Files

| File | Change Scope | Notes |
|------|-------------|-------|
| `package.json` | Small | `fileAssociations` in build, add `fflate` dep |
| `src/main/index.ts` | **Large** | Single-instance lock, open-file, second-instance, close guard, extractIcpPath |
| `src/main/menu.ts` | **Large** | File submenu (both platforms), IPC sends, fix branding |
| `src/preload/index.ts` | Medium | 8 new IPC listener APIs with cleanup |
| `src/renderer/types.d.ts` | Small | ElectronAPI interface extensions |
| `src/renderer/store/index.ts` | Medium | isDirty, currentFilePath, markDirty, markClean, setCurrentFilePath |
| `src/renderer/config/index.ts` | Small | OptionData += currentFilePath |
| `src/renderer/database/index.ts` | Small | onMutation callback registration + notifyMutation() calls |
| `src/renderer/containers/MainContainer/index.tsx` | **Large** | Menu handlers, close guard, onOpenFile, title bar, beforeunload |
| `src/renderer/components/SideMenu/ImportExportBar.tsx` | Small | Remove "Import Project" option, simplify |
| `src/renderer/components/SideMenu/index.tsx` | Medium | Remove handleExportProjects (moved to MainContainer) |
| `src/renderer/components/SideMenu/ExportDialog.tsx` | **Large** | Format selection UI, conditional generation, ZIP, expanded groups, migration notice |
| `src/renderer/components/TitleBar/button/index.tsx` | Small | Add file name display (Windows) |
| `src/renderer/utils/generators/demopageGenerator/index.ts` | Medium | Format-aware CSS + HTML generation |
| `src/renderer/resources/iconDocs/iconfontTemplate(class).css` | Small | Remove hardcoded @font-face (now programmatic) |
| `src/renderer/resources/iconDocs/indexTemplate.html` | Medium | exportConfig variable, conditional Symbol tab, dynamic fontSrc |
| `src/renderer/components/SplashScreen/index.tsx` | Small | Set currentFilePath on history item click |

### New Files

None. All changes fit into existing file structure.

### New Dependencies

| Package | Size | Purpose |
|---------|------|---------|
| `fflate` | ~29KB min | ZIP compression (dynamic import) |

## 13. Implementation Phases

| Phase | Content | Depends On |
|-------|---------|------------|
| P1 | Store state + Database onMutation + config persistence | — |
| P2 | main/index.ts: single-instance lock, open-file, second-instance, close guard | — |
| P3 | menu.ts: File submenu (both platforms) + IPC sends | — |
| P4 | preload: all new IPC APIs with cleanup functions | P2, P3 |
| P5 | MainContainer: Save/Open/New handlers, onOpenFile, close guard renderer, title bar, beforeunload | P1, P4 |
| P6 | ExportDialog: format selection UI + conditional generation + expanded groups + migration notice | P1 |
| P7 | CSS/HTML generators: format-aware output | P6 |
| P8 | ImportExportBar simplification + TitleBar file name (Windows) | P5 |
| P9 | ZIP: install fflate + auto-pack option in ExportDialog | P6 |
| P10 | package.json fileAssociations + testing + polish | All |

P1, P2, P3 are independent and can be developed in parallel.
P6 and P5 are independent and can be developed in parallel.

## 14. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Save to deleted path | ENOENT error | Catch → fall back to Save As, clear currentFilePath |
| Ctrl+S during export | Concurrent db.export() | Safe: sql.js export is a pure snapshot, writes to different paths |
| .icp backward compat | Old versions can't open new files | No schema change — format identical |
| Close guard blocks quit on crash | Can't close frozen app | 5s timeout → force close |
| Multiple IPC listeners on HMR | Memory leak | All preload APIs return cleanup functions |
| macOS Cmd+Q vs window close | Different event chains | `before-quit` sets `isQuitting` flag |
| Windows Chinese path in argv | Path extraction fails | `path.resolve()` handles Unicode |
| Large export + ZIP | Memory pressure | fflate processes in-memory; 5MB typical, <50MB extreme; acceptable |
