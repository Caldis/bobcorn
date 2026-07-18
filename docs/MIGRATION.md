# Core Migration Guide

## Overview

Bobcorn is migrating business logic from `src/renderer/` to `src/core/` so that both GUI and CLI share the same code. This doc tracks progress and process.

## Current Progress

Run `node scripts/migration-status.js` to see the latest status.

## How to Migrate an Operation

1. Find the operation in `src/core/registry.ts`, update status to `Migrating`
2. Create/update the operation function in `src/core/operations/<domain>.ts`
3. The operation receives `IoAdapter` -- never import `fs`, `path`, `window`, or `electronAPI`
4. Update the store action to be a thin wrapper: call core operation -> update Zustand UI state
5. Update components that called `db.*` directly to go through the store action
6. Add/update the CLI command in `src/cli/commands/<domain>.ts`
7. Remove `eslint-disable` comments from migrated call sites
8. Update registry status to `Core`
9. Remove the file from `APPROVED_LEGACY` in `test/unit/core-boundary-guard.test.js`
10. Run `npx vitest run` -- all tests must pass

## Rules

- **New operations**: MUST be implemented in `src/core/operations/` first
- **Core operations**: MUST NOT import `fs`, `path`, `window`, `electronAPI`, or `import.meta.env`
- **Components**: MUST NOT import from `database/` -- go through store or core
- **Store actions**: Call `core.operations.*` -> update UI state (thin wrapper only)

## Architecture

```
src/core/            <-- Pure operations (no browser/Node deps)
  io.ts              IoAdapter interface (filesystem abstraction)
  types.ts           Shared domain types
  registry.ts        Operation status registry
  operations/        Operation implementations

src/cli/             <-- CLI entry point (Node.js IoAdapter)
src/renderer/        <-- GUI (store wraps core, components use store)
```

## Enforcement

- **ESLint**: `no-restricted-imports` rule warns on direct `database/` imports in renderer
- **Boundary guard test**: `test/unit/core-boundary-guard.test.js` catches violations at CI time
- **Parity guard test**: `test/unit/core-parity-guard.test.js` freezes the renderer database method surface (a **new** method there fails CI → build it CLI-first instead) and asserts every registry `cliCommand` is actually registered in `src/cli/index.ts`
- **Registry**: `scripts/migration-status.js` shows progress dashboard

## Renderer ↔ Core Parity Audit

Systematic diff of the business methods on `src/renderer/database/index.ts` (the
legacy sql.js class) against `src/core/operations/*` + `src/core/database/index.ts`.
Pure SQL plumbing (`addDataToTable`, `buildDataSTMT`, …) and read-only GUI view
aggregations are summarised, not enumerated. Status legend: **aligned** (same
capability both sides) / **renderer-only** / **behaviour differs**.

| Renderer method | Core equivalent | Status |
|---|---|---|
| `initNewProject` | `createEmptyProject` / `ProjectDb.initSchema` (`project.create`) | behaviour differs — core schema omits `description` / `projectColor` columns |
| `initNewProjectFromData` | `openProject` (per-command) | renderer-only (GUI open-file into memory) |
| `resetProject` | — | renderer-only (GUI in-memory reset; CLI = create new) |
| `exportProject` | `saveProject` (`project.save`) | aligned (concept) |
| `setProjectName` / `getProjectName` | `setProjectName` / `getProjectName` (`project.set-name`) | aligned |
| `setProjectDisplayName` / `getProjectDisplayName` | `ProjectDb.setProjectDisplayName` (no operation, no CLI) | behaviour differs — `project set-name` sets the **prefix**, displayName has no CLI |
| `setProjectDescription` / `getProjectDescription` | — | renderer-only (no core column, no op/CLI) |
| `setProjectColor` / `getProjectColor` | — | renderer-only (no core column, no op/CLI) |
| `addGroup` | `addGroup` (`group.add`) | behaviour differs — renderer accepts a `description` arg, core does not |
| `delGroup` | `deleteGroup` (`group.delete`) | aligned |
| `getGroupList` | `getGroupList` (`group.list`) | aligned |
| `reorderGroups` | `setGroupOrder` / `reorderGroups` (`group.reorder`) | aligned |
| `setGroupName` | `setGroupName` (`group.rename`) | aligned |
| `setGroupInfo` | `setGroupName` + `setGroupDescription` (`group.set-description`) | behaviour differs — group cover `groupIcon` has no core setter/op/CLI |
| `addIcons` | `importIcons` (`icon.import`) | behaviour differs — core has no appended/filled feedback; `codeAllocationMode` source differs |
| `addIconsFromData` | `importIcons` (data path) | aligned (concept); browser-`File` path renderer-only |
| `addIconsFromCpData` | — | renderer-only (legacy `.cp` format import) |
| `getNewIconCode` | `getNewIconCode` | aligned (append/fill reconciled this session; guarded by `core-code-allocation.test.ts`) |
| `planIconCodeFixes` / `applyIconCodeFixes` | same (`code.fix`) | aligned |
| `delIcon` / `delIcons` | `deleteIcon` / `deleteIcons` (`icon.delete`) | behaviour differs — renderer **hard**-deletes (`DELETE`), core **soft**-deletes (→`resource-deleted`) + cascades variants |
| `deleteIconWithVariants` | `deleteIcon` (cascades variants) | behaviour differs — renderer hard-deletes parent+variants; core soft-deletes parent |
| `setIconName` | `setIconName` (`icon.rename`) | aligned |
| `setIconCode` | `setIconCode` (`icon.set-code`) | aligned |
| `moveIconGroup` / `moveIconWithVariants` | `moveIcon` (`icon.move`) | aligned — core `moveIcon` always carries variants |
| `moveIcons` / `moveIconsWithVariants` | `moveIcons` (`icon.move`) | behaviour differs — renderer has variant-carrying + non-carrying variants; core `moveIcons` always carries variants |
| `duplicateIconGroup` / `duplicateIcons` | `copyIcon` / `copyIcons` (`icon.copy`) | aligned — renderer counts partial `failed` on PUA exhaust, core throws |
| `updateIconsColor` | `setIconColor` (`icon.set-color`) | behaviour differs — renderer recolours **all** colours→target via DOM; core replaces one `from`→`to` via regex |
| `renewIconData` | `replaceIconContent` (`icon.replace`) | aligned (concept) |
| `setIconFavorite` / `setIconsFavorite` | `setIconFavorite` (`icon.set-favorite`) | behaviour differs — renderer batch, CLI single-id |
| `getFavoriteIcons` | `getFavoriteIcons` (`favorite.list`) | aligned |
| `getVariants` / `deleteVariants` | same (`variant.list` / `variant.delete`) | aligned |
| `addVariant` | — | renderer-only (variant generation needs Canvas → `variant.generate` is Legacy) |
| `ensureOriginalContent` / `getOriginalContent` | — | renderer-only (`iconContentOriginal` pre-edit baseline for colour-reset) |
| read-only view aggregations¹ | — | renderer-only (GUI grid/audit views; candidates for read-only CLI `project stats` / `code audit`) |

