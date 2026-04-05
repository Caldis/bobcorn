# Bobcorn CLI + AI-Ready Architecture Design

> Date: 2026-04-05
> Status: Draft v3 — revised after Codex review round 2

## 1. Goals

1. **CLI (Phase 1)** — Standalone command-line interface that exposes all Bobcorn operations to AI Agents and power users, without requiring the GUI to be running.
2. **Shared Operations Layer** — Extract business logic into `src/core/` so GUI and CLI share the same code path. New features automatically available to both.
3. **Migration Discipline** — Registry, import boundary enforcement, and conventions to ensure incremental migration stays on track.
4. **Settings Panel Integration** — CLI installation UX in Settings; AI assistant placeholder (Coming Soon).
5. **AI Assistant (Future)** — Not implemented this phase; settings entry point with capability preview.

## 2. Architecture

### 2.1 Layer Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    User / AI Agent                       │
└──────────┬──────────────────────────────┬───────────────┘
           │                              │
    ┌──────▼──────┐               ┌───────▼───────┐
    │  CLI (Node) │               │  GUI (React)  │
    │  src/cli/   │               │  src/renderer/ │
    │             │               │  store → thin  │
    │  Provides:  │               │  components →  │
    │  IoAdapter  │               │  pure UI only  │
    │  (fs/path)  │               │  IoAdapter via │
    │             │               │  electronAPI   │
    └──────┬──────┘               └───────┬───────┘
           │                              │
           │    ┌─────────────────────┐   │
           └───►│   Core (pure logic) │◄──┘
                │   src/core/         │
                │                     │
                │  operations/ (biz)  │
                │  database/  (SQL)   │
                │  io.ts (interface)  │
                └─────────────────────┘
```

### 2.2 Ports/Adapters Split

`src/core/` is **pure Node.js** — no `window`, no `electronAPI`, no `import.meta.env`. Environment-specific I/O is injected via an adapter interface:

```typescript
// src/core/io.ts — interface, not implementation
export interface IoAdapter {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  resolve(...parts: string[]): string;
  join(...parts: string[]): string;
  basename(p: string, ext?: string): string;
  dirname(p: string): string;
}
```

- **CLI adapter** (`src/cli/io-node.ts`): uses `fs/promises` + `path` directly
- **GUI adapter** (`src/renderer/io-electron.ts`): wraps `window.electronAPI.*`

Core operations receive `IoAdapter` via dependency injection (constructor param or context object), never import environment-specific modules.

For icon rasterization (v1.10.0), a separate `CanvasAdapter` is injected similarly:

```typescript
// src/core/canvas.ts — interface for rasterization
export interface CanvasAdapter {
  createCanvas(width: number, height: number): { getContext(type: '2d'): any; toBuffer(mime: string, opts?: any): Buffer };
  loadImage(data: Uint8Array): Promise<{ width: number; height: number }>;
}
```

- **CLI adapter** (`src/cli/canvas-node.ts`): wraps `@napi-rs/canvas`
- **GUI adapter** (`src/renderer/canvas-browser.ts`): wraps browser `HTMLCanvasElement` + `Image`

### 2.3 Directory Structure (New)

```
src/core/                        # Shared operations kernel (pure logic)
  ├── index.ts                   # Public API barrel export
  ├── io.ts                      # IoAdapter interface definition
  ├── types.ts                   # Shared types (IconData, GroupData, ProjectMeta, etc.)
  ├── registry.ts                # Operation registry (migration dashboard)
  ├── database/                  # Database layer (migrated from renderer/database)
  │   ├── index.ts               # sql.js wrapper + schema migration (no window deps)
  │   └── migrations.ts          # Schema versioning
  └── operations/                # One module per operation domain
      ├── project.ts             # create, save, save-as, inspect, set-name, set-prefix
      ├── icon.ts                # import, rename, move, copy, delete, set-code, replace, batch-*
      ├── group.ts               # add, remove, rename, reorder, set-description, move-icons
      ├── export-font.ts         # generate fonts (SVG/TTF/WOFF/WOFF2/EOT), export SVG, demo page
      ├── export-icon.ts         # icon rasterization: SVG→PNG/JPG/WebP/PDF/ICO, presets, multi-row
      ├── export-formats.ts      # ICO binary encoder, PDF generator (from renderer/utils/export/)
      ├── export-rasterize.ts    # Canvas SVG→bitmap pipeline (from renderer/utils/export/)
      ├── export-presets.ts      # Platform presets + filename generation (from renderer/utils/export/)
      ├── variant.ts             # generate, delete, list variants
      ├── search.ts              # search icons by name/tag/group
      └── favorite.ts            # add, remove, list favorites

