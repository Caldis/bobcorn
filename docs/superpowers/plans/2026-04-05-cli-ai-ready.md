# CLI + AI-Ready Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone CLI and shared operations layer so AI Agents can operate Bobcorn without the GUI.

**Architecture:** Extract `src/core/` as a pure Node.js operations kernel with IoAdapter/CanvasAdapter DI. CLI built with commander.js + tsup. GUI store becomes thin wrappers over core. Migration enforced by ESLint + static analysis.

**Tech Stack:** TypeScript, commander.js, tsup, sql.js (ASM), @napi-rs/canvas (optional), pdf-lib

**Spec:** `docs/superpowers/specs/2026-04-05-cli-ai-ready-design.md`

---

## Parallel Track Map

```
Track A: Core Foundation ──────────────────── (blocking: others depend on this)
Track B: CLI Skeleton + Build ─────────────── (depends on A's types/interfaces)
Track C: Settings UI (CLI + AI placeholder) ── (fully independent)
Track D: Migration Infrastructure ──────────── (depends on A existing)
```

**Parallelism:** Track C is fully independent — can start immediately. Track A must complete before B and D start. B and D can run in parallel after A.

---

## Track A: Core Foundation

### Task A1: Create core directory structure and interfaces

**Files:**
- Create: `src/core/index.ts`
- Create: `src/core/io.ts`
- Create: `src/core/canvas.ts`
- Create: `src/core/types.ts`

- [ ] **Step 1: Create IoAdapter interface**

```typescript
// src/core/io.ts
export interface IoAdapter {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  resolve(...parts: string[]): string;
  join(...parts: string[]): string;
  basename(p: string, ext?: string): string;
  dirname(p: string): string;
  extname(p: string): string;
}
```

- [ ] **Step 2: Create CanvasAdapter interface**

```typescript
// src/core/canvas.ts
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasContext2D;
  toBuffer(mime: string, opts?: { quality?: number }): Promise<Uint8Array>;
}

export interface CanvasContext2D {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(img: ImageLike, x: number, y: number, w: number, h: number): void;
}

export interface ImageLike {
  width: number;
  height: number;
}

export interface CanvasAdapter {
  createCanvas(width: number, height: number): CanvasLike;
  loadImage(data: Uint8Array): Promise<ImageLike>;
}
```

- [ ] **Step 3: Extract shared types from database**

Read `src/renderer/database/index.ts` lines 51-105 for the existing type definitions (`IconData`, `GroupData`, `ProjectAttributes`, etc.). Copy them to `src/core/types.ts`. Add re-export from database file to avoid breaking existing imports during migration.

```typescript
// src/core/types.ts
export interface IconData {
  id: string;
  iconCode: string;
  iconName: string;
  iconGroup: string;
  iconSize: number;
  iconType: string;
  iconContent: string;
  variantOf?: string | null;
  variantMeta?: string | null;
  isFavorite?: number;
  originalContent?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GroupData {
  id: string;
  groupName: string;
  groupOrder: number;
  groupColor: string;
  groupDescription?: string;
}

export interface ProjectAttributes {
  projectName: string;
  projectPrefix: string;
  projectVersion: string;
  [key: string]: string;
}

// Export format types (from renderer/utils/export/presets.ts)
export type ExportFormat = 'svg' | 'png' | 'jpg' | 'webp' | 'pdf' | 'ico';
export type SizeMode = 'scale' | 'pixel';

export interface ExportRowConfig {
  sizeMode: SizeMode;
  sizeValue: number;
  format: ExportFormat;
}

export interface PresetDef {
  id: string;
  label: string;
  rows: ExportRowConfig[];
}
```

- [ ] **Step 4: Create barrel export**

```typescript
// src/core/index.ts
export type { IoAdapter } from './io';
export type { CanvasAdapter, CanvasLike, CanvasContext2D, ImageLike } from './canvas';
export type {
  IconData, GroupData, ProjectAttributes,
  ExportFormat, SizeMode, ExportRowConfig, PresetDef,
} from './types';
```

- [ ] **Step 5: Add `@core` path alias to tsconfig.json**

Read current `tsconfig.json`. Add path alias:

```json
{
  "paths": {
    "@/*": ["src/renderer/*"],
    "@core/*": ["src/core/*"]
  }
}
```

Also add `@core` alias to `electron.vite.config.js` renderer resolve aliases (look for existing `@/` alias pattern and add `@core/` alongside it).

- [ ] **Step 6: Commit**

```bash
git add src/core/ tsconfig.json electron.vite.config.js
git commit -m "feat(core): add core layer with IoAdapter, CanvasAdapter, and shared types"
```

### Task A2: Create operations registry

**Files:**
- Create: `src/core/registry.ts`
- Modify: `src/core/index.ts`

- [ ] **Step 1: Write registry with complete operation inventory**

Read the full spec section 6.1 for registry structure. Also scan the codebase for all user-facing operations:
- All store actions in `src/renderer/store/index.ts` that call `db.*`
- All component direct db calls from the 21-file inventory in spec section 2.5
- All export operations (font generation in ExportDialog + icon rasterization in IconExportDialog)

Create `src/core/registry.ts` with every operation. Use `OpStatus.Legacy` for all existing operations (none are migrated yet). Set `cliCommand` to the corresponding CLI command from spec section 3.2, or `null` for internal-only ops.

The full list should include at minimum:
- project.create, project.save, project.inspect, project.set-name, project.set-prefix, project.open-file, project.reset
- icon.import, icon.list, icon.rename, icon.move, icon.copy, icon.delete, icon.set-code, icon.replace, icon.export-svg, icon.set-favorite, icon.set-color, icon.get-content
- group.list, group.add, group.rename, group.delete, group.reorder, group.set-description, group.move-icons
- export.font, export.icon, export.svg, export.demo-page
- variant.generate, variant.list, variant.delete
- search.query
- favorite.list

