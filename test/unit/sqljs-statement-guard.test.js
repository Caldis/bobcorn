/**
 * sql.js Statement Guard
 *
 * sql.js prepared statements are handles to C-side sqlite3_stmt memory inside
 * the Emscripten heap — the JS garbage collector can NEVER reclaim them. Every
 * prepare() must be paired with free(), or the heap (fixed-size in the
 * sql-asm build we ship) leaks until SQLite dies with `Aborted(OOM)`.
 * This exact leak once crashed marquee selection: BatchPanel re-queried per
 * mousemove and thousands of un-freed statements exhausted the heap.
 *
 * Two mechanisms make the mistake unrepeatable:
 *
 *   1. NO RAW prepare() OUTSIDE THE SAFE WRAPPER
 *      The only file allowed to call `.prepare(` is
 *      src/core/database/safe-stmt.ts, whose helpers enclose the statement
 *      lifecycle in try/finally. All other code must go through
 *      queryFirstRow / queryFirstValue / withStatement.
 *
 *   2. WRAPPER BEHAVIOR PINNED
 *      Functional tests assert the wrapper frees the statement on every path
 *      (success AND exception), so the wrapper itself can't silently regress.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import {
  withStatement,
  queryFirstRow,
  queryFirstValue,
} from '../../src/core/database/safe-stmt';

const REPO_ROOT = join(__dirname, '../..');

/**
 * The ONLY file allowed to call db.prepare(). Do NOT add entries here to make
 * a red test pass — use the safe-stmt helpers instead. A new entry is only
 * justified for a second lifecycle-enclosing wrapper, with the reason in the PR.
 */
const ALLOWED_PREPARE_FILES = new Set(['src/core/database/safe-stmt.ts']);

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

// ---------------------------------------------------------------------------
// Mechanism 1 — static scan: no raw .prepare( outside safe-stmt
// ---------------------------------------------------------------------------

describe('sql.js statement guard', () => {
  test('no raw db.prepare() outside src/core/database/safe-stmt.ts', () => {
    const files = walk(join(REPO_ROOT, 'src'));
    const violations = [];

    for (const file of files) {
      const rel = relative(REPO_ROOT, file).replace(/\\/g, '/');
      if (ALLOWED_PREPARE_FILES.has(rel)) continue;
      const content = readFileSync(file, 'utf8');
      content.split('\n').forEach((line, i) => {
        const code = line.trimStart();
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
        if (/\.prepare\s*\(/.test(line)) {
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      violations,
      `Raw .prepare( call(s) found. Each un-freed sql.js statement leaks ` +
        `Emscripten heap memory until Aborted(OOM). Use queryFirstRow / ` +
        `queryFirstValue / withStatement from src/core/database/safe-stmt.ts ` +
        `instead — they enclose the statement lifecycle in try/finally:\n` +
        violations.join('\n'),
    ).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Mechanism 2 — wrapper behavior: free() guaranteed on every path
  // -------------------------------------------------------------------------

  /** Fake sql.js db whose statements record their lifecycle. */
  function makeFakeDb({ rows = [], stepThrows = false } = {}) {
    const statements = [];
    return {
      statements,
      prepare(sql) {
        let cursor = -1;
        const stmt = {
          sql,
          freed: false,
          boundParams: null,
          bind(params) {
            this.boundParams = params;
            return true;
          },
          step() {
            if (stepThrows) throw new Error('step exploded');
            cursor += 1;
            return cursor < rows.length;
          },
          get() {
            return rows[cursor] ?? [];
          },
          getAsObject() {
            const row = rows[cursor];
            if (!row) return {};
            const obj = {};
            row.forEach((val, i) => {
              obj[`col${i}`] = val;
            });
            return obj;
          },
          free() {
            this.freed = true;
          },
        };
        statements.push(stmt);
        return stmt;
      },
    };
  }

  test('withStatement frees the statement on success', () => {
    const db = makeFakeDb({ rows: [['a']] });
    const result = withStatement(db, 'SELECT 1', (stmt) => {
      stmt.step();
      return stmt.get()[0];
    });
    expect(result).toBe('a');
    expect(db.statements).toHaveLength(1);
    expect(db.statements[0].freed).toBe(true);
  });

  test('withStatement frees the statement when the callback throws', () => {
    const db = makeFakeDb();
    expect(() =>
      withStatement(db, 'SELECT 1', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.statements[0].freed).toBe(true);
  });

  test('queryFirstRow returns the first row, binds params, and frees', () => {
    const db = makeFakeDb({ rows: [['x', 2]] });
    const row = queryFirstRow(db, 'SELECT * FROM t WHERE id = ?', ['some-id']);
    expect(row).toEqual({ col0: 'x', col1: 2 });
    expect(db.statements[0].boundParams).toEqual(['some-id']);
    expect(db.statements[0].freed).toBe(true);
  });

  test('queryFirstRow returns {} on no match (legacy getAsObject shape) and frees', () => {
    const db = makeFakeDb({ rows: [] });
    expect(queryFirstRow(db, 'SELECT * FROM t')).toEqual({});
    expect(db.statements[0].freed).toBe(true);
  });

  test('queryFirstRow frees the statement when step() throws', () => {
    const db = makeFakeDb({ stepThrows: true });
    expect(() => queryFirstRow(db, 'SELECT * FROM t')).toThrow('step exploded');
    expect(db.statements[0].freed).toBe(true);
  });

  test('queryFirstValue returns the first column, or undefined on no match, and frees', () => {
    const hit = makeFakeDb({ rows: [['svg-content', 'extra']] });
    expect(queryFirstValue(hit, 'SELECT c FROM t WHERE id = ?', ['id'])).toBe('svg-content');
    expect(hit.statements[0].freed).toBe(true);

    const miss = makeFakeDb({ rows: [] });
    expect(queryFirstValue(miss, 'SELECT c FROM t WHERE id = ?', ['id'])).toBeUndefined();
    expect(miss.statements[0].freed).toBe(true);
  });
});