src/cli/                         # CLI entry point (Electron-free)
  ├── index.ts                   # CLI main (commander.js), wires IoAdapter
  ├── io-node.ts                 # IoAdapter implementation (fs + path)
  ├── commands/                  # Thin wrappers: parse args → call core → format output
  │   ├── project.ts
  │   ├── icon.ts
  │   ├── group.ts
  │   ├── export-font.ts         # bobcorn export font
  │   ├── export-icon.ts         # bobcorn export icon (rasterization)
  │   ├── export-svg.ts          # bobcorn export svg
  │   ├── variant.ts
  │   ├── search.ts
  │   └── favorite.ts
  ├── output.ts                  # Unified output: json envelope + human formatter
  └── install.ts                 # PATH registration logic (used by CLI and Settings panel)

src/renderer/
  ├── io-electron.ts             # IoAdapter implementation (electronAPI wrappers)
  ├── store/index.ts             # Thin wrappers: core.op() → update zustand UI state
  ├── components/                # Pure UI — NO direct db imports
  └── ...
```

### 2.4 What Stays in `src/renderer/`

- **Store** (`store/index.ts`) — Thin wrappers: call `core.operations.*` → update Zustand UI state (selections, scroll, modals, progress)
- **Components** — Pure UI rendering, no direct database calls (all data via store or core)
- **UI-only utils** — SVG preview rendering, CSS, animations, sanitizeSVG for display

### 2.5 What Current Components Must Stop Doing

**Complete inventory** of all `src/renderer/` files that import `db` directly (21 import sites):

| File | Import form | Usage |
|------|-------------|-------|
| `bootstrap.tsx` | `import db, { dbReady } from './database'` | Init + onMutation hook |
| `store/index.ts` | `import db from '../database'` + `require('../database')` | All store actions |
| `containers/MainContainer/index.tsx` | `import db from '../../database'` | exportProject, resetProject, getProjectName |
| `components/IconBlock/index.tsx` | `import db from '../../database'` | getIconContent, setIconFavorite |
| `components/IconGridLocal/index.tsx` | `import db from '../../database'` | getAllIconsGrouped, getRecentlyUpdatedIcons, getFavoriteIcons |
| `components/IconInfoBar/index.tsx` | `import db from '../../database'` | getGroupName |
| `components/GroupIconPreview.tsx` | `import db from '../database'` | getIconContent |
| `components/BatchPanel/index.tsx` | `import db from '../../database'` | Batch operations |
| `components/SideEditor/index.tsx` | `import db from '../../database'` | Icon editing |
| `components/SideEditor/VariantPanel.tsx` | `import db from '../../database'` | Variant CRUD |
| `components/SideMenu/index.tsx` | `import db from '../../database'` | Menu operations |
| `components/SideMenu/GroupList.tsx` | `import db from '../../database'` | Group listing |
| `components/SideMenu/GroupDialogs.tsx` | `import db from '../../database'` | Group CRUD dialogs |
| `components/SideMenu/ExportDialog.tsx` | `import db from '../../database'` | Export operations |
| `components/SideMenu/SettingsDialog.tsx` | `import db from '../../database'` | Settings reads |
| `components/SideMenu/ResourceNav.tsx` | `import db from '../../database'` | Resource navigation |
| `utils/variantGuard.ts` | `import db from '../database'` | Variant cascade checks |
| `utils/generators/demopageGenerator/index.ts` | `import db from '../../../database'` | Demo page gen (redesigned v1.9.4) |
| `utils/loaders/cpLoader/index.ts` | `import db from '../../../database'` | Codepage loading |
| `utils/loaders/icpLoader/index.ts` | `import db from '../../../database'` | .icp file loading |

All of these must migrate to call through `core.operations.*` (or store actions that wrap core). `bootstrap.tsx` is a special case — it wires the db init lifecycle and will become the adapter bootstrap point. See Migration section.

**Additionally, these new v1.10.0 modules need to be born in `src/core/` during migration** (they currently live in renderer but do NOT import db directly — they are pure logic and good candidates to move early):

| File | Current location | Notes |
|------|-----------------|-------|
| `utils/export/presets.ts` | `src/renderer/utils/export/` | Platform presets + filename gen — pure logic, no deps |
| `utils/export/rasterize.ts` | `src/renderer/utils/export/` | Canvas SVG→bitmap — uses browser Canvas, needs CanvasAdapter |
| `utils/export/formats.ts` | `src/renderer/utils/export/` | ICO encoder + PDF gen — pure logic except pdf-lib |
| `workers/exportRaster.worker.ts` | `src/renderer/workers/` | OffscreenCanvas worker — GUI-only, CLI uses sync adapter |
| `components/IconExportDialog/` | `src/renderer/components/` | Pure UI — stays in renderer, calls core operations |

## 3. CLI Design

### 3.1 Command Structure

```
bobcorn <noun> <verb> [args] [flags]
```

Consistent pattern: **singular noun + verb**. Every command operates on a `<project.icp>` file.

Global flags:
- `--json` — Structured JSON output (see 3.3 for full schema)
- `--quiet` — Suppress non-essential human output
- `--version` / `-v` — Print version
- `--help` / `-h` — Help text

### 3.2 Commands (mirrors all GUI operations)

#### Project
```bash
bobcorn project create <path.icp>                    # New project
bobcorn project inspect <path.icp>                   # Metadata + stats + validation
bobcorn project set-name <path.icp> <name>           # Set project/font name
bobcorn project set-prefix <path.icp> <prefix>       # Set CSS class prefix
```

#### Icon
```bash
bobcorn icon import <project.icp> <svg...>           # Import SVGs (supports glob)
bobcorn icon list <project.icp> [--group <name>]     # List icons
bobcorn icon rename <project.icp> <id> <new-name>    # Rename icon
bobcorn icon move <project.icp> <id...> <group>      # Move to group (batch)
bobcorn icon copy <project.icp> <id...> <group>      # Copy to group (batch)
bobcorn icon delete <project.icp> <id...>            # Delete icon(s) (batch, variant-safe)
bobcorn icon set-code <project.icp> <id> <hex>       # Set unicode code point
bobcorn icon replace <project.icp> <id> <svg-file>   # Replace SVG content
bobcorn icon export-svg <project.icp> <id...> -o .   # Export SVG file(s)
bobcorn icon set-favorite <project.icp> <id...> [--remove]  # Toggle favorite
bobcorn icon set-color <project.icp> <id...> <color> # Batch set icon color
```

**Name resolution**: All icon references use `<id>` (UUID). Use `bobcorn icon list --json` to discover IDs. This avoids ambiguity when names duplicate across groups.

#### Group
```bash
bobcorn group list <project.icp>                     # List groups with counts
bobcorn group add <project.icp> <name>               # Create group
bobcorn group rename <project.icp> <name> <new-name> # Rename group
bobcorn group delete <project.icp> <name>            # Delete group
bobcorn group reorder <project.icp> <name> <index>   # Reorder group position
bobcorn group set-description <project.icp> <name> <text>  # Set group description
bobcorn group move-icons <project.icp> <group> <id...>     # Move icons into group
```

#### Export (Font Generation)
```bash
bobcorn export font <project.icp> -o <dir>           # Export font files
  --formats woff2,ttf,svg,eot,woff                   # Select formats (default: all)
  --font-name <name>                                 # Override font family name
  --prefix <prefix>                                  # CSS class prefix
  --css                                              # Generate CSS @font-face
  --preview                                          # Generate HTML preview page
