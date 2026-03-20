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

## Dev Mode (HMR, preferred)

```bash
npx electron-vite dev
```

Renderer 改动自动热更新。main/preload 改动需重启：

```bash
# 先杀旧进程 (按命令行路径精确匹配 bobcorn，避免误杀其他 Electron 应用)
powershell -Command "Get-CimInstance Win32_Process -Filter \"name='electron.exe'\" | Where-Object { \$_.CommandLine -like '*bobcorn*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }"
npx electron-vite dev
```

## Test

```bash
# Unit tests (Vitest, 169 tests)
npx vitest run

# E2E acceptance (21 checks, requires build)
npx electron-vite build && node test/e2e/acceptance.js

# Full E2E flow (15 steps, requires build)
npx electron-vite build && node test/e2e/full-e2e.js

# Security audit
npm run security-audit
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
| `src/` | All source code (main, preload, renderer) |
| `out/` | Build output (generated, do not edit) |
| `release/` | Packaged installers |
| `test/` | Unit + E2E tests |
| `screenshots/` | Acceptance test screenshots |
