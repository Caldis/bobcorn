# Quick Start

## Prerequisites

- **fnm** (Fast Node Manager) installed via WinGet
- **Node 18** (managed by fnm)

## Setup (one-time)

```bash
# Activate fnm and switch to Node 18
FNM="/c/Users/mail/AppData/Local/Microsoft/WinGet/Packages/Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe/fnm.exe"
eval "$("$FNM" env --shell bash)" && "$FNM" use 18

# Install dependencies
cd /d/Code/bobcorn && npm install
```

## Build & Run

```bash
# Kill stale Electron processes first
taskkill /f /im electron.exe 2>/dev/null

# Build all three bundles (main + preload + renderer) and launch
npx electron-vite build && npx electron-vite preview
```

## Dev Mode (hot reload)

```bash
npx electron-vite dev
```

## Test

```bash
# Unit tests (Vitest)
npx vitest run

# E2E acceptance (Playwright, requires build first)
npx electron-vite build && node test/e2e/acceptance.js
```

## Lint & Format

```bash
npm run lint          # ESLint check
npm run lint:fix      # ESLint auto-fix
npm run format        # Prettier format
```

## Package for Distribution

```bash
npm run package-win   # Windows NSIS installer
npm run package-mac   # macOS DMG
npm run package-linux # Linux deb + AppImage
```

## Key Paths

| Path | Purpose |
|------|---------|
| `app/` | All source code |
| `out/` | Build output (generated, do not edit) |
| `release/` | Packaged installers |
| `test/` | Unit + E2E tests |
| `screenshots/` | Acceptance test screenshots |