bobcorn export svg <project.icp> -o <dir>            # Export all icons as SVG files
  --group <name>                                     # Filter by group
```

#### Export (Icon Rasterization) — NEW in v1.10.0
```bash
bobcorn export icon <project.icp> <id...> -o <dir>  # Export icons as image files
  --format png,jpg,webp,svg,pdf,ico                  # Output format (default: png)
  --size <value>                                     # Size: "2x" (scale) or "48px" (pixel)
  --preset ios|android|rn|web|favicon                # Platform preset (overrides --size/--format)
  --quality <1-100>                                  # JPG/WebP quality (default: 92)
  --bg-color <hex>                                   # JPG background color (default: #FFFFFF)
  --ico-merge                                        # Merge ICO sizes into single .ico file
  --rows <spec...>                                   # Multi-row export: "2x:png,48px:jpg,3x:webp"
```

Multi-row example (equivalent to GUI's multi-row export):
```bash
# Export 'home' icon at iOS preset sizes
bobcorn export icon my.icp abc123 -o ./assets --preset ios

# Export batch of icons as PNG @1x @2x @3x
bobcorn export icon my.icp id1 id2 id3 -o ./out --rows "1x:png,2x:png,3x:png"

# Export as favicon set (16/32/48 ICO merged + 180/192/512 PNG)
bobcorn export icon my.icp abc123 -o ./favicon --preset favicon
```

The `--preset` flag maps to the same preset definitions as the GUI (iOS, Android, React Native, Web @1x–2x, Favicon). `--rows` allows arbitrary multi-size/multi-format combinations in a single command.

Rasterization pipeline: SVG → Canvas → target format. PDF uses `pdf-lib`, ICO uses hand-written binary encoder. Same code path as GUI (via `src/core/operations/export.ts`).

#### Variant
```bash
bobcorn variant generate <project.icp> <id>          # Generate variants
  --weights 1,3,5,7,9                                # Weight levels
  --scales sm,md,lg                                  # Scale levels
