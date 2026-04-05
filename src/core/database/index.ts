/**
 * Core Database Wrapper — lightweight sql.js wrapper for CLI + GUI.
 *
 * Provides typed query methods over the .icp SQLite database format.
 * Environment-agnostic: no browser globals or build-time env vars.
 * All file I/O goes through the IoAdapter interface.
 *
 * Uses sql.js ASM build (same as renderer) for cross-platform compatibility.
 */
import type { IoAdapter } from '../io';
import type { IconData, GroupData, ProjectAttributes } from '../types';

// ---------------------------------------------------------------------------
// sql.js types (no @types available for sql.js/dist/sql-asm.js)
// ---------------------------------------------------------------------------

interface SqlJsStatic {
  Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
}

interface SqlJsDatabase {
  run(sql: string, params?: any[]): SqlJsDatabase;
  exec(sql: string, params?: any[]): SqlJsQueryResult[];
  prepare(sql: string): SqlJsStatement;
  export(): Uint8Array;
  close(): void;
}

interface SqlJsQueryResult {
  columns: string[];
  values: any[][];
}

interface SqlJsStatement {
  step(): boolean;
  getAsObject(params?: Record<string, any>): Record<string, any>;
  free(): void;
}

// ---------------------------------------------------------------------------
// Table / trigger names (match renderer database exactly)
// ---------------------------------------------------------------------------

const TABLE_PROJECT = 'projectAttributes';
const TABLE_GROUP = 'groupData';
const TABLE_ICON = 'iconData';
const TRIGGER_PROJECT = 'projectAttributesTimeRenewTrigger';
const TRIGGER_GROUP = 'groupDataTimeRenewTrigger';
const TRIGGER_ICON = 'iconDataTimeRenewTrigger';

// ---------------------------------------------------------------------------
// Internal SQL helpers
// ---------------------------------------------------------------------------

