# Core Migration Guide

## Overview

Bobcorn is migrating business logic from `src/renderer/` to `src/core/` so that both GUI and CLI share the same code. This doc tracks progress and process.

## Current Progress

Run `node scripts/migration-status.js` to see the latest status.

## How to Migrate an Operation

1. Find the operation in `src/core/registry.ts`, update status to `Migrating`
2. Create/update the operation function in `src/core/operations/<domain>.ts`
3. The operation receives `IoAdapter` (and `CanvasAdapter` if needed) -- never import `fs`, `path`, `window`, or `electronAPI`
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
  canvas.ts          CanvasAdapter interface (image abstraction)
  types.ts           Shared domain types
  registry.ts        Operation status registry
  operations/        Operation implementations

src/cli/             <-- CLI entry point (Node.js IoAdapter)
src/renderer/        <-- GUI (store wraps core, components use store)
```

## Enforcement

- **ESLint**: `no-restricted-imports` rule warns on direct `database/` imports in renderer
- **Boundary guard test**: `test/unit/core-boundary-guard.test.js` catches violations at CI time
- **Registry**: `scripts/migration-status.js` shows progress dashboard