bobcorn variant list <project.icp> <id>              # List variants of icon
bobcorn variant delete <project.icp> <id>            # Delete all variants of icon
```

#### Search
```bash
bobcorn search <project.icp> <query>                 # Search icons by name
  --group <name>                                     # Filter by group
  --limit <n>                                        # Limit results (default: 50)
```

#### Favorite
```bash
bobcorn favorite list <project.icp>                  # List favorited icons
```

### 3.3 JSON Output Schema

All `--json` output follows this envelope:

```typescript
interface CliOutput<T = unknown> {
  ok: boolean;                  // true = full success, false = error or partial failure
  error: string | null;         // Human-readable error message; null when ok=true
  code: string | null;          // Machine-readable error code (see 3.4); null when ok=true
  warnings: string[];           // Non-fatal issues (always present, may be empty array)
  data: T | null;               // See three-state rules below
  meta: {
    command: string;            // e.g., "icon import"
    projectPath: string;
    duration_ms: number;
    version: string;
  };
}
```

**Three-state output rules** (agents MUST handle all three):

| State | `ok` | `code` | `data` | When |
|-------|------|--------|--------|------|
| **Full success** | `true` | `null` | `T` (non-null) | All items succeeded |
| **Partial failure** | `false` | `"PARTIAL_FAILURE"` | `T` (non-null, contains both succeeded and failed items) | Batch op: some items succeeded, some failed |
| **Total failure** | `false` | `"<ERROR_CODE>"` | `null` | Nothing succeeded |

Key contract: **`data` is non-null whenever any work was completed**, even if `ok` is `false`. Agents should check `code === "PARTIAL_FAILURE"` to distinguish partial from total failure.

Batch partial failure example:

```json
{
  "ok": false,
  "error": "3 of 20 SVGs failed to import",
  "code": "PARTIAL_FAILURE",
  "warnings": ["broken.svg: invalid SVG markup", "empty.svg: file is empty", "dup.svg: duplicate name 'home'"],
  "data": {
    "imported": 17,
    "skipped": 3,
    "icons": [...]
  },
  "meta": { "command": "icon import", ... }
}
```

### 3.4 Error Codes

Machine-readable codes in the `code` field:

| Code | Meaning |
|------|---------|
| `INVALID_ARGS` | Invalid arguments or usage |
| `FILE_NOT_FOUND` | Project file or SVG not found |
| `FILE_IO_ERROR` | Read/write failure |
| `INVALID_SVG` | SVG parse/validation error |
| `DUPLICATE_NAME` | Icon or group name already exists |
| `ICON_NOT_FOUND` | Icon ID not found in project |
| `GROUP_NOT_FOUND` | Group name not found |
| `AMBIGUOUS_REFERENCE` | Multiple matches (shouldn't happen with ID-based lookup) |
| `PARTIAL_FAILURE` | Batch op: some succeeded, some failed |
| `PROJECT_BUSY` | Lockfile detected (see 7.2) |
| `INVALID_PROJECT` | .icp file corrupted or incompatible version |
| `CANVAS_UNAVAILABLE` | Raster export requires @napi-rs/canvas (not installed) |
| `RASTERIZE_FAILED` | Canvas rasterization error (corrupt SVG, OOM, etc.) |

### 3.5 Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (all items) |
| 1 | Invalid arguments / usage error |
| 2 | File not found / file I/O error |
| 3 | Operation failed |
| 4 | Partial failure (some items in batch failed) |

### 3.6 Agent Discovery

**Approach**: Auto-generate `--help` output that is comprehensive enough for agents. The `--json` flag on `--help` outputs structured command metadata:

```bash
bobcorn --help --json    # Machine-readable command tree
```

This is generated from the same command definitions used by commander.js — no separate file to maintain.

If `agent.json` is needed later, it will be **auto-generated** from command definitions at build time, never hand-maintained.

## 4. CLI Installation UX (Settings Panel)

### 4.1 Settings → "Command Line Interface" Section

Layout:
```
┌─────────────────────────────────────────────────┐
│ Command Line Interface                          │
│                                                 │
│ Allow interaction with Bobcorn from the         │
│ terminal. AI-agent friendly.                    │
│                                                 │
│ Status: ● Installed (v1.9.3)                    │
│         ○ Not installed                         │
│         ⚠ Outdated (installed v1.8.0)           │
│                                                 │
│ [Install CLI to PATH]  or  [Uninstall]          │
│                                                 │
│ Manual setup → bobcorn.caldis.me/wiki/cli       │
└─────────────────────────────────────────────────┘
```

### 4.2 PATH Registration

**macOS:**
- Primary: symlink to `~/.local/bin/bobcorn` (no elevation required)
- Fallback: `/usr/local/bin/bobcorn` (prompts for elevation if needed)
- Shell RC detection: if `~/.local/bin` not in PATH, append to `~/.zshrc` / `~/.bashrc`

**Windows:**
- Primary: Add application CLI directory to User PATH via `HKCU\Environment\Path`
- Creates `bobcorn.cmd` wrapper script in a dedicated directory (e.g., `%LOCALAPPDATA%\Bobcorn\cli\`)
- Supports: PowerShell, cmd, Git Bash
- Broadcasts `WM_SETTINGCHANGE` after PATH modification to notify running shells

### 4.3 Status Detection

On Settings panel mount, via IPC to main process (main has reliable env access):
1. Main process spawns `bobcorn --version` with inherited PATH
2. Parse version from stdout, compare with `app.getVersion()`
3. Show status: Not installed / Installed (version) / Outdated (update available)
4. Cache result for session; re-check on install/uninstall action

Note: after installation, the status may show "Not installed" until shells are restarted. Show a hint: "New terminal sessions will have access to the `bobcorn` command."

## 5. AI Assistant Placeholder (Settings Panel)

### 5.1 Settings → "Bobcorn AI" Section

```
┌─────────────────────────────────────────────────┐
│ ✦ Bobcorn AI                        Coming Soon │
│                                                 │
│ Intelligent features powered by AI to           │
│ supercharge your icon workflow.                  │
│                                                 │
│ ┌─ What's coming ─────────────────────────────┐ │
│ │                                             │ │
│ │ ▸ Smart Grouping                            │ │
│ │   Auto-organize imported icons by content   │ │
│ │                                             │ │
│ │ ▸ Name Normalization                        │ │
│ │   Unify naming conventions across your set  │ │
│ │                                             │ │
│ │ ▸ Duplicate Detection                       │ │
│ │   Find visually similar icons instantly     │ │
│ │                                             │ │
│ │ ▸ Icon Generation                           │ │
│ │   Describe an icon, get SVG matching your   │ │
│ │   set's style                               │ │
│ │                                             │ │
│ │ ▸ Style Consistency Check                   │ │
│ │   Detect mismatched strokes, fills, corners │ │
│ │                                             │ │
│ │ ▸ Icon Set Completion                       │ │
│ │   Suggest missing icons for common UI       │ │
│ │   patterns                                  │ │
│ │                                             │ │
│ │ ▸ Accessibility Descriptions                │ │
│ │   Auto-generate semantic alt text for icons │ │
│ │                                             │ │
│ │ ▸ Smart Unicode Assignment                  │ │
│ │   Semantically meaningful code point        │ │
│ │   allocation                                │ │
│ │                                             │ │
│ │ ▸ Variant Intelligence                      │ │
│ │   AI-recommended weight & scale parameters  │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Stay tuned for updates.                         │
└─────────────────────────────────────────────────┘
```

### 5.2 i18n

All AI feature names and descriptions go through `t()` with keys under `settings.ai.*` namespace.

## 6. Operations Layer & Migration Discipline

### 6.1 Operation Registry (`src/core/registry.ts`)

The registry tracks **user-facing operations and workflow operations only** — not every internal database helper. It serves as a migration dashboard.

```typescript
export const enum OpStatus {
  /** Implemented in src/core/, used by both CLI and GUI */
  Core = 'core',
  /** Still lives in store/components, needs migration */
  Legacy = 'legacy',
  /** Migration in progress */
  Migrating = 'migrating',
}