- [ ] **Step 2: Add registry to barrel export**

```typescript
// Append to src/core/index.ts
export { OpStatus, OPERATIONS } from './registry';
export type { OpEntry } from './registry';
```

- [ ] **Step 3: Commit**

```bash
git add src/core/registry.ts src/core/index.ts
git commit -m "feat(core): add operations registry with full operation inventory"
```

### Task A3: Move pure export modules to core

**Files:**
- Create: `src/core/operations/export-presets.ts` (from `src/renderer/utils/export/presets.ts`)
- Create: `src/core/operations/export-formats.ts` (from `src/renderer/utils/export/formats.ts`)
- Modify: `src/renderer/utils/export/presets.ts` → re-export from core
- Modify: `src/renderer/utils/export/formats.ts` → re-export from core
- Test: `test/unit/export-presets.test.js` (existing, verify still passes)

- [ ] **Step 1: Move presets.ts to core**

Read `src/renderer/utils/export/presets.ts`. Copy to `src/core/operations/export-presets.ts`. Update imports to use types from `@core/types` instead of local. The file should have zero browser/window dependencies (confirmed by codebase analysis).

Replace original file with re-export:
```typescript
// src/renderer/utils/export/presets.ts
export { PRESETS, buildFilename, computeOutputSize } from '@core/operations/export-presets';
export type { ExportRowConfig, PresetDef } from '@core/types';
```

- [ ] **Step 2: Move formats.ts to core**

Read `src/renderer/utils/export/formats.ts`. Copy to `src/core/operations/export-formats.ts`. The ICO encoder is pure binary math. The PDF generator uses `pdf-lib` (pure JS). No browser deps.

Replace original file with re-export:
```typescript
// src/renderer/utils/export/formats.ts
export { buildIcoBuffer, buildPdfBuffer } from '@core/operations/export-formats';
```

- [ ] **Step 3: Run existing tests to verify nothing broke**

```bash
npx vitest run test/unit/export-presets.test.js test/unit/export-ico-pdf.test.js
```

Expected: all tests pass (re-exports are transparent).

- [ ] **Step 4: Commit**

```bash
git add src/core/operations/ src/renderer/utils/export/presets.ts src/renderer/utils/export/formats.ts
git commit -m "refactor(core): move export presets and formats to core operations layer"
```

---

## Track B: CLI Skeleton + Build

> **Depends on:** Track A (needs types and interfaces from `src/core/`)

### Task B1: Set up tsup build and CLI entry point

**Files:**
- Create: `tsup.config.ts`
- Create: `src/cli/index.ts`
- Create: `src/cli/io-node.ts`
- Create: `src/cli/output.ts`
- Modify: `package.json` (add bin, build:cli script, commander dep)

- [ ] **Step 1: Install dependencies**

```bash
npm install commander@12 --save
npm install tsup --save-dev
```

- [ ] **Step 2: Create tsup config**

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  outDir: 'out/cli',
  format: ['cjs'],
  target: 'node18',
  clean: true,
  external: ['sql.js', '@napi-rs/canvas', 'pdf-lib'],
  banner: { js: '#!/usr/bin/env node' },
});
```

- [ ] **Step 3: Create Node.js IoAdapter**

```typescript
// src/cli/io-node.ts
import fs from 'fs/promises';
import path from 'path';
import type { IoAdapter } from '@core/io';

export const nodeIo: IoAdapter = {
  readFile: (p) => fs.readFile(p),
  writeFile: (p, data) => fs.writeFile(p, data),
  exists: async (p) => { try { await fs.access(p); return true; } catch { return false; } },
  mkdir: (p, opts) => fs.mkdir(p, opts).then(() => {}),
  resolve: (...parts) => path.resolve(...parts),
  join: (...parts) => path.join(...parts),
  basename: (p, ext) => path.basename(p, ext),
  dirname: (p) => path.dirname(p),
  extname: (p) => path.extname(p),
};
```

- [ ] **Step 4: Create output formatter**

Read spec section 3.3 for the JSON envelope schema. Implement:

```typescript
// src/cli/output.ts
interface CliMeta {
  command: string;
  projectPath: string;
  duration_ms: number;
  version: string;
}

interface CliOutput<T = unknown> {
  ok: boolean;
  error: string | null;
  code: string | null;
  warnings: string[];
  data: T | null;
  meta: CliMeta;
}

export function jsonOutput<T>(data: T, meta: CliMeta, warnings: string[] = []): CliOutput<T> {
  return { ok: true, error: null, code: null, warnings, data, meta };
}

export function jsonError(error: string, code: string, meta: CliMeta, warnings: string[] = [], data: unknown = null): CliOutput {
  return { ok: false, error, code, warnings, data, meta };
}

export function printResult(result: CliOutput, jsonMode: boolean): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    if (!result.ok) {
      process.stderr.write(`Error: ${result.error}\n`);
      result.warnings.forEach(w => process.stderr.write(`  Warning: ${w}\n`));
    }
    // Human-readable output handled per-command
  }
}
```

- [ ] **Step 5: Create CLI entry point with `project inspect` as the first real command**

```typescript
// src/cli/index.ts
import { Command } from 'commander';
import { nodeIo } from './io-node';
import { jsonOutput, jsonError, printResult } from './output';

const VERSION = '__CLI_VERSION__'; // replaced at build time or read from package.json

const program = new Command()
  .name('bobcorn')
  .description('Icon font manager and generator CLI — AI-agent friendly')
  .version(VERSION)
  .option('--json', 'Structured JSON output');

// --- project ---
const project = program.command('project').description('Project operations');

