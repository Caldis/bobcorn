# Bobcorn

> A desktop tool for building and managing icon fonts.

<!-- screenshot placeholder -->

## Features

- Import SVG icons via drag-and-drop or file dialog
- Organize icons into groups
- Generate icon fonts in multiple formats: SVG, TTF, WOFF, WOFF2, EOT
- Generate demo pages with CSS class and SVG symbol usage
- Export/import project files
- Cross-platform: Windows, macOS, Linux

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Electron 28 |
| UI | React 18 + antd 5 |
| State | Zustand |
| Build | electron-vite |
| Database | sql.js (SQLite, WASM) |
| Packaging | electron-builder |

## Getting Started

### Prerequisites

- Node.js 18+ (recommend using [fnm](https://github.com/Schniz/fnm))
- npm 8+

### Install

```bash
npm install --legacy-peer-deps
```

### Development

```bash
npx electron-vite dev
```

### Build

```bash
npx electron-vite build
npx electron-vite preview  # Preview production build
```

### Package

```bash
npm run package        # Current platform
npm run package-win    # Windows
npm run package-linux  # Linux
npm run package-all    # All platforms
```

### Test

```bash
npx vitest run                  # Unit tests
node test/e2e/acceptance.js     # E2E acceptance (20 checks)
```

## Project Structure

```
bobcorn/
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.js           # Main process entry point
│   │   └── menu.js            # Application menu
│   ├── preload/               # Preload script
│   │   └── index.js           # contextBridge API (contextIsolation bridge)
│   └── renderer/              # React renderer process
│       ├── index.html         # Vite HTML template
│       ├── entry.js           # Vite renderer entry
│       ├── bootstrap.jsx      # React mount (createRoot, async DB init)
│       ├── store/             # Zustand state management
│       ├── components/        # React components (functional + hooks)
│       ├── containers/        # Root container (MainContainer)
│       ├── database/          # sql.js WASM database layer
│       ├── utils/             # SVG processing, font generators, importers
│       └── resources/         # Images, templates, static assets
├── electron.vite.config.js    # Build config (main + preload + renderer)
├── test/
│   ├── unit/                  # Vitest unit tests
│   └── e2e/                   # Playwright E2E + acceptance tests
├── docs/                      # Project documentation and roadmaps
└── package.json
```

## License

MIT -- see [LICENSE](LICENSE) for details.