export interface OpEntry {
  id: string;              // e.g., 'icon.import'
  description: string;
  status: OpStatus;
  corePath?: string;       // path when status=core
  legacyPaths?: string[];  // all locations when status=legacy|migrating (store + components)
  cliCommand: string | null; // CLI command name, or null if internal-only (e.g., project.save)
}

export const OPERATIONS: OpEntry[] = [
  // --- Project ---
  {
    id: 'project.create',
    description: 'Create a new .icp project file',
    status: OpStatus.Core,
    corePath: 'src/core/operations/project.ts#create',
    cliCommand: 'project create',
  },
  {
    id: 'project.save',
    description: 'Save project to .icp file',
    status: OpStatus.Legacy,
    legacyPaths: ['src/renderer/containers/MainContainer/index.tsx#handleSave'],
    cliCommand: null, // implicit — every write command auto-saves
  },
  {
    id: 'icon.import',
    description: 'Import SVG files into project (sanitize + insert)',
    status: OpStatus.Legacy,
    legacyPaths: [
      'src/renderer/store/index.ts#importIcons',
      'src/renderer/utils/importer/',
    ],
    cliCommand: 'icon import',
  },
  // --- Export ---
  {
    id: 'export.font',
    description: 'Generate iconfont files (SVG/TTF/WOFF/WOFF2/EOT) + CSS + demo page',
    status: OpStatus.Legacy,
    legacyPaths: [
      'src/renderer/components/SideMenu/ExportDialog.tsx',
      'src/renderer/utils/generators/',
    ],
    cliCommand: 'export font',
  },
  {
    id: 'export.icon',
    description: 'Export icons as raster/vector files (PNG/JPG/WebP/SVG/PDF/ICO) with presets',
    status: OpStatus.Legacy,
    legacyPaths: [
      'src/renderer/components/IconExportDialog/index.tsx',
      'src/renderer/utils/export/',
      'src/renderer/workers/exportRaster.worker.ts',
    ],
    cliCommand: 'export icon',
  },
  // ... all operations listed
];
```

### 6.2 Import Boundary Enforcement

**Goal**: Prevent `src/renderer/**` from importing `src/renderer/database` directly — all data access must go through `src/core/`.

**Implementation** (phased):

**Phase A — Immediate: ESLint `no-restricted-imports` with regex patterns**

The ESLint rule uses `patterns` (not `paths`) to catch **all** relative import forms — `./database`, `../database`, `../../database`, `../../../database` — regardless of depth. It also catches `require()` via `no-restricted-modules` (for the CJS case in store).

```jsonc
// .eslintrc — add to renderer overrides
{
  "files": ["src/renderer/**/*.{ts,tsx,js,jsx}"],
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["**/database", "**/database/**"],
        "message": "Import from @core/operations instead. See docs/MIGRATION.md"
      }]
    }]
  }
}
```

This catches every relative path depth (`./database`, `../../database`, `../../../database`) in one rule. No path-specific entries to maintain.

During migration, files with existing `db` imports get `// eslint-disable-next-line no-restricted-imports` with a `TODO(core-migration): <operation-id>` comment linking to the registry entry. Track count via: `grep -rc "TODO(core-migration)" src/renderer/ | awk -F: '{s+=$2} END{print s}'` — must reach zero.