project
  .command('inspect <icp>')
  .description('Show project metadata and statistics')
  .action(async (icpPath: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = { command: 'project inspect', projectPath: icpPath, duration_ms: 0, version: VERSION };
    try {
      // TODO(A-complete): wire to core.operations.project.inspect()
      // For now, validate file exists
      if (!(await nodeIo.exists(icpPath))) {
        meta.duration_ms = Date.now() - start;
        printResult(jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta), jsonMode);
        process.exit(2);
      }
      meta.duration_ms = Date.now() - start;
      printResult(jsonOutput({ path: icpPath, status: 'valid' }, meta), jsonMode);
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      printResult(jsonError(err.message, 'FILE_IO_ERROR', meta), jsonMode);
      process.exit(2);
    }
  });

// --- placeholder commands (wired as Track A operations are migrated) ---
const icon = program.command('icon').description('Icon operations');
icon.command('list <icp>').description('List icons in project').action(() => {
  console.error('Not yet implemented — awaiting core migration');
  process.exit(1);
});
icon.command('import <icp> <svgs...>').description('Import SVG files').action(() => {
  console.error('Not yet implemented — awaiting core migration');
  process.exit(1);
});

const group = program.command('group').description('Group operations');
group.command('list <icp>').description('List groups').action(() => {
  console.error('Not yet implemented — awaiting core migration');
  process.exit(1);
});

const exp = program.command('export').description('Export operations');
exp.command('font <icp>').description('Export font files').action(() => {
  console.error('Not yet implemented — awaiting core migration');
  process.exit(1);
});
exp.command('icon <icp> <ids...>').description('Export icon image files').action(() => {
  console.error('Not yet implemented — awaiting core migration');
  process.exit(1);
});
exp.command('svg <icp>').description('Export SVG files').action(() => {
  console.error('Not yet implemented — awaiting core migration');
  process.exit(1);
});

const variant = program.command('variant').description('Variant operations');
variant.command('list <icp> <id>').description('List variants of icon').action(() => {
  console.error('Not yet implemented — awaiting core migration');
  process.exit(1);
});

program.command('search <icp> <query>').description('Search icons').action(() => {
  console.error('Not yet implemented — awaiting core migration');
  process.exit(1);
});

const favorite = program.command('favorite').description('Favorite operations');
favorite.command('list <icp>').description('List favorites').action(() => {
  console.error('Not yet implemented — awaiting core migration');
  process.exit(1);
});

program.parse();
```

- [ ] **Step 6: Update package.json**

Add to `scripts`:
```json
"build:cli": "tsup",
"build": "electron-vite build && tsup"
```

Add `bin` field:
```json
"bin": { "bobcorn": "out/cli/index.cjs" }
```

Add to `build.asarUnpack`:
```json
"out/cli/**"
```

- [ ] **Step 7: Test build**

```bash
npx tsup
node out/cli/index.cjs --version
node out/cli/index.cjs --help
node out/cli/index.cjs --help --json
node out/cli/index.cjs project inspect nonexistent.icp --json
```

Expected: version prints, help shows command tree, inspect with nonexistent file returns JSON error with `FILE_NOT_FOUND` code.

- [ ] **Step 8: Commit**

```bash
git add tsup.config.ts src/cli/ package.json package-lock.json
git commit -m "feat(cli): add CLI skeleton with commander, tsup build, and project inspect command"
```

### Task B2: Create CLI install/uninstall logic

**Files:**
- Create: `src/cli/install.ts`
- Test: Manual test on current platform

- [ ] **Step 1: Implement PATH registration logic**

Read spec section 4.2 for macOS and Windows strategies. Implement:

```typescript
// src/cli/install.ts
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

export interface InstallResult {
  success: boolean;
  message: string;
  path: string;       // where the CLI was installed
  needsRestart: boolean;
}

export function getCliSourcePath(): string {
  // When running inside packaged app: <app>/resources/app.asar.unpacked/out/cli/index.cjs
  // When running in dev: <project>/out/cli/index.cjs
  return path.resolve(__dirname, 'index.cjs');
}

export function detectInstallStatus(): { installed: boolean; version: string | null; path: string | null } {
  try {
    const result = execSync('bobcorn --version', { encoding: 'utf8', timeout: 5000 }).trim();
    return { installed: true, version: result, path: execSync(os.platform() === 'win32' ? 'where bobcorn' : 'which bobcorn', { encoding: 'utf8', timeout: 5000 }).trim().split('\n')[0] };
  } catch {
    return { installed: false, version: null, path: null };
  }
}

export function install(): InstallResult {
  const source = getCliSourcePath();
  if (os.platform() === 'win32') {
    return installWindows(source);
  } else {
    return installUnix(source);
  }
}

export function uninstall(): InstallResult {
  if (os.platform() === 'win32') {
    return uninstallWindows();
  } else {
    return uninstallUnix();
  }
}

function installWindows(source: string): InstallResult {
  const cliDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Bobcorn', 'cli');
  fs.mkdirSync(cliDir, { recursive: true });
  const wrapperPath = path.join(cliDir, 'bobcorn.cmd');
  fs.writeFileSync(wrapperPath, `@echo off\r\n"${process.execPath}" "${source}" %*\r\n`);

  // Add to User PATH if not already there
  try {
    const currentPath = execSync('reg query "HKCU\\Environment" /v Path', { encoding: 'utf8' });
    if (!currentPath.includes(cliDir)) {
      const pathValue = currentPath.match(/REG_(?:EXPAND_)?SZ\s+(.+)/)?.[1]?.trim() || '';
      const newPath = pathValue ? `${pathValue};${cliDir}` : cliDir;
      execSync(`reg add "HKCU\\Environment" /v Path /t REG_EXPAND_SZ /d "${newPath}" /f`);
      // Broadcast WM_SETTINGCHANGE
      execSync('powershell -Command "[Environment]::SetEnvironmentVariable(\'Path\', [Environment]::GetEnvironmentVariable(\'Path\', \'User\'), \'User\')"');
    }
  } catch {
    // PATH might not exist yet
    execSync(`reg add "HKCU\\Environment" /v Path /t REG_EXPAND_SZ /d "${cliDir}" /f`);
  }

  return { success: true, message: 'CLI installed to PATH', path: wrapperPath, needsRestart: true };
}

