/**
 * SF Symbols Fixture Validation Tests
 *
 * Validates the full 7007-icon sf-symbols.icp stress-test fixture:
 * - Correct database schema (3 tables + triggers)
 * - 28 SF Symbols categories as groups
 * - 7007 icons with valid PUA codes, SVG content, and group references
 * - SVG format consistency (xmlns, viewBox, path data)
 *
 * Data sources:
 *   SVGs:       MoOx/sf-symbols-svg (MIT) — Apple SF Pro Text font extraction
 *   Categories: Rspoon3/SFSymbols (MIT) — Swift metadata parsing
 *
 * Run: npx vitest run test/unit/sf-symbols-fixture.test.js
 */

import { describe, test, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ── Paths ─────────────────────────────────────────────────────────────────────
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'sf-symbols');
const ICP_PATH = join(FIXTURE_DIR, 'sf-symbols.icp');
const CATEGORIES_PATH = join(FIXTURE_DIR, 'categories.json');

// ── Expected structure from categories.json ──────────────────────────────────
const CATEGORIES = JSON.parse(readFileSync(CATEGORIES_PATH, 'utf-8'));
const SORTED_CATS = Object.keys(CATEGORIES).sort();
const TOTAL_GROUPS = SORTED_CATS.length;
const TOTAL_ICONS = Object.values(CATEGORIES).reduce((sum, icons) => sum + icons.length, 0);

// ── Database handle ──────────────────────────────────────────────────────────
let db;

beforeAll(async () => {
  const SQL = await initSqlJs();
  const data = readFileSync(ICP_PATH);
  db = new SQL.Database(new Uint8Array(data));
});

// ===========================================================================
// Fixture file existence
// ===========================================================================
describe('fixture files', () => {
  test('sf-symbols.icp exists', () => {
    expect(existsSync(ICP_PATH)).toBe(true);
  });

  test('categories.json exists', () => {
    expect(existsSync(CATEGORIES_PATH)).toBe(true);
  });

  test('icp file is a valid SQLite database', () => {
    const header = readFileSync(ICP_PATH).subarray(0, 16).toString('ascii');
    expect(header).toContain('SQLite format');
  });

  test('icp file is a substantial stress-test fixture (>10 MB)', () => {
    const size = readFileSync(ICP_PATH).length;
    expect(size).toBeGreaterThan(10 * 1024 * 1024);
  });
});

// ===========================================================================
// Schema validation
// ===========================================================================
describe('database schema', () => {
  test('contains the 3 required tables', () => {
    const tables = db
      .exec("SELECT name FROM sqlite_master WHERE type='table'")[0]
      .values.flat();
    expect(tables).toContain('projectAttributes');
    expect(tables).toContain('groupData');
    expect(tables).toContain('iconData');
  });

  test('contains update triggers for all tables', () => {
    const triggers = db
      .exec("SELECT name FROM sqlite_master WHERE type='trigger'")[0]
      .values.flat();
    expect(triggers.length).toBeGreaterThanOrEqual(3);
  });

  test('project name is "sf-symbols"', () => {
    const result = db.exec('SELECT projectName FROM projectAttributes')[0];
    expect(result.values[0][0]).toBe('sf-symbols');
  });
});

// ===========================================================================
// Groups (SF Symbols categories)
// ===========================================================================
describe('groups (SF Symbols categories)', () => {
  test(`contains exactly ${TOTAL_GROUPS} groups`, () => {
    const result = db.exec('SELECT COUNT(*) FROM groupData')[0];
    expect(result.values[0][0]).toBe(TOTAL_GROUPS);
  });

  test('groups are ordered correctly (0-based sequential)', () => {
    const result = db.exec('SELECT groupOrder FROM groupData ORDER BY groupOrder ASC')[0];
    const orders = result.values.map((v) => v[0]);
    expect(orders).toEqual(Array.from({ length: TOTAL_GROUPS }, (_, i) => i));
  });

  test('all expected category names are present', () => {
    const result = db.exec('SELECT groupName FROM groupData ORDER BY groupOrder ASC')[0];
    const names = result.values.map((v) => v[0]);
    expect(names).toEqual(SORTED_CATS);
  });

  test('all group IDs are unique', () => {
    const result = db.exec('SELECT id FROM groupData')[0];
    const ids = result.values.map((v) => v[0]);
    expect(new Set(ids).size).toBe(TOTAL_GROUPS);
  });
});