**Phase B — Static analysis test (`test/unit/core-boundary-guard.test.ts`)**

Scans **all of `src/renderer/**`** (not just store) for:
1. Direct imports from `src/renderer/database` → must be on the approved legacy list (from section 2.5) or fail
2. Any `window.` or `import.meta.env` usage in `src/core/**` → always fail
3. Every `OpStatus.Core` registry entry **where `cliCommand` is non-null** → must have a matching CLI command in `src/cli/commands/`. (Operations with `cliCommand: null` are internal workflow ops like `project.save` that are invoked implicitly by other commands, not exposed directly.)

**Phase C — Optional: `dependency-cruiser` for full graph enforcement**

### 6.3 Migration Process

Documented in `docs/MIGRATION.md`:

**Phase order** (write paths first, then read paths):

**Phase A**: Stop new direct DB calls anywhere outside `src/core/`
  - ESLint rule enabled (new violations = error)
  - All existing violations annotated with `eslint-disable` + `TODO(core-migration)`

**Phase B**: Migrate write paths
  1. Pick a `Legacy` write operation from registry
  2. Update status to `Migrating`
  3. Extract logic to `src/core/operations/` (receives `IoAdapter` + db handle)
  4. Store action becomes thin wrapper: `core.op() → update zustand UI state`
  5. Component direct calls → route through store action or core
  6. Add CLI command in `src/cli/commands/`
  7. Remove `eslint-disable` comment from migrated call sites
  8. Update registry status to `Core`
  9. Tests pass (boundary guard + unit + E2E)