/** SQL-safe string literal (single-quote wrap) */
function sf(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/** Convert sql.js exec result rows to array of objects */
function rowsToObjects(result: SqlJsQueryResult[]): Record<string, any>[] {
  if (result.length === 0) return [];
  const cols = result[0].columns;
  return result[0].values.map((row) => {
    const obj: Record<string, any> = {};
    row.forEach((val, i) => {
      obj[cols[i]] = val;
    });
    return obj;
  });
}

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
// ProjectDb — typed wrapper around a sql.js Database
// ---------------------------------------------------------------------------

export class ProjectDb {
  private db: SqlJsDatabase;

  constructor(db: SqlJsDatabase) {
    this.db = db;
  }

  /** Export the database as a binary Uint8Array (.icp file format) */
  export(): Uint8Array {
    return this.db.export();
  }

  /** Close the database and free memory */
  close(): void {
    this.db.close();
  }

  // ── Schema creation ─────────────────────────────────────────

  /**
   * Create the full schema for a new empty project.
   * Mirrors renderer's initNewProject() exactly.
   */
  initSchema(projectName: string = 'iconfont'): void {
    // Project attributes table
    this.db.run(
      `CREATE TABLE ${TABLE_PROJECT} (id varchar(255), projectName varchar(255), createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
    );
    this.db.run(
      `CREATE TRIGGER ${TRIGGER_PROJECT} AFTER UPDATE ON ${TABLE_PROJECT} FOR EACH ROW BEGIN UPDATE ${TABLE_PROJECT} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`
    );
    this.db.run(
      `INSERT INTO ${TABLE_PROJECT} (id, projectName) VALUES ('projectAttributes', ${sf(projectName)})`
    );

    // Group data table
    this.db.run(
      `CREATE TABLE ${TABLE_GROUP} (id varchar(255), groupName varchar(255), groupOrder int(255), groupColor varchar(255), groupDescription TEXT, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
    );
    this.db.run(
      `CREATE TRIGGER ${TRIGGER_GROUP} AFTER UPDATE ON ${TABLE_GROUP} FOR EACH ROW BEGIN UPDATE ${TABLE_GROUP} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`
    );

    // Icon data table
    this.db.run(
      `CREATE TABLE ${TABLE_ICON} (id varchar(255), iconCode varchar(255), iconName varchar(255), iconGroup varchar(255), iconSize int(255), iconType varchar(255), iconContent TEXT, iconContentOriginal TEXT, isFavorite INTEGER DEFAULT 0, variantOf varchar(255) DEFAULT NULL, variantMeta TEXT DEFAULT NULL, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
    );
    this.db.run(
      `CREATE TRIGGER ${TRIGGER_ICON} AFTER UPDATE ON ${TABLE_ICON} FOR EACH ROW BEGIN UPDATE ${TABLE_ICON} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`
    );

    // Variant index
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_iconData_variantOf ON ${TABLE_ICON} (variantOf)`);
  }

  // ── Migrations (for opening existing .icp files) ────────────

  /**
   * Run all schema migrations on an existing database.
   * Safe to call multiple times — each migration checks before altering.
   */
  runMigrations(): void {
    this.migrateIconColumns();
    this.migrateGroupColumns();
    this.migrateVariantColumns();
  }

  private getColumnNames(table: string): string[] {
    const cols = this.db.exec(`PRAGMA table_info(${table})`);
    if (!cols.length) return [];
    return cols[0].values.map((r: any[]) => r[1] as string);
  }

  private migrateIconColumns(): void {
    try {
      const colNames = this.getColumnNames(TABLE_ICON);
      if (colNames.length === 0) return;

      if (!colNames.includes('iconContentOriginal')) {
        this.db.run(`ALTER TABLE ${TABLE_ICON} ADD COLUMN iconContentOriginal TEXT`);
      }
      if (!colNames.includes('isFavorite')) {
        this.db.run(`ALTER TABLE ${TABLE_ICON} ADD COLUMN isFavorite INTEGER DEFAULT 0`);
      }
    } catch (_) {
      // Column might already exist
    }
  }

  private migrateGroupColumns(): void {
    try {
      const colNames = this.getColumnNames(TABLE_GROUP);
      if (colNames.length === 0) return;

      if (!colNames.includes('groupDescription')) {
        this.db.run(`ALTER TABLE ${TABLE_GROUP} ADD COLUMN groupDescription TEXT`);
      }
    } catch (_) {
      // Column might already exist
    }
  }

  private migrateVariantColumns(): void {
    try {
      const colNames = this.getColumnNames(TABLE_ICON);
      if (colNames.length === 0) return;

      if (!colNames.includes('variantOf')) {
        this.db.run(`ALTER TABLE ${TABLE_ICON} ADD COLUMN variantOf varchar(255) DEFAULT NULL`);
      }
      if (!colNames.includes('variantMeta')) {
        this.db.run(`ALTER TABLE ${TABLE_ICON} ADD COLUMN variantMeta TEXT DEFAULT NULL`);
      }
      // Ensure index exists (idempotent)
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_iconData_variantOf ON ${TABLE_ICON} (variantOf)`);
    } catch (_) {
      // Columns might already exist
    }
  }

  // ── Project attributes ──────────────────────────────────────

  getProjectAttributes(): ProjectAttributes {
    const stmt = this.db.prepare(`SELECT * FROM ${TABLE_PROJECT} WHERE id = 'projectAttributes'`);
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return row as unknown as ProjectAttributes;
  }

  getProjectName(): string {
    return this.getProjectAttributes().projectName;
  }

  setProjectName(name: string): void {
    this.db.run(
      `UPDATE ${TABLE_PROJECT} SET projectName = ${sf(name)} WHERE id = 'projectAttributes'`
    );
  }

  // ── Group queries ───────────────────────────────────────────

  getGroupList(): GroupData[] {
    const result = this.db.exec(`SELECT * FROM ${TABLE_GROUP} ORDER BY groupOrder ASC`);
    return rowsToObjects(result) as unknown as GroupData[];
  }

  getGroupCount(): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) FROM ${TABLE_GROUP}`);
    stmt.step();
    const count = stmt.getAsObject()['COUNT(*)'] as number;
    stmt.free();
    return count;
  }

  getIconCountForGroup(groupId: string): number {
    const stmt = this.db.prepare(
      `SELECT COUNT(*) FROM ${TABLE_ICON} WHERE iconGroup = ${sf(groupId)} AND variantOf IS NULL`
    );
    stmt.step();
    const count = stmt.getAsObject()['COUNT(*)'] as number;
    stmt.free();
    return count;
  }

  // ── Icon queries ────────────────────────────────────────────

  /** Get all non-variant icons (excludes deleted group) */
  /** Columns returned by list queries (excludes iconContent/iconContentOriginal for performance) */
  private static readonly LIST_COLS =
    'id, iconCode, iconName, iconGroup, iconSize, iconType, createTime, updateTime, isFavorite, variantOf, variantMeta';

  getIconList(): IconData[] {
    const result = this.db.exec(
      `SELECT ${ProjectDb.LIST_COLS} FROM ${TABLE_ICON} WHERE iconGroup != 'resource-deleted' AND variantOf IS NULL`
    );
    return rowsToObjects(result) as unknown as IconData[];
  }

  /** Get icons in a specific group (or all groups if groupId is 'resource-all') */
  getIconListFromGroup(groupId: string): IconData[] {
    if (groupId === 'resource-all') {
      const result = this.db.exec(
        `SELECT ${ProjectDb.LIST_COLS} FROM ${TABLE_ICON} WHERE variantOf IS NULL`
      );
      return rowsToObjects(result) as unknown as IconData[];
    }
    const result = this.db.exec(
      `SELECT ${ProjectDb.LIST_COLS} FROM ${TABLE_ICON} WHERE iconGroup = ${sf(groupId)} AND variantOf IS NULL`
    );
    return rowsToObjects(result) as unknown as IconData[];
  }

  getIconCount(): number {
    const stmt = this.db.prepare(
      `SELECT COUNT(*) FROM ${TABLE_ICON} WHERE iconGroup != 'resource-deleted' AND variantOf IS NULL`
    );
    stmt.step();
    const count = stmt.getAsObject()['COUNT(*)'] as number;
    stmt.free();
    return count;
  }
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
 * @param projectName - Font prefix / project name (defaults to 'iconfont')
 */
export async function createEmptyProject(projectName?: string): Promise<ProjectDb> {
  const SQL = await getSqlJs();
  const db = new SQL.Database();
  const projectDb = new ProjectDb(db);
  projectDb.initSchema(projectName);
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
