/**
 * Project lifecycle — sql.js loading + .icp file open/create/save.
 *
 * This is the Node/CLI-facing half of the database layer: it owns the
 * `require('sql.js/dist/sql-asm.js')` call and all file I/O (via IoAdapter).
 * Renderer code must NOT import this module — it imports ProjectDb from
 * ./project-db and constructs it around its own sql.js instance instead.
 * Guarded by test/unit/core-boundary-guard.test.js.
 */
import type { IoAdapter } from '../io';
import { ProjectDb, type SqlJsStatic } from './project-db';

// ---------------------------------------------------------------------------
// Lazy sql.js loader — cached singleton
// ---------------------------------------------------------------------------

let _sqlJsPromise: Promise<SqlJsStatic> | null = null;

function getSqlJs(): Promise<SqlJsStatic> {
  if (!_sqlJsPromise) {
    _sqlJsPromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const initSqlJs = require('sql.js/dist/sql-asm.js');
      return initSqlJs() as Promise<SqlJsStatic>;
    })();
  }
  return _sqlJsPromise;
}

// ---------------------------------------------------------------------------
// Public API — factory functions
// ---------------------------------------------------------------------------

/**
 * Open an existing .icp project file.
 * Reads the file via IoAdapter, initializes sql.js, runs migrations.
 */
export async function openProject(io: IoAdapter, path: string): Promise<ProjectDb> {
  const data = await io.readFile(path);
  const SQL = await getSqlJs();
  const db = new SQL.Database(data);
  const projectDb = new ProjectDb(db);
  projectDb.runMigrations();
  return projectDb;
}

/**
 * Create a new empty in-memory database with the full schema.
 * @param projectName - Icon code prefix / font family name (defaults to 'iconfont')
 * @param displayName - Optional user-facing project name (falls back to projectName)
 */
export async function createEmptyProject(
  projectName?: string,
  displayName?: string
): Promise<ProjectDb> {
  const SQL = await getSqlJs();
  const db = new SQL.Database();
  const projectDb = new ProjectDb(db);
  projectDb.initSchema(projectName, displayName);
  return projectDb;
}

/**
 * Save a ProjectDb to a file via IoAdapter.
 * Exports the database as binary and writes to the given path.
 */
export async function saveProject(io: IoAdapter, path: string, db: ProjectDb): Promise<void> {
  const dir = io.dirname(path);
  if (!(await io.exists(dir))) {
    await io.mkdir(dir, { recursive: true });
  }
  const data = db.export();
  await io.writeFile(path, data);
}