**Phase C**: Migrate read/query paths and export flows
  - Same process, lower urgency (reads don't mutate state)

### 6.4 Migration Progress Tracking

`docs/MIGRATION.md` includes a progress table auto-generated from `registry.ts`:

```
| Operation       | Status    | Legacy locations                | CLI command      |
|-----------------|-----------|--------------------------------|------------------|
| project.create  | ✅ core   | —                              | project create   |
| icon.import     | 🔴 legacy | store#importIcons, utils/importer | icon import   |
| icon.delete     | 🟡 migrating | store#deleteIcon            | icon delete      |
```

Script: `node scripts/migration-status.js` generates this table from `registry.ts`.

### 6.5 Convention Enforcement

Add to `AGENTS.md` and `CONVENTIONS.md`:

> **All new user-facing operations MUST be implemented in `src/core/operations/` first.**
> - Core operations receive `IoAdapter` as a parameter — never import `fs`, `path`, `window`, or `electronAPI` directly.
> - The store action is a thin wrapper: call core operation → update UI state.
> - Register the operation in `src/core/registry.ts` with status `Core`.
> - Add the corresponding CLI command in `src/cli/commands/`.
> - Components must not import from `src/renderer/database/` or `src/core/database/` directly — go through operations.

## 7. Build & Packaging

### 7.1 CLI Build — Separate `tsup` Config

The CLI is built with **`tsup`** (not electron-vite), because:
- CLI has fundamentally different runtime assumptions (plain Node.js, no Electron)
- electron-vite is designed for Electron's 3-process model, adding a 4th target complicates its config
- tsup produces a clean single-file ESM/CJS bundle with zero config friction

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  outDir: 'out/cli',
  format: ['cjs'],          // Node 18 compatible
  target: 'node18',
  clean: true,
  noExternal: [/^@core/],   // Bundle core operations inline
  external: [
    'sql.js',               // sql.js loaded at runtime (ASM build)
    '@napi-rs/canvas',      // Optional: headless Canvas for icon rasterization
    'pdf-lib',              // PDF generation
  ],
  banner: { js: '#!/usr/bin/env node' },
});
```

### 7.1.1 Headless Canvas for Icon Rasterization

The GUI's icon rasterization (v1.10.0 IconExportDialog) uses browser `Canvas` + `OffscreenCanvas`. The CLI runs in headless Node.js where these APIs don't exist.

**Solution**: `@napi-rs/canvas` — a Node.js-native Canvas implementation (Skia-based, prebuilt binaries, no system deps).

```typescript
// src/core/operations/export-rasterize.ts
// IoAdapter pattern: Canvas is injected, not imported directly
export interface CanvasAdapter {
  createCanvas(width: number, height: number): CanvasLike;
  loadImage(data: Uint8Array): Promise<ImageLike>;
}
```

- **GUI adapter**: wraps browser `document.createElement('canvas')` + `Image()`
- **CLI adapter** (`src/cli/canvas-node.ts`): wraps `@napi-rs/canvas`
- **Fallback**: If `@napi-rs/canvas` is not available (e.g., unsupported platform), `export icon` with raster formats emits a clear error: `"Rasterization requires @napi-rs/canvas. Install with: npm i -g @napi-rs/canvas"`. SVG export always works without it.

Package.json additions:
```json
{
  "bin": { "bobcorn": "out/cli/index.cjs" },
  "scripts": {
    "build:cli": "tsup",
    "build": "electron-vite build && tsup"
  }
}
```

### 7.2 File Safety — Advisory Lockfile + Atomic Writes

**Advisory lock** prevents concurrent writes; **atomic write** prevents corruption on crash.

#### Lock acquisition (atomic)

```typescript
// Acquire lock with O_CREAT | O_EXCL — atomic on all platforms
const lockPath = projectPath + '.lock';
const lockData = JSON.stringify({ pid: process.pid, timestamp: Date.now(), agent: 'cli' });
try {
  const fd = fs.openSync(lockPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL);
  fs.writeSync(fd, lockData);
  fs.closeSync(fd);
} catch (err) {
  if (err.code === 'EEXIST') {
    // Lock exists — check if holder is still alive
    const existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (isPidAlive(existing.pid)) {
      exit(PROJECT_BUSY);
    } else {
      // Stale lock — reclaim
      fs.unlinkSync(lockPath);
      // Retry acquire (recursive, one retry max)
    }
  }
}
```

- `O_CREAT | O_EXCL` guarantees atomic creation — two concurrent processes cannot both succeed
- Stale lock detection: check PID liveness (`process.kill(pid, 0)` on Unix, `tasklist` on Windows)
- Lock removed on: successful completion, process exit (`process.on('exit')` + `process.on('SIGINT')`)
- `--force` flag skips lock check entirely (for automation edge cases, documented as unsafe)

#### Atomic project writes (write-then-rename)

Project file writes use the write-then-rename pattern to prevent corruption if the process crashes mid-write:

```typescript
// 1. Write to temporary file in same directory (ensures same filesystem for atomic rename)
const tmpPath = projectPath + '.tmp.' + process.pid;
fs.writeFileSync(tmpPath, projectData);

