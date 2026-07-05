/**
 * Safe sql.js prepared-statement helpers — the ONLY sanctioned way to call
 * db.prepare() in this codebase.
 *
 * WHY: sql.js runs SQLite inside an Emscripten heap. A prepared statement is a
 * handle to C-side memory that the JS garbage collector can never reclaim —
 * every prepare() MUST be paired with free(), or the heap (fixed-size in the
 * sql-asm build we ship) fills up until SQLite dies with Aborted(OOM).
 *
 * HOW: the statement lifecycle is fully enclosed here in try/finally, so
 * callers cannot forget to free — even on exception paths. Raw `.prepare(`
 * calls anywhere else under src/ are rejected by
 * test/unit/sqljs-statement-guard.test.js.
 */

/** Structural view of the sql.js objects we need (no official @types for the asm build). */
export interface SqlJsSafeStatement {
  bind(params: unknown[]): boolean;
  step(): boolean;
  get(): unknown[];
  getAsObject(params?: Record<string, any>): Record<string, any>;
  free(): void;
}

export interface SqlJsPreparable {
  prepare(sql: string): SqlJsSafeStatement;
}

/**
 * Run `use` against a prepared statement, guaranteeing free() afterwards.
 * Escape hatch for shapes the query helpers below don't cover (e.g. row
 * iteration) — never call db.prepare() directly.
 */
export function withStatement<T>(
  db: SqlJsPreparable,
  sql: string,
  use: (stmt: SqlJsSafeStatement) => T
): T {
  const stmt = db.prepare(sql);
  try {
    return use(stmt);
  } finally {
    stmt.free();
  }
}

/**
 * prepare → bind? → step → getAsObject → free.
 * step() is deliberately not checked: a no-match query returns whatever
 * getAsObject() yields ({} in sql.js), matching the legacy call sites.
 */
export function queryFirstRow(
  db: SqlJsPreparable,
  sql: string,
  params?: unknown[]
): Record<string, any> {
  return withStatement(db, sql, (stmt) => {
    if (params) stmt.bind(params);
    stmt.step();
    return stmt.getAsObject();
  });
}

/**
 * First column of the first row, or undefined when the query matches no row.
 * (A matched row holding SQL NULL yields null — distinguishable from undefined.)
 */
export function queryFirstValue(db: SqlJsPreparable, sql: string, params?: unknown[]): unknown {
  return withStatement(db, sql, (stmt) => {
    if (params) stmt.bind(params);
    return stmt.step() ? stmt.get()[0] : undefined;
  });
}
