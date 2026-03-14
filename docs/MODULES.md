# Module Registry

## Architecture Overview

```
Electron Main Process          Renderer Process (React)
┌─────────────────┐           ┌──────────────────────────────┐
│  main.dev.js    │◄── IPC ──►│  entry.js → bootstrap.jsx    │
│  menu.js        │           │    ├── store/                 │
│                 │           │    ├── database/               │
├─────────────────┤           │    ├── containers/             │
│  preload.js     │           │    ├── components/             │
│  (contextBridge)│           │    ├── config/                 │
└─────────────────┘           │    └── utils/                  │
                              └──────────────────────────────┘
```

## Modules

### `app/main.dev.js` — Main Process

Electron main process entry. Creates BrowserWindow, registers IPC handlers, builds native menu.

- **IPC channels:** `window-minimize`, `window-maximize`, `window-close`, `window-is-maximized`, `dialog-show-open`, `dialog-show-save`, `get-app-path`, `install-update`
- **Security:** `nodeIntegration: false`, `contextIsolation: true`, `sandbox: false`
- **Related:** `app/menu.js` (native menu builder)

### `app/preload.js` — Preload / Context Bridge

Exposes safe APIs to the renderer via `window.electronAPI`. This is the **only** bridge between Node.js and the browser context.

- **Exposed APIs:** window controls, dialogs, file system (read/write/stat/exists/mkdir), path utilities, OS platform, auto-update events
- **Pattern:** All Node.js access from renderer must go through `window.electronAPI.*`

### `app/store/index.js` — State Management (Zustand)

Single Zustand store for all UI state. Replaces the legacy GlobalEvent pub/sub system.

- **Key files:** `app/store/index.js`
- **See also:** [`app/store/README.md`](../app/store/README.md)

### `app/database/index.js` — Data Layer (sql.js)

In-memory SQLite database via sql.js (ASM build). Manages projects, icon groups, and icons.

- **Key files:** `app/database/index.js`
- **Init:** Async — `bootstrap.jsx` awaits `dbReady` before rendering
- **See also:** [`app/database/README.md`](../app/database/README.md)

### `app/components/` — React Components

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

### `app/config/index.js` — Application Config

Global constants and localStorage-backed user preferences.

- **Constants:** default group, acceptable file types, Unicode PUA range (E000-F8FF)
- **User prefs:** `getOption()` / `setOption()` — icon display, block size, project history
- **Template paths:** demo HTML, CSS, JS templates for font export

### `app/utils/` — Utilities

| Submodule | Purpose | Key exports |
|-----------|---------|-------------|
| `svg/` | SVG parsing and manipulation | `SVG` class (formatSVG, getOuterHTML) |
| `sanitize.js` | DOMPurify SVG sanitization | `sanitizeSVG(html)` |
| `generators/iconfontGenerator/` | Font generation (SVG→TTF→WOFF→WOFF2→EOT) | Uses svgicons2svgfont, svg2ttf, ttf2woff, ttf2woff2, ttf2eot |
| `generators/demopageGenerator/` | Demo HTML page generation | Generates preview pages for exported fonts |
| `tools/index.js` | General utilities | `generateUUID`, `sf`, `hexToDec`, `decToHex`, `throttle`, `nameOfPath`, `platform` |
| `importer/` | Icon import (file, data) | File-based and data-based icon importers |
| `loaders/` | Project file loaders | `.icp` (native), `.json` (CyberPen), project file formats |
| `spider/` | iconfont.cn crawler | Web scraping for icon resources |