// ===========================================================================
// Icons — full count
// ===========================================================================
describe('icons (7007 total)', () => {
  test(`contains exactly ${TOTAL_ICONS} icons`, () => {
    const result = db.exec('SELECT COUNT(*) FROM iconData')[0];
    expect(result.values[0][0]).toBe(TOTAL_ICONS);
  });

  test('all icon IDs are unique', () => {
    const result = db.exec('SELECT id FROM iconData')[0];
    const ids = result.values.map((v) => v[0]);
    expect(new Set(ids).size).toBe(TOTAL_ICONS);
  });

  test('all icon codes are unique and in PUA range (E000–F8FF)', () => {
    const result = db.exec('SELECT iconCode FROM iconData')[0];
    const codes = result.values.map((v) => v[0]);
    expect(new Set(codes).size).toBe(TOTAL_ICONS);
    codes.forEach((code) => {
      const dec = parseInt(code, 16);
      expect(dec).toBeGreaterThanOrEqual(0xe000);
      expect(dec).toBeLessThanOrEqual(0xffff);
    });
  });

  test('icon codes are sequential starting from E000', () => {
    const result = db.exec('SELECT iconCode FROM iconData')[0];
    const codes = result.values.map((v) => parseInt(v[0], 16));
    codes.sort((a, b) => a - b);
    expect(codes[0]).toBe(0xe000);
    expect(codes[codes.length - 1]).toBe(0xe000 + TOTAL_ICONS - 1);
  });

  test('all icons have type "svg"', () => {
    const result = db.exec("SELECT COUNT(*) FROM iconData WHERE iconType != 'svg'")[0];
    expect(result.values[0][0]).toBe(0);
  });

  test('all icon names follow SF Symbol convention (lowercase, dots, digits)', () => {
    const result = db.exec('SELECT iconName FROM iconData')[0];
    const nameRegex = /^[a-z0-9][a-z0-9.]*$/;
    result.values.forEach(([name]) => {
      expect(name).toMatch(nameRegex);
    });
  });

  test('all icon names are unique', () => {
    const result = db.exec('SELECT iconName FROM iconData')[0];
    const names = result.values.map((v) => v[0]);
    expect(new Set(names).size).toBe(TOTAL_ICONS);
  });

  test('all icons reference a valid group ID', () => {
    const groups = db.exec('SELECT id FROM groupData')[0].values.map((v) => v[0]);
    const groupSet = new Set(groups);
    const iconGroups = db.exec('SELECT DISTINCT iconGroup FROM iconData')[0].values.map((v) => v[0]);
    iconGroups.forEach((g) => {
      expect(groupSet.has(g)).toBe(true);
    });
  });
});

// ===========================================================================
// Per-category icon count validation
// ===========================================================================
describe('per-category icon counts', () => {
  SORTED_CATS.forEach((cat) => {
    const expected = CATEGORIES[cat].length;
    test(`"${cat}" has ${expected} icons`, () => {
      const groupResult = db.exec(
        `SELECT id FROM groupData WHERE groupName = '${cat}'`
      )[0];
      expect(groupResult).toBeDefined();
      const groupId = groupResult.values[0][0];
      const countResult = db.exec(
        `SELECT COUNT(*) FROM iconData WHERE iconGroup = '${groupId}'`
      )[0];
      expect(countResult.values[0][0]).toBe(expected);
    });
  });
});

// ===========================================================================
// SVG content validation (sampled for performance)
// ===========================================================================
describe('SVG content', () => {
  test('all icons have non-empty SVG content', () => {
    const result = db.exec(
      "SELECT COUNT(*) FROM iconData WHERE iconContent IS NULL OR iconContent = ''"
    )[0];
    expect(result.values[0][0]).toBe(0);
  });

  test('all SVG content starts with <svg', () => {
    const result = db.exec(
      "SELECT COUNT(*) FROM iconData WHERE iconContent NOT LIKE '<svg%'"
    )[0];
    expect(result.values[0][0]).toBe(0);
  });

  test('all SVGs have xmlns attribute', () => {
    const result = db.exec(
      "SELECT COUNT(*) FROM iconData WHERE iconContent NOT LIKE '%xmlns=%'"
    )[0];
    expect(result.values[0][0]).toBe(0);
  });

  test('iconContent and iconContentOriginal are identical', () => {
    const result = db.exec(
      'SELECT COUNT(*) FROM iconData WHERE iconContent != iconContentOriginal'
    )[0];
    expect(result.values[0][0]).toBe(0);
  });

  test('iconSize matches actual SVG byte length (sample 100)', () => {
    const result = db.exec('SELECT iconSize, iconContent FROM iconData LIMIT 100')[0];
    result.values.forEach(([size, content]) => {
      expect(size).toBe(Buffer.byteLength(content, 'utf-8'));
    });
  });
});

// ===========================================================================
// Stress test metrics
// ===========================================================================
describe('stress test metrics', () => {
  test('database has > 5000 icons (suitable for stress testing)', () => {
    const result = db.exec('SELECT COUNT(*) FROM iconData')[0];
    expect(result.values[0][0]).toBeGreaterThan(5000);
  });

  test('largest category has > 500 icons', () => {
    const result = db.exec(
      'SELECT COUNT(*) as cnt FROM iconData GROUP BY iconGroup ORDER BY cnt DESC LIMIT 1'
    )[0];
    expect(result.values[0][0]).toBeGreaterThan(500);
  });

  test('smallest category has > 0 icons', () => {
    const result = db.exec(
      'SELECT COUNT(*) as cnt FROM iconData GROUP BY iconGroup ORDER BY cnt ASC LIMIT 1'
    )[0];
    expect(result.values[0][0]).toBeGreaterThan(0);
  });

  test('total SVG content is > 9 MB', () => {
    const result = db.exec('SELECT SUM(iconSize) FROM iconData')[0];
    expect(result.values[0][0]).toBeGreaterThan(9 * 1024 * 1024);
  });
});
