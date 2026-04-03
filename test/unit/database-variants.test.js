/**
 * Database variant CRUD tests
 *
 * Tests the variant-specific methods: addVariant, getVariants,
 * deleteVariants, hasVariant, and cascade behaviors.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const sf = (text) => `'${text}'`;
const generateUUID = () => {
  let d = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x7) | 0x8).toString(16);
  });
};

const FIXTURES = join(__dirname, '..', 'fixtures', 'icons');
const svgContent = (name) => readFileSync(join(FIXTURES, name), 'utf-8');

// Minimal TestDatabase that mirrors production schema including variant columns
class TestDatabase {
  constructor(SQL) { this.SQL = SQL; this.db = null; this.dbInited = false; }

  initDatabases(data) {
    if (!this.dbInited) {
      this.dbInited = true;
      this.db = new this.SQL.Database(data);
    }
  }

  initNewProject() {
    this.db.run(`CREATE TABLE iconData (
      id varchar(255), iconCode varchar(255), iconName varchar(255),
      iconGroup varchar(255), iconSize int(255), iconType varchar(255),
      iconContent TEXT, iconContentOriginal TEXT,
      variantOf varchar(255) DEFAULT NULL, variantMeta TEXT DEFAULT NULL,
      createTime datetime DEFAULT CURRENT_TIMESTAMP,
      updateTime datetime DEFAULT CURRENT_TIMESTAMP
    )`);
    this.db.run(`CREATE TABLE groupData (
      id varchar(255), groupName varchar(255), groupOrder int(255),
      groupColor varchar(255),
      createTime datetime DEFAULT CURRENT_TIMESTAMP,
      updateTime datetime DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  insertIcon(overrides = {}) {
    const id = overrides.id || generateUUID();
    const code = overrides.iconCode || 'E000';
    const group = overrides.iconGroup || 'test-group';
    const content = overrides.iconContent || svgContent('heart.svg');
    this.db.run(
      `INSERT INTO iconData (id, iconCode, iconName, iconGroup, iconSize, iconType, iconContent, iconContentOriginal, variantOf, variantMeta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, overrides.iconName || 'test-icon', group, 512, 'svg', content, content,
       overrides.variantOf || null, overrides.variantMeta || null]
    );
    return id;
  }

  addVariant(parentId, iconName, variantMeta) {
    const id = generateUUID();
    const parent = this.db.exec(`SELECT * FROM iconData WHERE id = '${parentId}'`);
    if (!parent.length || !parent[0].values.length) throw new Error('Parent not found');
    const parentRow = parent[0].values[0];
    const parentGroup = parentRow[3]; // iconGroup column
    const content = parentRow[6]; // iconContent column
    this.db.run(
      `INSERT INTO iconData (id, iconCode, iconName, iconGroup, iconSize, iconType, iconContent, iconContentOriginal, variantOf, variantMeta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, 'E0FF', iconName, parentGroup, 512, 'svg', content, content, parentId, JSON.stringify(variantMeta)]
    );
    return id;
  }

  getVariants(parentId) {
    const result = this.db.exec(`SELECT * FROM iconData WHERE variantOf = '${parentId}'`);
    if (!result.length) return [];
    return result[0].values;
  }

  deleteVariants(parentId) {
    this.db.run(`DELETE FROM iconData WHERE variantOf = '${parentId}'`);
  }

  hasVariant(parentId, weight, scale) {
    const meta = JSON.stringify({ weight, scale });
    // Check by matching variantOf and parsing variantMeta
    const variants = this.getVariants(parentId);
    return variants.some((row) => {
      const m = JSON.parse(row[9]); // variantMeta column index
      return m && m.weight === weight && m.scale === scale;
    });
  }

  getIconCount() {
    return this.db.exec('SELECT COUNT(*) FROM iconData')[0].values[0][0];
  }

  getVariantCount(parentId) {
    return this.db.exec(`SELECT COUNT(*) FROM iconData WHERE variantOf = '${parentId}'`)[0].values[0][0];
  }

  moveIconAndVariants(iconId, newGroup) {
    this.db.run(`UPDATE iconData SET iconGroup = ? WHERE id = ? OR variantOf = ?`,
      [newGroup, iconId, iconId]);
  }

  deleteIconAndVariants(iconId) {
    this.db.run(`DELETE FROM iconData WHERE id = ? OR variantOf = ?`, [iconId, iconId]);
  }
}

let SQL;
let db;

beforeAll(async () => { SQL = await initSqlJs(); });

beforeEach(() => {
  db = new TestDatabase(SQL);
  db.initDatabases();
  db.initNewProject();
});

describe('variant schema', () => {
  test('iconData table has variantOf and variantMeta columns', () => {
    const cols = db.db.exec('PRAGMA table_info(iconData)')[0].values.map((r) => r[1]);
    expect(cols).toContain('variantOf');
    expect(cols).toContain('variantMeta');
  });

  test('variantOf defaults to NULL for normal icons', () => {
    const id = db.insertIcon({ iconName: 'normal' });
    const row = db.db.exec(`SELECT variantOf FROM iconData WHERE id = '${id}'`)[0].values[0];
    expect(row[0]).toBeNull();
  });
});

describe('addVariant', () => {
  test('creates a variant linked to parent', () => {
    const parentId = db.insertIcon({ iconName: 'home', iconCode: 'E001' });
    const variantId = db.addVariant(parentId, 'home.bold', { weight: 'bold', scale: 'medium' });
    const variants = db.getVariants(parentId);
    expect(variants).toHaveLength(1);
    expect(variants[0][8]).toBe(parentId); // variantOf
  });

  test('variant inherits parent group', () => {
    const parentId = db.insertIcon({ iconName: 'star', iconGroup: 'my-group' });
    db.addVariant(parentId, 'star.thin', { weight: 'thin', scale: 'medium' });
    const variants = db.getVariants(parentId);
    expect(variants[0][3]).toBe('my-group'); // iconGroup
  });
});

describe('getVariants', () => {
  test('returns empty array for icon with no variants', () => {
    const id = db.insertIcon({ iconName: 'solo' });
    expect(db.getVariants(id)).toHaveLength(0);
  });

  test('returns all variants for parent', () => {
    const parentId = db.insertIcon({ iconName: 'home' });
    db.addVariant(parentId, 'home.bold', { weight: 'bold', scale: 'medium' });
    db.addVariant(parentId, 'home.thin', { weight: 'thin', scale: 'medium' });
    db.addVariant(parentId, 'home.bold.small', { weight: 'bold', scale: 'small' });
    expect(db.getVariants(parentId)).toHaveLength(3);
  });
});

describe('hasVariant', () => {
  test('returns false when no variant exists', () => {
    const id = db.insertIcon({ iconName: 'home' });
    expect(db.hasVariant(id, 'bold', 'medium')).toBe(false);
  });

  test('returns true when matching variant exists', () => {
    const id = db.insertIcon({ iconName: 'home' });
    db.addVariant(id, 'home.bold', { weight: 'bold', scale: 'medium' });
    expect(db.hasVariant(id, 'bold', 'medium')).toBe(true);
  });

  test('returns false for different weight', () => {
    const id = db.insertIcon({ iconName: 'home' });
    db.addVariant(id, 'home.bold', { weight: 'bold', scale: 'medium' });
    expect(db.hasVariant(id, 'thin', 'medium')).toBe(false);
  });
});

describe('deleteVariants (cascade)', () => {
  test('deletes all variants of parent', () => {
    const parentId = db.insertIcon({ iconName: 'home' });
    db.addVariant(parentId, 'home.bold', { weight: 'bold', scale: 'medium' });
    db.addVariant(parentId, 'home.thin', { weight: 'thin', scale: 'medium' });
    expect(db.getVariantCount(parentId)).toBe(2);
    db.deleteVariants(parentId);
    expect(db.getVariantCount(parentId)).toBe(0);
  });

  test('does not delete parent icon', () => {
    const parentId = db.insertIcon({ iconName: 'home' });
    db.addVariant(parentId, 'home.bold', { weight: 'bold', scale: 'medium' });
    db.deleteVariants(parentId);
    const count = db.db.exec(`SELECT COUNT(*) FROM iconData WHERE id = '${parentId}'`)[0].values[0][0];
    expect(count).toBe(1);
  });
});

describe('deleteIconAndVariants', () => {
  test('deletes parent and all variants', () => {
    const parentId = db.insertIcon({ iconName: 'home' });
    db.addVariant(parentId, 'home.bold', { weight: 'bold', scale: 'medium' });
    db.addVariant(parentId, 'home.thin', { weight: 'thin', scale: 'medium' });
    const before = db.getIconCount();
    db.deleteIconAndVariants(parentId);
    expect(db.getIconCount()).toBe(before - 3);
  });
});

describe('moveIconAndVariants', () => {
  test('moves parent and variants to new group', () => {
    const parentId = db.insertIcon({ iconName: 'home', iconGroup: 'group-a' });
    db.addVariant(parentId, 'home.bold', { weight: 'bold', scale: 'medium' });
    db.moveIconAndVariants(parentId, 'group-b');
    const rows = db.db.exec(`SELECT iconGroup FROM iconData WHERE id = '${parentId}' OR variantOf = '${parentId}'`)[0].values;
    rows.forEach((r) => expect(r[0]).toBe('group-b'));
  });
});

describe('schema migration (ALTER TABLE)', () => {
  test('old schema without variantOf can be migrated', () => {
    // Create a fresh DB with old schema (no variant columns)
    const oldDb = new TestDatabase(SQL);
    oldDb.initDatabases();
    oldDb.db.run(`CREATE TABLE iconData (
      id varchar(255), iconCode varchar(255), iconName varchar(255),
      iconGroup varchar(255), iconSize int(255), iconType varchar(255),
      iconContent TEXT, iconContentOriginal TEXT,
      createTime datetime DEFAULT CURRENT_TIMESTAMP,
      updateTime datetime DEFAULT CURRENT_TIMESTAMP
    )`);

    // Verify no variant columns
    let cols = oldDb.db.exec('PRAGMA table_info(iconData)')[0].values.map((r) => r[1]);
    expect(cols).not.toContain('variantOf');

    // Run migration
    oldDb.db.run('ALTER TABLE iconData ADD COLUMN variantOf varchar(255) DEFAULT NULL');
    oldDb.db.run('ALTER TABLE iconData ADD COLUMN variantMeta TEXT DEFAULT NULL');

    // Verify columns exist
    cols = oldDb.db.exec('PRAGMA table_info(iconData)')[0].values.map((r) => r[1]);
    expect(cols).toContain('variantOf');
    expect(cols).toContain('variantMeta');

    // Verify old data still works (insert without variant columns)
    oldDb.db.run(
      `INSERT INTO iconData (id, iconCode, iconName, iconGroup, iconSize, iconType, iconContent, iconContentOriginal)
       VALUES ('test', 'E000', 'test', 'g1', 100, 'svg', '<svg></svg>', '<svg></svg>')`
    );
    const row = oldDb.db.exec("SELECT variantOf FROM iconData WHERE id = 'test'")[0].values[0];
    expect(row[0]).toBeNull();
  });
});