function installUnix(source: string): InstallResult {
  const localBin = path.join(os.homedir(), '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  const linkPath = path.join(localBin, 'bobcorn');

  // Create wrapper script (not symlink — handles node path)
  fs.writeFileSync(linkPath, `#!/bin/sh\nexec "${process.execPath}" "${source}" "$@"\n`);
  fs.chmodSync(linkPath, 0o755);

  // Check if ~/.local/bin is in PATH, suggest shell RC update if not
  const currentPath = process.env.PATH || '';
  let needsRcUpdate = !currentPath.includes(localBin);
  if (needsRcUpdate) {
    const shell = process.env.SHELL || '/bin/zsh';
    const rcFile = shell.includes('zsh') ? '~/.zshrc' : '~/.bashrc';
    return {
      success: true,
      message: `CLI installed. Add to PATH: echo 'export PATH="$HOME/.local/bin:$PATH"' >> ${rcFile}`,
      path: linkPath,
      needsRestart: true,
    };
  }

  return { success: true, message: 'CLI installed to PATH', path: linkPath, needsRestart: false };
}

function uninstallWindows(): InstallResult {
  const cliDir = path.join(process.env.LOCALAPPDATA || '', 'Bobcorn', 'cli');
  const wrapperPath = path.join(cliDir, 'bobcorn.cmd');
  try { fs.unlinkSync(wrapperPath); } catch {}
  return { success: true, message: 'CLI removed from PATH', path: wrapperPath, needsRestart: true };
}

function uninstallUnix(): InstallResult {
  const linkPath = path.join(os.homedir(), '.local', 'bin', 'bobcorn');
  try { fs.unlinkSync(linkPath); } catch {}
  return { success: true, message: 'CLI removed', path: linkPath, needsRestart: false };
}
```

- [ ] **Step 2: Add --install and --uninstall flags to CLI entry**

In `src/cli/index.ts`, add before `program.parse()`:
```typescript
program
  .command('install')
  .description('Install bobcorn CLI to system PATH')
  .action(() => {
    const result = install();
    if (program.opts().json) {
      process.stdout.write(JSON.stringify({ ok: result.success, data: result }) + '\n');
    } else {
      console.log(result.message);
      if (result.needsRestart) console.log('Note: Open a new terminal to use the `bobcorn` command.');
    }
  });

program
  .command('uninstall')
  .description('Remove bobcorn CLI from system PATH')
  .action(() => {
    const result = uninstall();
    if (program.opts().json) {
      process.stdout.write(JSON.stringify({ ok: result.success, data: result }) + '\n');
    } else {
      console.log(result.message);
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/install.ts src/cli/index.ts
git commit -m "feat(cli): add install/uninstall logic for macOS and Windows PATH registration"
```

---

## Track C: Settings UI (CLI + AI Placeholder)

> **Fully independent** — pure renderer UI work, no core dependency.

### Task C1: Add CLI section to Settings dialog

**Files:**
- Modify: `src/renderer/components/SideMenu/SettingsDialog.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh-CN.json`
- Modify: `src/main/index.ts` (add IPC for CLI status check)
- Modify: `src/preload/index.ts` (expose CLI status IPC)

- [ ] **Step 1: Add i18n keys**

Read current `src/locales/en.json` and `src/locales/zh-CN.json`. Add keys under `settings.cli.*` and `settings.ai.*` namespaces:

English keys:
```json
{
  "settings.cli.title": "Command Line Interface",
  "settings.cli.description": "Allow interaction with Bobcorn from the terminal. AI-agent friendly.",
  "settings.cli.statusInstalled": "Installed (v{{version}})",
  "settings.cli.statusNotInstalled": "Not installed",
  "settings.cli.statusOutdated": "Outdated (v{{version}} installed, v{{latest}} available)",
  "settings.cli.install": "Install CLI to PATH",
  "settings.cli.uninstall": "Uninstall",
  "settings.cli.manualSetup": "Manual setup",
  "settings.cli.checking": "Checking...",
  "settings.cli.restartHint": "Open a new terminal to use the bobcorn command.",
  "settings.cli.installSuccess": "CLI installed successfully",
  "settings.cli.installError": "Failed to install CLI: {{error}}",

  "settings.ai.title": "Bobcorn AI",
  "settings.ai.comingSoon": "Coming Soon",
  "settings.ai.description": "Intelligent features powered by AI to supercharge your icon workflow.",
  "settings.ai.whatscoming": "What's coming",
  "settings.ai.smartGrouping": "Smart Grouping",
  "settings.ai.smartGroupingDesc": "Auto-organize imported icons by content",
  "settings.ai.nameNormalization": "Name Normalization",
  "settings.ai.nameNormalizationDesc": "Unify naming conventions across your set",
  "settings.ai.duplicateDetection": "Duplicate Detection",
  "settings.ai.duplicateDetectionDesc": "Find visually similar icons instantly",
  "settings.ai.iconGeneration": "Icon Generation",
  "settings.ai.iconGenerationDesc": "Describe an icon, get SVG matching your set's style",
  "settings.ai.styleCheck": "Style Consistency Check",
  "settings.ai.styleCheckDesc": "Detect mismatched strokes, fills, corners",
  "settings.ai.setCompletion": "Icon Set Completion",
  "settings.ai.setCompletionDesc": "Suggest missing icons for common UI patterns",
  "settings.ai.a11yDescriptions": "Accessibility Descriptions",
  "settings.ai.a11yDescriptionsDesc": "Auto-generate semantic alt text for icons",
  "settings.ai.smartUnicode": "Smart Unicode Assignment",
  "settings.ai.smartUnicodeDesc": "Semantically meaningful code point allocation",
  "settings.ai.variantIntelligence": "Variant Intelligence",
  "settings.ai.variantIntelligenceDesc": "AI-recommended weight & scale parameters",
  "settings.ai.stayTuned": "Stay tuned for updates."
}
```

Chinese keys (corresponding translations for all above).

- [ ] **Step 2: Add IPC handler in main process**

In `src/main/index.ts`, add IPC handler for CLI status detection. Find the existing IPC handler section (after `ipcMain.on('window-minimize'...`):

```typescript
ipcMain.handle('cli-detect-status', async () => {
  try {
    const { execSync } = require('child_process');
    const version = execSync('bobcorn --version', { encoding: 'utf8', timeout: 5000 }).trim();
    return { installed: true, version };
  } catch {
    return { installed: false, version: null };
  }
});

ipcMain.handle('cli-install', async () => {
  try {
    // Import install logic — this will be available after CLI is built
    // For now, return a placeholder that the settings UI can handle
    const cliPath = path.join(app.getAppPath(), 'out', 'cli', 'index.cjs');
    const { install } = require(cliPath.replace('app.asar', 'app.asar.unpacked') + '/../install');
    return install();
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('cli-uninstall', async () => {
  try {
    const cliPath = path.join(app.getAppPath(), 'out', 'cli', 'index.cjs');
    const { uninstall } = require(cliPath.replace('app.asar', 'app.asar.unpacked') + '/../install');
    return uninstall();
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});
```

- [ ] **Step 3: Expose IPC in preload**

In `src/preload/index.ts`, add to the `electronAPI` object:

```typescript
// CLI management
cliDetectStatus: (): Promise<{ installed: boolean; version: string | null }> =>
  ipcRenderer.invoke('cli-detect-status'),
cliInstall: (): Promise<{ success: boolean; message: string; path?: string; needsRestart?: boolean }> =>
  ipcRenderer.invoke('cli-install'),
cliUninstall: (): Promise<{ success: boolean; message: string }> =>
  ipcRenderer.invoke('cli-uninstall'),
```

- [ ] **Step 4: Add CLI section to SettingsDialog**

Read `src/renderer/components/SideMenu/SettingsDialog.tsx` fully. Find the section structure (Language, Appearance, Update, Advanced, Version). Add a new **"Command Line Interface"** section between "Update" and "Advanced".

The section should include:
- Title + description text
- Status indicator (loading spinner → installed/not installed/outdated)
- Install/Uninstall button (calls IPC)
- "Manual setup" link (opens wiki URL)
- Restart hint text after successful install

Use the same UI patterns as existing sections (collapsible sections, `Switch`/`Button` components from `../ui`). Call `electronAPI.cliDetectStatus()` on section mount.

- [ ] **Step 5: Add AI placeholder section to SettingsDialog**

Add a **"Bobcorn AI"** section after "Command Line Interface". This is a static display section — no interactivity:

- Header: `t('settings.ai.title')` with "Coming Soon" badge (small rounded pill, muted style)
- Description text
- Feature list: 9 items, each with a `▸` bullet, name (bold), and description (muted text)
- Footer: `t('settings.ai.stayTuned')`

Style the "Coming Soon" badge to be visually attractive but clearly non-functional. Use existing design patterns from the codebase.

- [ ] **Step 6: Test with HMR**

The dev server should hot-reload. Open Settings dialog, verify:
- CLI section shows "Checking..." briefly then "Not installed" (CLI hasn't been built yet)
- AI section renders all 9 features with Coming Soon badge
- Both sections have proper i18n in both languages (toggle language to verify)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/SideMenu/SettingsDialog.tsx src/locales/ src/main/index.ts src/preload/index.ts
git commit -m "feat(settings): add CLI management section and AI assistant placeholder"
```

---

## Track D: Migration Infrastructure

> **Depends on:** Track A (needs `src/core/` to exist for import paths)

### Task D1: Add ESLint boundary enforcement

**Files:**
- Modify: `.eslintrc.cjs` or equivalent ESLint config
- Test: `npx eslint src/renderer/components/IconBlock/index.tsx` should show warning (existing legacy)

- [ ] **Step 1: Read current ESLint config**

Find and read the ESLint configuration file (`.eslintrc.cjs`, `.eslintrc.json`, or `eslint.config.js`). Understand the current override structure.

- [ ] **Step 2: Add `no-restricted-imports` rule for renderer**

Add override for `src/renderer/**` files using the `patterns` form (spec section 6.2):

```javascript
{
  files: ['src/renderer/**/*.{ts,tsx,js,jsx}'],
  rules: {
    'no-restricted-imports': ['warn', {  // warn during migration, error once complete
      patterns: [{
        group: ['**/database', '**/database/**'],
        message: 'Import from @core/operations instead. See docs/MIGRATION.md'
      }]
    }]
  }
}
```

Use `warn` (not `error`) initially — the 21 existing import sites need `eslint-disable` annotations first, but we don't want to block development during migration.

- [ ] **Step 3: Annotate existing legacy imports**

For each of the 21 files listed in spec section 2.5, add `// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): <operation-id>` above the `import db` line. Use a script or do it manually.

- [ ] **Step 4: Verify lint passes**

```bash
npx eslint src/renderer/ --ext .ts,.tsx,.js,.jsx --max-warnings 999
```

Expected: 0 errors, 0 new warnings (all existing imports have disable comments).

- [ ] **Step 5: Commit**

```bash
git add .eslintrc* src/renderer/
git commit -m "chore(migration): add ESLint boundary rule for database imports with legacy annotations"
```

### Task D2: Create boundary guard test

**Files:**
- Create: `test/unit/core-boundary-guard.test.js`

- [ ] **Step 1: Write the boundary guard test**

Model after existing `test/unit/variant-guard.test.js`. Scan `src/renderer/**` for:
1. Direct imports of `database` that aren't in the approved legacy list
2. Any `window.` usage in `src/core/**`
3. Every `OpStatus.Core` registry entry with non-null `cliCommand` has a matching CLI command file

```javascript
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { OPERATIONS, OpStatus } from '../../src/core/registry';

// Approved legacy imports — these files are known to import from database directly.
// As operations are migrated to core, remove entries from this list.
// The goal is to reach ZERO entries.
const APPROVED_LEGACY = new Set([
  'src/renderer/bootstrap.tsx',
  'src/renderer/store/index.ts',
  'src/renderer/containers/MainContainer/index.tsx',
  'src/renderer/components/IconBlock/index.tsx',
  'src/renderer/components/IconGridLocal/index.tsx',
  'src/renderer/components/IconInfoBar/index.tsx',
  'src/renderer/components/GroupIconPreview.tsx',
  'src/renderer/components/BatchPanel/index.tsx',
  'src/renderer/components/SideEditor/index.tsx',
  'src/renderer/components/SideEditor/VariantPanel.tsx',
  'src/renderer/components/SideMenu/index.tsx',
  'src/renderer/components/SideMenu/GroupList.tsx',
  'src/renderer/components/SideMenu/GroupDialogs.tsx',
  'src/renderer/components/SideMenu/ExportDialog.tsx',
  'src/renderer/components/SideMenu/SettingsDialog.tsx',
  'src/renderer/components/SideMenu/ResourceNav.tsx',
  'src/renderer/utils/variantGuard.ts',
  'src/renderer/utils/generators/demopageGenerator/index.ts',
  'src/renderer/utils/loaders/cpLoader/index.ts',
  'src/renderer/utils/loaders/icpLoader/index.ts',
]);

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

describe('Core boundary guard', () => {
  test('no unapproved database imports in renderer', () => {
    const rendererFiles = walk(join(__dirname, '../../src/renderer'));
    const dbImportPattern = /(?:import .+ from ['"].*\/database['"]|require\(['"].*\/database['"]\))/;
    const violations = [];

    for (const file of rendererFiles) {
      const rel = relative(join(__dirname, '../..'), file).replace(/\\/g, '/');
      if (rel.startsWith('src/renderer/database/')) continue; // database itself is fine
      const content = readFileSync(file, 'utf8');
      if (dbImportPattern.test(content) && !APPROVED_LEGACY.has(rel)) {
        violations.push(rel);
      }
    }

    expect(violations, `Unapproved database imports found. Add to APPROVED_LEGACY or migrate to core:\n${violations.join('\n')}`).toEqual([]);
  });

  test('no window/browser globals in core', () => {
    const coreDir = join(__dirname, '../../src/core');
    let coreFiles;
    try { coreFiles = walk(coreDir); } catch { return; } // core might not exist yet
    const browserGlobals = /\b(window\.|document\.|navigator\.|import\.meta\.env)/;
    const violations = [];

    for (const file of coreFiles) {
      const content = readFileSync(file, 'utf8');
      const rel = relative(join(__dirname, '../..'), file).replace(/\\/g, '/');
      content.split('\n').forEach((line, i) => {
        if (browserGlobals.test(line) && !line.trimStart().startsWith('//')) {
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations, `Browser globals found in core:\n${violations.join('\n')}`).toEqual([]);
  });

  test('every CLI-exposed core operation has a command file', () => {
    const cliExposed = OPERATIONS.filter(op => op.status === OpStatus.Core && op.cliCommand !== null);
    // This test will matter once operations are migrated. For now, just verify structure.
    // When operations start being migrated to Core, this test ensures CLI commands keep up.
    for (const op of cliExposed) {
      // Verify the CLI command file exists (by convention: src/cli/commands/<domain>.ts)
      const domain = op.cliCommand!.split(' ')[0]; // e.g., 'icon import' → 'icon'
      // We don't check file existence yet — commands are stubs in index.ts during Track B
      expect(op.cliCommand).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run test/unit/core-boundary-guard.test.js
```

Expected: all pass (approved legacy list matches current state, core has no browser globals).

- [ ] **Step 3: Commit**

```bash
git add test/unit/core-boundary-guard.test.js
git commit -m "test(migration): add core boundary guard — tracks database import migration progress"
```

### Task D3: Create migration tracking docs

**Files:**
- Create: `docs/MIGRATION.md`
- Create: `scripts/migration-status.js`
- Modify: `AGENTS.md` (add core-first convention)
- Modify: `docs/CONVENTIONS.md` (add core-first convention)

- [ ] **Step 1: Create migration status script**

```javascript
// scripts/migration-status.js
// Generates migration progress table from registry.ts
// Usage: node scripts/migration-status.js

const { OPERATIONS, OpStatus } = require('../src/core/registry');

const statusEmoji = { [OpStatus.Core]: '✅', [OpStatus.Legacy]: '🔴', [OpStatus.Migrating]: '🟡' };

console.log('| Operation | Status | Legacy locations | CLI command |');
console.log('|-----------|--------|-----------------|-------------|');
for (const op of OPERATIONS) {
  const emoji = statusEmoji[op.status] || '❓';
  const legacy = op.legacyPaths?.join(', ') || '—';
  const cli = op.cliCommand || '(internal)';
  console.log(`| ${op.id} | ${emoji} ${op.status} | ${legacy} | ${cli} |`);
}

const total = OPERATIONS.length;
const core = OPERATIONS.filter(o => o.status === OpStatus.Core).length;
const legacy = OPERATIONS.filter(o => o.status === OpStatus.Legacy).length;
const migrating = OPERATIONS.filter(o => o.status === OpStatus.Migrating).length;
console.log(`\nTotal: ${total} | Core: ${core} | Migrating: ${migrating} | Legacy: ${legacy}`);
console.log(`Progress: ${Math.round(core / total * 100)}%`);
```

- [ ] **Step 2: Create MIGRATION.md**

```markdown
# Core Migration Guide

## Overview

Bobcorn is migrating business logic from `src/renderer/` to `src/core/` so that both GUI and CLI share the same code. This doc tracks progress and process.

## Current Progress

Run `node scripts/migration-status.js` to see the latest status.

## How to Migrate an Operation

1. Find the operation in `src/core/registry.ts`, update status to `Migrating`
2. Create/update the operation function in `src/core/operations/<domain>.ts`
3. The operation receives `IoAdapter` (and `CanvasAdapter` if needed) — never import `fs`, `path`, `window`, or `electronAPI`
4. Update the store action to be a thin wrapper: call core operation → update Zustand UI state
5. Update components that called `db.*` directly to go through the store action
6. Add/update the CLI command in `src/cli/commands/<domain>.ts`
7. Remove `eslint-disable` comments from migrated call sites
8. Update registry status to `Core`
9. Remove the file from `APPROVED_LEGACY` in `test/unit/core-boundary-guard.test.js`
10. Run `npx vitest run` — all tests must pass

## Rules

- **New operations**: MUST be implemented in `src/core/operations/` first
- **Core operations**: MUST NOT import `fs`, `path`, `window`, `electronAPI`, or `import.meta.env`
- **Components**: MUST NOT import from `database/` — go through store or core
- **Store actions**: Call `core.operations.*` → update UI state (thin wrapper only)
```

- [ ] **Step 3: Update AGENTS.md**

Read `AGENTS.md`. Find the "关键约定" section. Append the core-first convention:

```markdown
- **core-first 开发**: 所有新增用户操作必须先在 `src/core/operations/` 实现，store action 仅做薄封装 (调用 core → 更新 UI state)。组件不允许直接导入 `database/`。详见 `docs/MIGRATION.md`。
```

- [ ] **Step 4: Update CONVENTIONS.md**

Read `docs/CONVENTIONS.md`. Add a new section "Core Operations Layer":

```markdown
## Core Operations Layer

All user-facing operations MUST be implemented in `src/core/operations/` first.

- Core operations receive `IoAdapter` as a parameter — never import `fs`, `path`, `window`, or `electronAPI` directly
- Store actions are thin wrappers: call core operation → update UI state
- Register operations in `src/core/registry.ts`
- Add corresponding CLI commands in `src/cli/commands/`
- Components must not import from `src/renderer/database/` — go through operations or store

See `docs/MIGRATION.md` for the full migration process.
```

- [ ] **Step 5: Commit**

```bash
git add docs/MIGRATION.md scripts/migration-status.js AGENTS.md docs/CONVENTIONS.md
git commit -m "docs(migration): add migration guide, status script, and core-first conventions"
```

---

## Dependency Graph Summary

```
Track A: Core Foundation
  A1: interfaces + types ─────────┐
  A2: registry ───────────────────┼──→ Track B (CLI)
  A3: move export modules ────────┘    Track D (Migration)

Track C: Settings UI (independent, starts immediately)
  C1: CLI section + AI placeholder
```

## Track E: CLI Test Infrastructure

> **Depends on:** Track B (needs CLI skeleton). Can run in parallel with Track D.

### Task E1: Create CLI test framework and integration tests

**Files:**
- Create: `test/cli/helpers.ts` (shared test utilities)
- Create: `test/cli/project.test.ts`
- Create: `test/cli/output.test.ts`
- Create: `test/cli/fixtures/` (test .icp files and SVGs)

CLI is the primary quality gate: every operation must have CLI tests that verify the same behavior as GUI. This ensures GUI↔CLI parity.

- [ ] **Step 1: Create test helper that spawns CLI as a subprocess**

```typescript
// test/cli/helpers.ts
import { execFileSync, ExecFileSyncOptions } from 'child_process';
import { join } from 'path';
import { mkdtempSync, cpSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

const CLI_PATH = join(__dirname, '../../out/cli/index.cjs');

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  json: () => any; // parse stdout as JSON
}

/** Run CLI command and capture output. Never throws — captures exit code. */
export function run(args: string[], opts?: { cwd?: string }): CliResult {
  try {
    const stdout = execFileSync(process.execPath, [CLI_PATH, ...args], {
      encoding: 'utf8',
      cwd: opts?.cwd,
      timeout: 30000,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return {
      stdout,
      stderr: '',
      exitCode: 0,
      json: () => JSON.parse(stdout),
    };
  } catch (err: any) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status ?? 1,
      json: () => { try { return JSON.parse(err.stdout); } catch { return null; } },
    };
  }
}

/** Run CLI command with --json flag, return parsed envelope */
export function runJson(args: string[], opts?: { cwd?: string }) {
  const result = run(['--json', ...args], opts);
  return { ...result, data: result.json() };
}

/** Create a temporary directory with an optional fixture .icp file */
export function tmpProject(fixtureName?: string): { dir: string; icp: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'bobcorn-test-'));
  let icp = join(dir, 'test.icp');
  if (fixtureName) {
    const src = join(__dirname, 'fixtures', fixtureName);
    cpSync(src, icp);
  }
  return { dir, icp, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Create a minimal test SVG file */
export function writeSvg(dir: string, name: string, content?: string): string {
  const svg = content || `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>`;
  const p = join(dir, name);
  writeFileSync(p, svg);
  return p;
}
```

- [ ] **Step 2: Create output format tests**

```typescript
// test/cli/output.test.ts
import { describe, test, expect } from 'vitest';
import { run, runJson } from './helpers';

describe('CLI output format', () => {
  test('--version prints version string', () => {
    const r = run(['--version']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('--help prints command list', () => {
    const r = run(['--help']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('project');
    expect(r.stdout).toContain('icon');
    expect(r.stdout).toContain('group');
    expect(r.stdout).toContain('export');
  });

  test('--json on unknown command returns structured error', () => {
    const r = runJson(['nonexistent']);
    expect(r.exitCode).not.toBe(0);
  });

  test('--json always produces valid JSON on stdout', () => {
    const r = run(['--json', 'project', 'inspect', 'nonexistent.icp']);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('FILE_NOT_FOUND');
    expect(parsed.meta.command).toBe('project inspect');
    expect(parsed.warnings).toBeInstanceOf(Array);
    expect(parsed.data).toBeNull();
  });
});
```

- [ ] **Step 3: Create project command tests**

```typescript
// test/cli/project.test.ts
import { describe, test, expect, afterEach } from 'vitest';
import { run, runJson, tmpProject, writeSvg } from './helpers';
import { existsSync } from 'fs';

describe('CLI project commands', () => {
  let cleanup: (() => void)[] = [];
  afterEach(() => { cleanup.forEach(fn => fn()); cleanup = []; });

  test('project inspect on nonexistent file exits 2', () => {
    const r = runJson(['project', 'inspect', '/tmp/nonexistent.icp']);
    expect(r.exitCode).toBe(2);
    expect(r.data.ok).toBe(false);
    expect(r.data.code).toBe('FILE_NOT_FOUND');
  });

  // These tests will be enabled as operations are migrated to core:
  // test('project create makes a valid .icp file', () => { ... });
  // test('project inspect on valid .icp returns metadata', () => { ... });
  // test('project set-name updates project name', () => { ... });
});
```

- [ ] **Step 4: Add CLI test script to package.json**

```json
"test:cli": "npx tsup && vitest run test/cli/"
```

The `tsup` build runs first to ensure CLI is up to date before testing.

- [ ] **Step 5: Run CLI tests**

```bash
npx tsup && npx vitest run test/cli/
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add test/cli/ package.json
git commit -m "test(cli): add CLI integration test framework with subprocess runner and initial tests"
```

### Task E2: Create CLI parity guard test

**Files:**
- Create: `test/cli/parity-guard.test.ts`

This test ensures every CLI-exposed operation in the registry has a corresponding CLI test file. When a new operation is added to the GUI and registered, this test fails until CLI tests are written.

- [ ] **Step 1: Write parity guard**

```typescript
// test/cli/parity-guard.test.ts
import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { OPERATIONS, OpStatus } from '../../src/core/registry';

describe('CLI parity guard', () => {
  test('every Core operation with cliCommand has CLI tests', () => {
    const cliTestDir = join(__dirname);
    const testFiles = readdirSync(cliTestDir)
      .filter(f => f.endsWith('.test.ts'))
      .map(f => readFileSync(join(cliTestDir, f), 'utf8'))
      .join('\n');

    const coreOps = OPERATIONS.filter(
      op => op.status === OpStatus.Core && op.cliCommand !== null
    );

    const untested: string[] = [];
    for (const op of coreOps) {
      // Check if any test file references this command
      // Convention: tests should contain the CLI command string, e.g., 'project inspect'
      const cmd = op.cliCommand!;
      const cmdParts = cmd.split(' ');
      // Search for the subcommand being tested (e.g., "'inspect'" or '"inspect"')
      if (!testFiles.includes(cmdParts[cmdParts.length - 1])) {
        untested.push(`${op.id} (cli: ${cmd})`);
      }
    }

    expect(untested, `Core operations without CLI tests:\n${untested.join('\n')}\nAdd tests to test/cli/`).toEqual([]);
  });

  test('registry has an entry for every CLI command', () => {
    // Ensure no CLI command exists without a registry entry
    const registeredCommands = new Set(
      OPERATIONS.filter(op => op.cliCommand).map(op => op.cliCommand)
    );

    // Read CLI entry point to find all registered commands
    const cliSrc = readFileSync(join(__dirname, '../../src/cli/index.ts'), 'utf8');
    const commandPattern = /\.command\(['"]([^'"]+)['"]\)/g;
    let match;
    const cliCommands: string[] = [];
    while ((match = commandPattern.exec(cliSrc)) !== null) {
      cliCommands.push(match[1]);
    }

    // This is informational for now — tracks drift between CLI and registry
    // Will become strict once migration is further along
  });
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run test/cli/parity-guard.test.ts
```

Expected: pass (no Core operations exist yet, so nothing to check).

- [ ] **Step 3: Commit**

```bash
git add test/cli/parity-guard.test.ts
git commit -m "test(cli): add parity guard ensuring Core operations have CLI tests"
```

---

## Execution Notes

- **Track A + Track C start in parallel** (C is fully independent)
- After Track A completes, **Track B, D, and E run in parallel**
- Each task ends with a commit — agents can review between tasks
- CLI commands are stubs until individual operations are migrated from renderer → core (separate future work per operation)
- **Test coverage rule**: Every operation migrated to Core MUST have CLI integration tests added to `test/cli/`. The parity guard enforces this automatically.
