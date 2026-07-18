/**
 * Core database barrel — re-exports the split database layer.
 *
 * - ./project-db: ProjectDb class + sql.js types. Renderer-safe (zero Node
 *   builtins) — renderer code imports '@core/database/project-db' directly.
 * - ./lifecycle: getSqlJs (Node require) + openProject/createEmptyProject/
 *   saveProject file lifecycle. CLI/main-process only.
 *
 * This barrel keeps the historical import surface (`from '../database'`)
 * intact for core operations and the CLI. Renderer code must NOT import this
 * barrel (it would drag in lifecycle's `require('sql.js/...')`) — enforced by
 * test/unit/core-boundary-guard.test.js.
 *
 * safe-stmt stays a standalone module: import it from './safe-stmt'.
 */
export * from './project-db';
export * from './lifecycle';
