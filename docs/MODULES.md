# Module Registry

## Architecture Overview

```
Electron Main Process          Renderer Process (React)
┌─────────────────┐           ┌──────────────────────────────┐
│  main.js    │◄── IPC ──►│  entry.js → bootstrap.jsx    │
│  menu.js        │           │    ├── store/                 │
│                 │           │    ├── database/               │
├─────────────────┤           │    ├── containers/             │
│  preload.js     │           │    ├── components/             │
│  (contextBridge)│           │    ├── config/                 │
└─────────────────┘           │    └── utils/                  │
                              └──────────────────────────────┘
```

## Modules

### `src/main/index.js` — Main Process

Electron main process entry. Creates BrowserWindow, registers IPC handlers, builds native menu.

- **IPC channels:** `window-minimize`, `window-maximize`, `window-close`, `window-is-maximized`, `dialog-show-open`, `dialog-show-save`, `get-app-path`, `install-update`
- **Security:** `nodeIntegration: false`, `contextIsolation: true`, `sandbox: false`
- **Related:** `src/main/menu.js` (native menu builder)

### `src/preload/index.js` — Preload / Context Bridge

Exposes safe APIs to the renderer via `window.electronAPI`. This is the **only** bridge between Node.js and the browser context.

- **Exposed APIs:** window controls, dialogs, file system (read/write/stat/exists/mkdir), path utilities, OS platform, auto-update events
- **Pattern:** All Node.js access from renderer must go through `window.electronAPI.*`

### `src/renderer/store/index.js` — State Management (Zustand)

Single Zustand store for all UI state. Replaces the legacy GlobalEvent pub/sub system.

- **Key files:** `src/renderer/store/index.js`
- **See also:** [`src/renderer/store/README.md`](../src/renderer/store/README.md)

### `src/renderer/database/index.js` — Data Layer (sql.js)

In-memory SQLite database via sql.js (ASM build). Manages projects, icon groups, and icons.

- **Key files:** `src/renderer/database/index.js`
- **Init:** Async — `bootstrap.jsx` awaits `dbReady` before rendering
- **See also:** [`src/renderer/database/README.md`](../src/renderer/database/README.md)

### `src/renderer/components/` — React Components

All functional components with hooks. Each has its own directory with `index.jsx` + `index.module.css`.

| Component | Purpose |
|-----------|---------|
| `TitleBar/` | Custom window title bar (Win32 only) |
| `TitleBar/button/` | Window control buttons (min/max/close) |
| `SplashScreen/` | Welcome dialog (new/open project) |
| `SideMenu/` | Left panel — group navigation (antd Menu) |
| `SideGrid/` | Center panel — icon grid + toolbar wrapper |
| `IconGridLocal/` | Icon grid with drag-drop import |
| `IconToolbar/` | Toolbar (import/export/settings) |
| `IconBlock/` | Single icon card in the grid |
| `IconInfoBar/` | Bottom info bar (icon count, etc.) |
| `SideEditor/` | Right panel — icon detail editor |
| `enhance/` | Reusable UI primitives (input, badge) |

### `src/renderer/config/index.js` — Application Config

Global constants and localStorage-backed user preferences.

- **Constants:** default group, acceptable file types, Unicode PUA range (E000-F8FF)
- **User prefs:** `getOption()` / `setOption()` — icon display, block size, project history
- **Template paths:** demo HTML, CSS, JS templates for font export

### `src/renderer/utils/` — Utilities

| Submodule | Purpose | Key exports |
|-----------|---------|-------------|
| `svg/` | SVG parsing and manipulation | `SVG` class (formatSVG, getOuterHTML) |
| `sanitize.js` | DOMPurify SVG sanitization | `sanitizeSVG(html)` |
| `generators/demopageGenerator/` | Demo HTML page generation (DOM-bound) | Generates preview pages for exported fonts; CSS/JS artifacts come from `@core/font` |
| `tools/index.js` | General utilities | `generateUUID`, `sf`, `hexToDec`, `decToHex`, `throttle`, `nameOfPath`, `platform` |
| `importer/` | Icon import (file, data) | File-based and data-based icon importers |
| `loaders/` | Project file loaders | `.icp` (native), `.json` (CyberPen), project file formats |
| `spider/` | iconfont.cn crawler | Web scraping for icon resources |

### `src/core/svg/` — Glyph Preprocessing Pipeline

The single funnel every icon SVG passes through before font conversion. Environment-agnostic
(renderer / CLI / Node), pure string → string transforms, no DOM. **All export/compatibility
fixes belong here as registered transforms** — never as patches to converter libraries and
never inline at call sites.

- **Key files:** `glyph-pipeline.ts` (ordered registry + `prepareSvgForFont` entry point),
  `transforms.ts` (flatten-use-refs / fix-degenerate-arcs / strip-non-renderable),
  `normalize-winding.ts` (evenodd→nonzero winding fix for boolean-op icons, issue #2)
- **Consumers:** `core/operations/export-font.ts` (CLI), `renderer/utils/generators/iconfontGenerator/` (GUI)
- **Guards:** `test/unit/glyph-pipeline.test.js` — frozen transform manifest (name+order),
  per-transform idempotence, error isolation, and a source scan that fails if any
  svgicons2svgfont consumer bypasses `prepareSvgForFont` or re-duplicates a transform.
- **Adding a transform:** implement pure function → register in `GLYPH_TRANSFORMS` (mind the
  documented order constraints) → update the frozen manifest in the guard test → add fixture
  under `test/fixtures/`.

### `src/core/font/` — Font Artifact Pipeline

The single implementation of the SVG→font conversion shared by GUI and CLI. Pure function
interface: icon list + format set → `Map<filename, string | Uint8Array>`. Writing to disk,
zipping, and progress UI belong to the caller.

- **Key file:** `font/index.ts` — `generateFontArtifacts(icons, opts)` (opts: `fontName`,
  `formats`, `yieldEvery` for UI-thread yielding, `onProgress`, `onWarn`), plus standalone
  `generateCSS` / `generateJsSymbolSprite`.
- **Consumers:** `core/operations/export-font.ts` (CLI, no `yieldEvery`),
  `renderer/.../SideMenu/ExportDialog.tsx` (GUI, `yieldEvery: 50` + progress mapping).
- **Guards:** `test/unit/font-artifacts.test.ts` (artifact map keys/content, progress
  sequence, yieldEvery byte-determinism); `test/unit/glyph-pipeline.test.js` source scan
  (this is the only module allowed to import svgicons2svgfont, and it must call
  `prepareSvgForFont`).