¹ `getProjectStats`, `getRecentlyUpdatedIcons`, `getAllIconsGrouped`,
`getIconContentBatch`, `getAllVariantCounts`, `getDuplicateIconCodes`,
`getAllIconCodes`, `getExportIconCodeMeta`, `getFavoriteCount`,
`checkIconCodeDuplicate`, `getHighestUsedIconCodeDec`, `iconCodeInRange`,
`iconCodeCanUse`.

Roughly aligned business capability count: ~20 aligned, ~9 behaviour-differs,
~8 renderer-only (of which `addVariant` / `resetProject` / `.cp` import are
knowingly GUI/Canvas-bound), plus the read-only aggregation cluster above.

## Parity Backlog

Concrete follow-ups surfaced by the audit (drive these during migration):

1. **Import feedback** — when migrating `addIcons`, `importIcons` MUST return the
   `appended` / `filled` allocation feedback the renderer now produces.
2. **`codeAllocationMode` ownership** — the mode lives in renderer `localStorage`
   (a global UI preference), not in the `.icp` project attributes, so the CLI
   can't read it (it uses `--code-mode`, default `append`). Decide: persist it
   into `projectAttributes` so GUI+CLI read one source, or ratify it as a pure UI
   preference with `--code-mode` as the CLI's sole entry.
3. **`getNewIconCode` semantics** — append/fill reconciled this session; keep the
   `core-code-allocation.test.ts` regression as the guard.
4. **Delete semantics** — renderer `delIcon`/`delIcons`/`deleteIconWithVariants`
   hard-delete; core `deleteIcons` soft-deletes (→`resource-deleted`) + cascades.
   GUI "move to recycle bin" goes through `moveIconGroup`. Unify the delete model
   (hard vs soft vs recycle) and split core into explicit `permanentDelete` vs
   `softDelete` before migrating.
5. **Move + variants** — renderer keeps both a variant-carrying and a
   non-carrying `moveIcons`; core `moveIcons` always carries variants. Unify
   naming + default behaviour.
6. **Set-color semantics** — renderer `updateIconsColor` = "recolour every colour
   to target" (DOM), CLI `setIconColor` = "replace `from`→`to`" (regex). These are
   two different operations; on migration split/name them clearly (recolour-all vs
   replace-color) and reconcile DOM-vs-regex results for CSS-class SVGs.
7. **`iconContentOriginal` baseline** — renderer preserves a pre-edit baseline for
   "reset colour"; core `setIconContent` does not. Replicate the baseline
   save/restore in core when colour/reset ops migrate.
8. **Project displayName / description / projectColor** — core `initSchema` never
   creates `description` / `projectColor`, and none have an operation/CLI;
   `displayName` has a core DB setter but no operation/CLI. Add core columns +
   `project set-display-name` / `set-description` / `set-color`, or mark them
   GUI-only in the registry (`cliCommand: null`).
9. **Group cover `groupIcon`** — renderer `setGroupInfo` sets it; core has no
   setter/op/CLI. Add `setGroupIcon` + `group set-icon`, or mark GUI-only.
10. **`group.add --description`** — renderer `addGroup` takes a description; core
    `addGroup` ignores it. Align or drop.
11. **Batch favourite** — let core `setIconFavorite` accept multiple ids so
    `icon set-favorite` can match the GUI's batch toggle.
12. **`.cp` import** — `addIconsFromCpData` (legacy `.cp` format) is renderer-only;
    decide whether a CLI `icon import --cp` is warranted.
13. **Read-only audit surface** — expose the GUI's read aggregations (duplicate/
    coverage/stats) as read-only CLI subcommands (`project stats`, `code audit`)
    so AI agents can inspect a project headlessly.

**Registry note:** items 8–9 imply new `registry.ts` entries
(`project.set-display-name`, `project.set-description`, `project.set-color`,
`group.set-icon`). Since `src/core/registry.ts` is under `src/`, they are recorded
here as backlog and left for the migration PR that lands the operations — do not
count them against progress until implemented.
