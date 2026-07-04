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
import type { IconData, GroupData, ProjectAttributes, CodeAllocationMode } from '../types';
import { allocateIconCodeDec, planRangeReassignments, type CodeRange } from '../code-allocation';
import crypto from 'crypto';

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
const TRIGGER_CLEANUP_GROUP_ICON_DELETE = 'cleanupGroupIconOnDelete';
const TRIGGER_CLEANUP_GROUP_ICON_MOVE = 'cleanupGroupIconOnMove';

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
// Shared result shapes
// ---------------------------------------------------------------------------

/** One planned icon-code reassignment (see ProjectDb.planIconCodeFixes) */
export interface IconCodeFix {
  id: string;
  iconName: string;
  /** Original code as stored (may be invalid / empty) */
  oldCode: string;
  /** New 4-digit uppercase hex code in the PUA range */
  newCode: string;
  reason: 'duplicate' | 'invalid';
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
  initSchema(projectName: string = 'iconfont', displayName?: string): void {
    // Project attributes table.
    // projectName = icon code prefix (technical); displayName = user-facing project name.
    this.db.run(
      `CREATE TABLE ${TABLE_PROJECT} (id varchar(255), projectName varchar(255), displayName varchar(255), createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
    );
    this.db.run(
      `CREATE TRIGGER ${TRIGGER_PROJECT} AFTER UPDATE ON ${TABLE_PROJECT} FOR EACH ROW BEGIN UPDATE ${TABLE_PROJECT} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`
    );
    if (displayName) {
      this.db.run(
        `INSERT INTO ${TABLE_PROJECT} (id, projectName, displayName) VALUES ('projectAttributes', ${sf(projectName)}, ${sf(displayName)})`
      );
    } else {
      this.db.run(
        `INSERT INTO ${TABLE_PROJECT} (id, projectName) VALUES ('projectAttributes', ${sf(projectName)})`
      );
    }

    // Group data table
    // codeRangeStart/codeRangeEnd = optional per-group PUA code range (decimal code points).
    this.db.run(
      `CREATE TABLE ${TABLE_GROUP} (id varchar(255), groupName varchar(255), groupOrder int(255), groupColor varchar(255), groupDescription TEXT, groupIcon TEXT, codeRangeStart int, codeRangeEnd int, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
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

    // Cleanup triggers: auto-NULL groupIcon when referenced icon is deleted or moved
    this.db.run(
      `CREATE TRIGGER ${TRIGGER_CLEANUP_GROUP_ICON_DELETE} AFTER DELETE ON ${TABLE_ICON} FOR EACH ROW BEGIN UPDATE ${TABLE_GROUP} SET groupIcon = NULL WHERE groupIcon = OLD.id; END`
    );
    this.db.run(
      `CREATE TRIGGER ${TRIGGER_CLEANUP_GROUP_ICON_MOVE} AFTER UPDATE OF iconGroup ON ${TABLE_ICON} WHEN OLD.iconGroup != NEW.iconGroup BEGIN UPDATE ${TABLE_GROUP} SET groupIcon = NULL WHERE groupIcon = OLD.id AND id = OLD.iconGroup; END`
    );
  }

  // ── Migrations (for opening existing .icp files) ────────────

  /**
   * Run all schema migrations on an existing database.
   * Safe to call multiple times — each migration checks before altering.
   */
  runMigrations(): void {
    this.migrateProjectColumns();
    this.migrateIconColumns();
    this.migrateGroupColumns();
    this.migrateVariantColumns();
  }

  private migrateProjectColumns(): void {
    try {
      const colNames = this.getColumnNames(TABLE_PROJECT);
      if (colNames.length === 0) return;

      // Split project name (icon code prefix) from user-facing display name.
      if (!colNames.includes('displayName')) {
        this.db.run(`ALTER TABLE ${TABLE_PROJECT} ADD COLUMN displayName varchar(255)`);
      }
    } catch (_) {
      // Column might already exist
    }
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

      if (!colNames.includes('groupIcon')) {
        this.db.run(`ALTER TABLE ${TABLE_GROUP} ADD COLUMN groupIcon TEXT`);
      }

      // Per-group code range (optional PUA sub-range, decimal code points)
      if (!colNames.includes('codeRangeStart')) {
        this.db.run(`ALTER TABLE ${TABLE_GROUP} ADD COLUMN codeRangeStart int`);
      }
      if (!colNames.includes('codeRangeEnd')) {
        this.db.run(`ALTER TABLE ${TABLE_GROUP} ADD COLUMN codeRangeEnd int`);
      }

      // Cleanup triggers (drop + create for idempotency)
      this.db.run(`DROP TRIGGER IF EXISTS ${TRIGGER_CLEANUP_GROUP_ICON_DELETE}`);
      this.db.run(
        `CREATE TRIGGER ${TRIGGER_CLEANUP_GROUP_ICON_DELETE} AFTER DELETE ON ${TABLE_ICON} FOR EACH ROW BEGIN UPDATE ${TABLE_GROUP} SET groupIcon = NULL WHERE groupIcon = OLD.id; END`
      );
      this.db.run(`DROP TRIGGER IF EXISTS ${TRIGGER_CLEANUP_GROUP_ICON_MOVE}`);
      this.db.run(
        `CREATE TRIGGER ${TRIGGER_CLEANUP_GROUP_ICON_MOVE} AFTER UPDATE OF iconGroup ON ${TABLE_ICON} WHEN OLD.iconGroup != NEW.iconGroup BEGIN UPDATE ${TABLE_GROUP} SET groupIcon = NULL WHERE groupIcon = OLD.id AND id = OLD.iconGroup; END`
      );

      // One-time repair: clean up orphaned groupIcon references
      this.db.run(
        `UPDATE ${TABLE_GROUP} SET groupIcon = NULL WHERE groupIcon IS NOT NULL AND groupIcon NOT IN (SELECT id FROM ${TABLE_ICON})`
      );
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

  /** Human-readable project name (separate from the icon code prefix). */
  getProjectDisplayName(): string | null {
    return (this.getProjectAttributes().displayName as string | undefined) || null;
  }

  setProjectDisplayName(displayName: string | null): void {
    if (displayName) {
      this.db.run(
        `UPDATE ${TABLE_PROJECT} SET displayName = ${sf(displayName)} WHERE id = 'projectAttributes'`
      );
    } else {
      this.db.run(`UPDATE ${TABLE_PROJECT} SET displayName = NULL WHERE id = 'projectAttributes'`);
    }
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
      `SELECT ${ProjectDb.LIST_COLS} FROM ${TABLE_ICON} WHERE iconGroup != 'resource-deleted' AND iconGroup != 'resource-recycleBin' AND variantOf IS NULL`
    );
    return rowsToObjects(result) as unknown as IconData[];
  }

  /** Get all non-variant, non-deleted, non-recycled icons WITH iconContent (for font generation). */
  getIconListWithContent(): IconData[] {
    const result = this.db.exec(
      `SELECT * FROM ${TABLE_ICON} WHERE iconGroup != 'resource-deleted' AND iconGroup != 'resource-recycleBin' AND variantOf IS NULL`
    );
    return rowsToObjects(result) as unknown as IconData[];
  }

  /** Get icons in a specific group WITH iconContent (for font generation). */
  getIconListFromGroupWithContent(groupId: string): IconData[] {
    if (groupId === 'resource-all') {
      const result = this.db.exec(`SELECT * FROM ${TABLE_ICON} WHERE variantOf IS NULL`);
      return rowsToObjects(result) as unknown as IconData[];
    }
    const result = this.db.exec(
      `SELECT * FROM ${TABLE_ICON} WHERE iconGroup = ${sf(groupId)} AND variantOf IS NULL`
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

  // ── Icon content queries ─────────────────────────────────────

  /** Get the raw SVG content of an icon by id */
  getIconContent(id: string): string | null {
    const result = this.db.exec(`SELECT iconContent FROM ${TABLE_ICON} WHERE id = ${sf(id)}`);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return result[0].values[0][0] as string;
  }

  /** Get a single icon record by id (all columns) */
  getIcon(id: string): Record<string, any> | null {
    const result = this.db.exec(`SELECT * FROM ${TABLE_ICON} WHERE id = ${sf(id)}`);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const cols = result[0].columns;
    const row = result[0].values[0];
    const obj: Record<string, any> = {};
    row.forEach((val, i) => {
      obj[cols[i]] = val;
    });
    return obj;
  }

  // ── Icon mutations ──────────────────────────────────────────

  /**
   * Get the next available unicode code point (hex string, e.g. "E000").
   * Mirrors the renderer's codeAllocationMode semantics exactly
   * (src/renderer/database/index.ts#getNewIconCode):
   *   append (default) — allocate past the highest currently-used code in the
   *     PUA range, protecting already-published CSS references from code
   *     reuse. Falls back to hole-filling when the tail is full (next code
   *     would exceed F8FF).
   *   fill — always return the lowest free code point (fills holes first).
   * Throws PUA_EXHAUSTED when all 6400 code points are in use — callers must
   * not silently reuse an occupied code (duplicate codes corrupt font export).
   */
  getNewIconCode(mode: CodeAllocationMode = 'append', targetGroupId?: string): string {
    const result = this.db.exec(`SELECT iconCode FROM ${TABLE_ICON}`);
    const usedSet = new Set<number>();
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        const c = parseInt(row[0] as string, 16);
        if (Number.isFinite(c)) usedSet.add(c);
      });
    }

    // A ranged target group allocates strictly inside its range; otherwise the
    // global pool allocation skips every declared range (reserved code points).
    const targetRange = this.getGroupCodeRange(targetGroupId);
    const reserved = targetRange ? [] : this.getAllGroupCodeRanges();
    const dec = allocateIconCodeDec(mode, usedSet, targetRange, reserved);
    return dec.toString(16).toUpperCase();
  }

  /**
   * Resolve a group's declared code range, or null when the group has none
   * (also null for virtual groups such as 'resource-uncategorized').
   */
  getGroupCodeRange(groupId?: string): CodeRange | null {
    if (!groupId || groupId.startsWith('resource-')) return null;
    let rows: any[][];
    try {
      const result = this.db.exec(
        `SELECT codeRangeStart, codeRangeEnd FROM ${TABLE_GROUP} WHERE id = ${sf(groupId)}`
      );
      if (result.length === 0 || result[0].values.length === 0) return null;
      rows = result[0].values;
    } catch {
      return null; // columns not present (unmigrated file)
    }
    const [start, end] = rows[0];
    if (start === null || start === undefined || end === null || end === undefined) return null;
    return { start: Number(start), end: Number(end) };
  }

  /** All declared group code ranges (groups with both bounds set). */
  getAllGroupCodeRanges(): CodeRange[] {
    try {
      const result = this.db.exec(
        `SELECT codeRangeStart, codeRangeEnd FROM ${TABLE_GROUP} WHERE codeRangeStart IS NOT NULL AND codeRangeEnd IS NOT NULL`
      );
      if (result.length === 0) return [];
      return result[0].values.map((r) => ({ start: Number(r[0]), end: Number(r[1]) }));
    } catch {
      return [];
    }
  }

  /**
   * Set or clear a group's code range. Pass null/null to clear.
   * Values are decimal PUA code points; no validation here (callers validate).
   */
  setGroupCodeRange(id: string, start: number | null, end: number | null): void {
    if (start === null || end === null) {
      this.db.run(
        `UPDATE ${TABLE_GROUP} SET codeRangeStart = NULL, codeRangeEnd = NULL WHERE id = ${sf(id)}`
      );
    } else {
      this.db.run(
        `UPDATE ${TABLE_GROUP} SET codeRangeStart = ${Math.trunc(start)}, codeRangeEnd = ${Math.trunc(end)} WHERE id = ${sf(id)}`
      );
    }
  }

  /**
   * Every group's declared range plus identity, for overlap checks and inspection.
   * Returns only groups that actually declare a range.
   */
  getGroupRanges(): { id: string; groupName: string; start: number; end: number }[] {
    let result: SqlJsQueryResult[];
    try {
      result = this.db.exec(
        `SELECT id, groupName, codeRangeStart, codeRangeEnd FROM ${TABLE_GROUP} WHERE codeRangeStart IS NOT NULL AND codeRangeEnd IS NOT NULL`
      );
    } catch {
      return [];
    }
    if (result.length === 0) return [];
    return result[0].values.map((r) => ({
      id: String(r[0]),
      groupName: String(r[1] ?? ''),
      start: Number(r[2]),
      end: Number(r[3]),
    }));
  }

  /**
   * Icons in a group whose code is invalid or outside [start, end] (parents and
   * variants). Feeds group inspect / range-violations.
   */
  getGroupIconsOutOfRange(
    groupId: string,
    start: number,
    end: number
  ): { id: string; iconName: string; iconCode: string }[] {
    const result = this.db.exec(
      `SELECT id, iconName, iconCode FROM ${TABLE_ICON} WHERE iconGroup = ${sf(groupId)}`
    );
    if (result.length === 0) return [];
    const out: { id: string; iconName: string; iconCode: string }[] = [];
    for (const row of result[0].values) {
      const iconCode = String(row[2] ?? '');
      const dec = parseInt(iconCode, 16);
      const inRange = Number.isFinite(dec) && dec >= start && dec <= end;
      if (!inRange) {
        out.push({ id: String(row[0]), iconName: String(row[1] ?? ''), iconCode });
      }
    }
    return out;
  }

  /** Count of a group's icons whose code is invalid or outside [start, end]. */
  countGroupIconsOutOfRange(groupId: string, start: number, end: number): number {
    return this.getGroupIconsOutOfRange(groupId, start, end).length;
  }

  /**
   * Range occupancy: how many distinct code points inside [start, end] are
   * occupied by ANY icon (used), the range capacity, and the free remainder.
   */
  getRangeOccupancy(start: number, end: number): { used: number; capacity: number; free: number } {
    const capacity = end - start + 1;
    const result = this.db.exec(`SELECT iconCode FROM ${TABLE_ICON}`);
    const inRange = new Set<number>();
    if (result.length > 0) {
      result[0].values.forEach((row) => {
        const c = parseInt(row[0] as string, 16);
        if (Number.isFinite(c) && c >= start && c <= end) inRange.add(c);
      });
    }
    const used = inRange.size;
    return { used, capacity, free: capacity - used };
  }

  /**
   * Insert a new icon into the database.
   */
  addIcon(opts: {
    id: string;
    iconCode: string;
    iconName: string;
    iconGroup: string;
    iconSize: number;
    iconType: string;
    iconContent: string;
  }): void {
    this.db.run(
      `INSERT INTO ${TABLE_ICON} (id, iconCode, iconName, iconGroup, iconSize, iconType, iconContent, iconContentOriginal) VALUES (${sf(opts.id)}, ${sf(opts.iconCode)}, ${sf(opts.iconName)}, ${sf(opts.iconGroup)}, ${opts.iconSize}, ${sf(opts.iconType)}, ${sf(opts.iconContent)}, ${sf(opts.iconContent)})`
    );
  }

  /**
   * Soft-delete an icon by moving it to 'resource-deleted' group.
   * Also cascade-deletes all variants (hard delete for variants).
   */
  deleteIcon(id: string): void {
    // Hard-delete variants of this icon
    this.db.run(`DELETE FROM ${TABLE_ICON} WHERE variantOf = ${sf(id)}`);
    // Soft-delete the icon itself
    this.db.run(`UPDATE ${TABLE_ICON} SET iconGroup = 'resource-deleted' WHERE id = ${sf(id)}`);
  }

  /**
   * Soft-delete multiple icons (move to 'resource-deleted').
   * Cascade-deletes variants for each icon.
   */
  deleteIcons(ids: string[]): void {
    if (ids.length === 0) return;
    const inClause = ids.map((id) => sf(id)).join(',');
    // Hard-delete variants
    this.db.run(`DELETE FROM ${TABLE_ICON} WHERE variantOf IN (${inClause})`);
    // Soft-delete icons
    this.db.run(
      `UPDATE ${TABLE_ICON} SET iconGroup = 'resource-deleted' WHERE id IN (${inClause})`
    );
  }

  /**
   * Rename an icon by id.
   */
  setIconName(id: string, name: string): void {
    this.db.run(`UPDATE ${TABLE_ICON} SET iconName = ${sf(name)} WHERE id = ${sf(id)}`);
  }

  /**
   * Move a single icon (and its variants) to a new group.
   */
  moveIcon(id: string, targetGroupId: string): void {
    const group = targetGroupId === 'resource-all' ? 'resource-uncategorized' : targetGroupId;
    this.db.run(
      `UPDATE ${TABLE_ICON} SET iconGroup = ${sf(group)} WHERE id = ${sf(id)} OR variantOf = ${sf(id)}`
    );
  }

  /**
   * Move multiple icons (and their variants) to a new group.
   */
  moveIcons(ids: string[], targetGroupId: string): void {
    if (ids.length === 0) return;
    const group = targetGroupId === 'resource-all' ? 'resource-uncategorized' : targetGroupId;
    const inClause = ids.map((id) => sf(id)).join(',');
    // Move icons themselves
    this.db.run(`UPDATE ${TABLE_ICON} SET iconGroup = ${sf(group)} WHERE id IN (${inClause})`);
    // Move their variants
    this.db.run(
      `UPDATE ${TABLE_ICON} SET iconGroup = ${sf(group)} WHERE variantOf IN (${inClause})`
    );
  }

  /**
   * Reallocate icons (given by parent id, variants included) whose code is
   * outside the target group's declared range into free code points inside it.
   * No-op (returns []) when the group has no range. Shares one allocation
   * baseline across the batch so reassigned codes never collide. Throws
   * GROUP_RANGE_EXHAUSTED when the range cannot fit every out-of-range icon.
   */
  reassignIconsIntoRange(
    parentIds: string[],
    targetGroupId: string,
    mode: CodeAllocationMode = 'append'
  ): { id: string; oldCode: string; newCode: string }[] {
    const range = this.getGroupCodeRange(targetGroupId);
    if (!range || parentIds.length === 0) return [];

    // Baseline snapshot of every used code point (taken once for the batch).
    const usedSet = new Set<number>();
    const allCodes = this.db.exec(`SELECT iconCode FROM ${TABLE_ICON}`);
    if (allCodes.length > 0) {
      allCodes[0].values.forEach((row) => {
        const c = parseInt(row[0] as string, 16);
        if (Number.isFinite(c)) usedSet.add(c);
      });
    }

    // Affected rows = the moved icons + all their variants, ordered stably.
    const inClause = parentIds.map((id) => sf(id)).join(',');
    const affectedResult = this.db.exec(
      `SELECT id, iconCode FROM ${TABLE_ICON} WHERE id IN (${inClause}) OR variantOf IN (${inClause})`
    );
    if (affectedResult.length === 0) return [];
    const affected = affectedResult[0].values.map((row) => ({
      id: String(row[0]),
      code: String(row[1] ?? ''),
    }));

    const reassigned = planRangeReassignments(mode, usedSet, affected, range);
    for (const r of reassigned) {
      this.setIconCode(r.id, r.newCode);
    }
    return reassigned;
  }

  // ── Group mutations ─────────────────────────────────────────

  /**
   * Add a new group. Returns the generated group data.
   */
  addGroup(id: string, name: string): { id: string; groupName: string; groupOrder: number } {
    const orderResult = this.db.exec(`SELECT COUNT(*) FROM ${TABLE_GROUP}`);
    const groupOrder = orderResult.length > 0 ? (orderResult[0].values[0][0] as number) : 0;
    this.db.run(
      `INSERT INTO ${TABLE_GROUP} (id, groupName, groupOrder, groupColor) VALUES (${sf(id)}, ${sf(name)}, ${groupOrder}, '')`
    );
    return { id, groupName: name, groupOrder };
  }

  /**
   * Rename a group by id.
   */
  setGroupName(id: string, name: string): void {
    this.db.run(`UPDATE ${TABLE_GROUP} SET groupName = ${sf(name)} WHERE id = ${sf(id)}`);
  }

  /**
   * Delete a group by id. Moves all icons in the group to 'resource-uncategorized'.
   */
  deleteGroup(id: string): void {
    // Move icons to uncategorized first
    this.db.run(
      `UPDATE ${TABLE_ICON} SET iconGroup = 'resource-uncategorized' WHERE iconGroup = ${sf(id)}`
    );
    // Delete the group
    this.db.run(`DELETE FROM ${TABLE_GROUP} WHERE id = ${sf(id)}`);
  }

  /**
   * Find a group by name. Returns null if not found.
   */
  findGroupByName(name: string): Record<string, any> | null {
    const result = this.db.exec(`SELECT * FROM ${TABLE_GROUP} WHERE groupName = ${sf(name)}`);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const cols = result[0].columns;
    const row = result[0].values[0];
    const obj: Record<string, any> = {};
    row.forEach((val, i) => {
      obj[cols[i]] = val;
    });
    return obj;
  }

  // ── Icon copy (duplicate) ──────────────────────────────────

  /**
   * Duplicate an icon into a target group with new UUID and unicode code.
   * Does NOT copy variants.
   * Returns the new icon's id and code.
   */
  copyIcon(
    sourceId: string,
    targetGroupId: string,
    mode: CodeAllocationMode = 'append'
  ): { id: string; iconCode: string; iconName: string } {
    const source = this.getIcon(sourceId);
    if (!source) throw new Error(`Icon not found: ${sourceId}`);

    const id = crypto.randomUUID();
    const group = targetGroupId === 'resource-all' ? 'resource-uncategorized' : targetGroupId;
    // Allocate inside the target group's range when it declares one.
    const iconCode = this.getNewIconCode(mode, group);

    this.db.run(
      `INSERT INTO ${TABLE_ICON} (id, iconCode, iconName, iconGroup, iconSize, iconType, iconContent, iconContentOriginal) VALUES (${sf(id)}, ${sf(iconCode)}, ${sf(source.iconName as string)}, ${sf(group)}, ${source.iconSize}, ${sf(source.iconType as string)}, ${sf(source.iconContent as string)}, ${sf((source.iconContentOriginal ?? source.iconContent) as string)})`
    );

    return { id, iconCode, iconName: source.iconName as string };
  }

  // ── Icon code / favorite / content mutations ───────────────

  /**
   * Set the unicode code point for an icon.
   */
  setIconCode(id: string, code: string): void {
    this.db.run(
      `UPDATE ${TABLE_ICON} SET iconCode = ${sf(code.toUpperCase())} WHERE id = ${sf(id)}`
    );
  }

  /**
   * Compute a fix plan for duplicate/invalid icon codes (dry-run — does NOT write).
   *
   * Scans ALL iconData rows (including recycle bin / deleted / variant rows, in
   * natural table order). A code is valid when trim+uppercase matches /^[0-9A-F]{4}$/
   * and falls in the PUA range E000-F8FF. Rows are grouped by normalized code value:
   * - Duplicate groups (>1 row per code, processed in ascending code order): the
   *   first row whose iconGroup is not recycled ('resource-recycleBin' /
   *   'resource-deleted') keeps its code (falls back to the group's first row when
   *   all are recycled); every other row is reassigned to the next free code point.
   * - Invalid rows are reassigned after all duplicates, in table order.
   * Free code points are the ascending unused values in E000-F8FF.
   * Throws PUA_EXHAUSTED when there are not enough free code points.
   */
  planIconCodeFixes(): IconCodeFix[] {
    const result = this.db.exec(`SELECT id, iconName, iconCode, iconGroup FROM ${TABLE_ICON}`);
    if (result.length === 0) return [];
    const rows = result[0].values.map((r) => ({
      id: String(r[0]),
      iconName: String(r[1] ?? ''),
      iconCode: String(r[2] ?? ''),
      iconGroup: String(r[3] ?? ''),
    }));

    const PUA_MIN = 0xe000;
    const PUA_MAX = 0xf8ff;
    const normalize = (raw: string): number | null => {
      const hex = raw.trim().toUpperCase();
      if (!/^[0-9A-F]{4}$/.test(hex)) return null;
      const decCode = parseInt(hex, 16);
      return decCode >= PUA_MIN && decCode <= PUA_MAX ? decCode : null;
    };

    const byCode = new Map<number, typeof rows>();
    const invalidRows: typeof rows = [];
    for (const row of rows) {
      const decCode = normalize(row.iconCode);
      if (decCode === null) {
        invalidRows.push(row);
      } else {
        const list = byCode.get(decCode);
        if (list) list.push(row);
        else byCode.set(decCode, [row]);
      }
    }

    // Free code point pool (ascending)
    const freeCodes: number[] = [];
    for (let c = PUA_MIN; c <= PUA_MAX; c++) {
      if (!byCode.has(c)) freeCodes.push(c);
    }
    let freeIdx = 0;
    const nextFree = (): string => {
      if (freeIdx >= freeCodes.length) {
        throw new Error(
          'PUA_EXHAUSTED: not enough free code points (E000-F8FF) to fix all icon codes'
        );
      }
      return freeCodes[freeIdx++].toString(16).toUpperCase();
    };

    const isRecycled = (g: string) => g === 'resource-recycleBin' || g === 'resource-deleted';
    const fixes: IconCodeFix[] = [];

    // Duplicate groups in ascending code order; reassign everything but the keeper
    const dupGroups = [...byCode.entries()]
      .filter(([, list]) => list.length > 1)
      .sort((a, b) => a[0] - b[0]);
    for (const [, list] of dupGroups) {
      const keeperIdx = Math.max(
        0,
        list.findIndex((r) => !isRecycled(r.iconGroup))
      );
      list.forEach((row, i) => {
        if (i === keeperIdx) return;
        fixes.push({
          id: row.id,
          iconName: row.iconName,
          oldCode: row.iconCode,
          newCode: nextFree(),
          reason: 'duplicate',
        });
      });
    }
    // Invalid rows reassigned in table order, after duplicates
    for (const row of invalidRows) {
      fixes.push({
        id: row.id,
        iconName: row.iconName,
        oldCode: row.iconCode,
        newCode: nextFree(),
        reason: 'invalid',
      });
    }
    return fixes;
  }

  /**
   * Apply a fix plan produced by planIconCodeFixes() — UPDATEs each row's iconCode.
   */
  applyIconCodeFixes(fixes: { id: string; newCode: string }[]): void {
    for (const fix of fixes) {
      this.db.run(
        `UPDATE ${TABLE_ICON} SET iconCode = ${sf(fix.newCode.toUpperCase())} WHERE id = ${sf(fix.id)}`
      );
    }
  }

  /**
   * Replace an icon's SVG content. Sets both iconContent and iconContentOriginal.
   * Also deletes any variants of this icon.
   */
  replaceIconContent(id: string, content: string): void {
    const size = new TextEncoder().encode(content).length;
    this.db.run(
      `UPDATE ${TABLE_ICON} SET iconContent = ${sf(content)}, iconContentOriginal = ${sf(content)}, iconSize = ${size} WHERE id = ${sf(id)}`
    );
    // Delete variants
    this.db.run(`DELETE FROM ${TABLE_ICON} WHERE variantOf = ${sf(id)}`);
  }

  /**
   * Set or unset the favorite flag for an icon.
   */
  setIconFavorite(id: string, isFavorite: boolean): void {
    this.db.run(`UPDATE ${TABLE_ICON} SET isFavorite = ${isFavorite ? 1 : 0} WHERE id = ${sf(id)}`);
  }

  /**
   * Get all favorite icons (non-variant, non-deleted).
   */
  getFavoriteIcons(): IconData[] {
    const result = this.db.exec(
      `SELECT ${ProjectDb.LIST_COLS} FROM ${TABLE_ICON} WHERE isFavorite = 1 AND iconGroup != 'resource-deleted' AND variantOf IS NULL`
    );
    return rowsToObjects(result) as unknown as IconData[];
  }

  // ── Variant queries ──────────────────────────────────────

  /**
   * Get all variants of a parent icon, ordered by name.
   */
  getVariants(parentId: string): Record<string, any>[] {
    const result = this.db.exec(
      `SELECT * FROM ${TABLE_ICON} WHERE variantOf = ${sf(parentId)} ORDER BY iconName ASC`
    );
    return rowsToObjects(result);
  }

  /**
   * Get count of variants for a parent icon.
   */
  getVariantCount(parentId: string): number {
    const stmt = this.db.prepare(
      `SELECT COUNT(*) FROM ${TABLE_ICON} WHERE variantOf = ${sf(parentId)}`
    );
    stmt.step();
    const count = stmt.getAsObject()['COUNT(*)'] as number;
    stmt.free();
    return count;
  }

  /**
   * Delete all variants of a parent icon (hard delete).
   * Returns the number of deleted rows.
   */
  deleteVariants(parentId: string): number {
    const count = this.getVariantCount(parentId);
    this.db.run(`DELETE FROM ${TABLE_ICON} WHERE variantOf = ${sf(parentId)}`);
    return count;
  }

  // ── Icon content mutations ──────────────────────────────

  /**
   * Update iconContent for an icon (without touching iconContentOriginal).
   * Used for color changes and other non-destructive edits.
   */
  setIconContent(id: string, content: string): void {
    this.db.run(`UPDATE ${TABLE_ICON} SET iconContent = ${sf(content)} WHERE id = ${sf(id)}`);
  }

  /**
   * Search icons by name substring. Optional group filter and limit.
   */
  searchIcons(query: string, opts?: { groupId?: string; limit?: number }): IconData[] {
    // Escape LIKE metacharacters so '%' and '_' in query are treated literally
    const escaped = query.replace(/%/g, '\\%').replace(/_/g, '\\_');
    let sql = `SELECT ${ProjectDb.LIST_COLS} FROM ${TABLE_ICON} WHERE iconName LIKE ${sf('%' + escaped + '%')} ESCAPE '\\' AND variantOf IS NULL AND iconGroup != 'resource-deleted'`;
    if (opts?.groupId) {
      sql += ` AND iconGroup = ${sf(opts.groupId)}`;
    }
    if (opts?.limit && opts.limit > 0) {
      sql += ` LIMIT ${Math.max(0, Math.floor(opts.limit))}`;
    }
    const result = this.db.exec(sql);
    return rowsToObjects(result) as unknown as IconData[];
  }

  // ── Group order / description ──────────────────────────────

  /**
   * Set groupOrder for a group by id.
   */
  setGroupOrder(id: string, order: number): void {
    this.db.run(`UPDATE ${TABLE_GROUP} SET groupOrder = ${order} WHERE id = ${sf(id)}`);
  }

  /**
   * Set groupDescription for a group by id.
   */
  setGroupDescription(id: string, description: string): void {
    this.db.run(
      `UPDATE ${TABLE_GROUP} SET groupDescription = ${sf(description)} WHERE id = ${sf(id)}`
    );
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
