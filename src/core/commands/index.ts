/**
 * Core command layer barrel — synchronous pure command bodies
 * (`fn(db: ProjectDb, args) → DTO`, no I/O).
 *
 * Operations (Node) wrap these with file lifecycle (open/save); the GUI store
 * calls them directly against its own ProjectDb. Renderer-safe: no Node
 * builtins anywhere under src/core/commands/ (see
 * test/unit/core-boundary-guard.test.js).
 */
export * from './types';
export * from './icon';
export * from './group';