// 2. Atomic rename replaces the original
fs.renameSync(tmpPath, projectPath);
```

On Windows, `fs.renameSync` overwrites the destination atomically if both paths are on the same volume (NTFS). On POSIX, `rename(2)` is always atomic.

#### GUI integration

The GUI creates the lock when it opens a project and releases it on close. The lock's `agent` field (`"cli"` / `"gui"`) helps with diagnostics in the `PROJECT_BUSY` error message.

### 7.3 Distribution & Packaging

#### CLI must live outside asar

Current `package.json` has `asar: true`. Files inside `app.asar` cannot be directly executed as CLI binaries. Solution:

```jsonc
// package.json — electron-builder config
{
  "asarUnpack": [
    "out/renderer/**",              // existing
    "node_modules/electron-pixel-picker/**",  // existing
    "out/cli/**"                    // NEW — CLI must be executable
  ]
}
```

After packaging, the CLI lives at `<app>/resources/app.asar.unpacked/out/cli/index.cjs` and can be symlinked/wrapped to PATH.

#### sql.js resolution

The `tsup` config externalizes `sql.js` to avoid bundling the large ASM file. Resolution strategy:

- **In dev**: `sql.js` resolves from `node_modules/` as usual
- **In packaged app**: `sql.js` is already in `node_modules/` inside the asar (used by renderer). The CLI's unpacked `index.cjs` uses a `require('sql.js/dist/sql-asm.js')` that resolves up to the app's `node_modules/` via Node's module resolution. Since sql.js is pure JS (ASM build, no native addons), this works from the unpacked directory.
- **Fallback**: If resolution fails (e.g., standalone npm install), `sql.js` is listed as a `peerDependency` with a helpful error message.

#### Install logic

Install/uninstall logic in `src/cli/install.ts` is shared between:
- CLI: `bobcorn --install` / `bobcorn --uninstall`
- GUI: Settings panel "Install CLI to PATH" button (calls same logic via IPC)

The wrapper script (`bobcorn.cmd` on Windows, symlink on macOS) points to the unpacked CLI path inside the app installation directory.

## 8. Out of Scope (This Phase)

- AI assistant implementation (placeholder only)
- CLI plugin system
- Remote/server mode
- MCP server integration
- `project save` as explicit CLI command (write operations auto-persist)

## 9. Success Criteria

1. `bobcorn icon import myproject.icp *.svg --json` works from terminal without GUI
2. Agent (Claude Code / Codex) can complete full workflow: create → import → organize → export
3. Settings panel shows CLI status and allows one-click install
4. All existing GUI operations have a registry entry (Core or Legacy)
5. Import boundary guard prevents new direct db imports in renderer
6. `bobcorn --help --json` outputs machine-readable command tree
7. Advisory lockfile prevents concurrent GUI+CLI write corruption
