/**
 * Renderer ↔ Core schema parity (Stage C 簇① 对拍守门)
 *
 * renderer 遗留 Database 的建表/迁移 SQL 已委托 core ProjectDb
 * (initSchema / runMigrations)。本测试把「委托前的旧 renderer SQL 路径」固化为
 * 字符串快照, 与 core 路径分别建库后对拍:
 *   1. 新建项目: 旧 initNewProject SQL 快照 vs core initSchema
 *   2. 打开旧版 .icp: 旧内联迁移 + migrateVariantColumns + ensureGroupIconColumn
 *      SQL 快照 vs core runMigrations
 *   3. 新建 schema 与迁移后 schema 的列集合收敛一致
 * 断言: PRAGMA table_info 全表列名/类型一致、triggers 清单一致、索引清单一致。
 *
 * 已知且有意接受的差异 (对象按列名取值, 列顺序无语义, 故按列名排序后比较):
 *   groupData 迁移列顺序 — 旧 renderer 路径: groupDescription → codeRangeStart →
 *   codeRangeEnd → groupIcon; core migrateGroupColumns: groupDescription →
 *   groupIcon → codeRangeStart → codeRangeEnd。
 */

import { describe, test, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { ProjectDb } from '../../src/core/database/project-db';

let SQL;
beforeAll(async () => {
  SQL = await initSqlJs();
});

// ---------------------------------------------------------------------------
// 快照 A — 委托前 renderer initNewProject 的建表 SQL (逐字摘自
// src/renderer/database/index.ts@2172f14, projectName='iconfont', displayName 空)
// ---------------------------------------------------------------------------

const RENDERER_FRESH_SQL = [
  `CREATE TABLE projectAttributes (id varchar(255), projectName varchar(255), displayName varchar(255), description TEXT, projectColor varchar(32), createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TRIGGER projectAttributesTimeRenewTrigger AFTER UPDATE ON projectAttributes FOR EACH ROW BEGIN UPDATE projectAttributes SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`,
  `INSERT INTO projectAttributes (id, projectName) VALUES ('projectAttributes', 'iconfont')`,
  `CREATE TABLE groupData (id varchar(255), groupName varchar(255), groupOrder int(255), groupColor varchar(255), groupDescription TEXT, groupIcon TEXT, codeRangeStart int, codeRangeEnd int, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TRIGGER groupDataTimeRenewTrigger AFTER UPDATE ON groupData FOR EACH ROW BEGIN UPDATE groupData SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`,
  `CREATE TABLE iconData (id varchar(255), iconCode varchar(255), iconName varchar(255), iconGroup varchar(255), iconSize int(255), iconType varchar(255), iconContent TEXT, iconContentOriginal TEXT, isFavorite INTEGER DEFAULT 0, variantOf varchar(255) DEFAULT NULL, variantMeta TEXT DEFAULT NULL, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TRIGGER iconDataTimeRenewTrigger AFTER UPDATE ON iconData FOR EACH ROW BEGIN UPDATE iconData SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`,
  `CREATE INDEX IF NOT EXISTS idx_iconData_variantOf ON iconData (variantOf)`,
  `CREATE TRIGGER cleanupGroupIconOnDelete AFTER DELETE ON iconData FOR EACH ROW BEGIN UPDATE groupData SET groupIcon = NULL WHERE groupIcon = OLD.id; END`,
  `CREATE TRIGGER cleanupGroupIconOnMove AFTER UPDATE OF iconGroup ON iconData WHEN OLD.iconGroup != NEW.iconGroup BEGIN UPDATE groupData SET groupIcon = NULL WHERE groupIcon = OLD.id AND id = OLD.iconGroup; END`,
];

// ---------------------------------------------------------------------------
// 快照 B — 旧版 .icp 基线 schema (无任何新列的最老形态)
// ---------------------------------------------------------------------------

const LEGACY_BASE_SQL = [
  `CREATE TABLE projectAttributes (id varchar(255), projectName varchar(255), createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TRIGGER projectAttributesTimeRenewTrigger AFTER UPDATE ON projectAttributes FOR EACH ROW BEGIN UPDATE projectAttributes SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`,
  `INSERT INTO projectAttributes (id, projectName) VALUES ('projectAttributes', 'iconfont')`,
  `CREATE TABLE groupData (id varchar(255), groupName varchar(255), groupOrder int(255), groupColor varchar(255), createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TRIGGER groupDataTimeRenewTrigger AFTER UPDATE ON groupData FOR EACH ROW BEGIN UPDATE groupData SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`,
  `CREATE TABLE iconData (id varchar(255), iconCode varchar(255), iconName varchar(255), iconGroup varchar(255), iconSize int(255), iconType varchar(255), iconContent TEXT, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TRIGGER iconDataTimeRenewTrigger AFTER UPDATE ON iconData FOR EACH ROW BEGIN UPDATE iconData SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`,
];

// ---------------------------------------------------------------------------
// 快照 C — 委托前 renderer 打开旧版 .icp 的迁移路径 (基线上所有列均缺失, 全部 ALTER
// 按旧代码顺序执行): initDatabases 内联块 → migrateVariantColumns → ensureGroupIconColumn
// ---------------------------------------------------------------------------

const RENDERER_LEGACY_MIGRATION_SQL = [
  // initDatabases 内联迁移块
  `ALTER TABLE iconData ADD COLUMN iconContentOriginal TEXT`,
  `ALTER TABLE groupData ADD COLUMN groupDescription TEXT`,
  `ALTER TABLE groupData ADD COLUMN codeRangeStart int`,
  `ALTER TABLE groupData ADD COLUMN codeRangeEnd int`,
  `ALTER TABLE iconData ADD COLUMN isFavorite INTEGER DEFAULT 0`,
  `ALTER TABLE projectAttributes ADD COLUMN displayName varchar(255)`,
  `ALTER TABLE projectAttributes ADD COLUMN description TEXT`,
  `ALTER TABLE projectAttributes ADD COLUMN projectColor varchar(32)`,
  // migrateVariantColumns
  `ALTER TABLE iconData ADD COLUMN variantOf varchar(255) DEFAULT NULL`,
  `ALTER TABLE iconData ADD COLUMN variantMeta TEXT DEFAULT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_iconData_variantOf ON iconData (variantOf)`,
  // ensureGroupIconColumn (codeRange* 已由内联块补齐, 旧代码此处按 PRAGMA 判断跳过)
  `ALTER TABLE groupData ADD COLUMN groupIcon TEXT`,
  `DROP TRIGGER IF EXISTS cleanupGroupIconOnDelete`,
  `CREATE TRIGGER cleanupGroupIconOnDelete AFTER DELETE ON iconData FOR EACH ROW BEGIN UPDATE groupData SET groupIcon = NULL WHERE groupIcon = OLD.id; END`,
  `DROP TRIGGER IF EXISTS cleanupGroupIconOnMove`,
  `CREATE TRIGGER cleanupGroupIconOnMove AFTER UPDATE OF iconGroup ON iconData WHEN OLD.iconGroup != NEW.iconGroup BEGIN UPDATE groupData SET groupIcon = NULL WHERE groupIcon = OLD.id AND id = OLD.iconGroup; END`,
  `UPDATE groupData SET groupIcon = NULL WHERE groupIcon IS NOT NULL AND groupIcon NOT IN (SELECT id FROM iconData)`,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TABLES = ['projectAttributes', 'groupData', 'iconData'];

function buildDb(statements) {
  const db = new SQL.Database();
  for (const sql of statements) db.run(sql);
  return db;
}

/** 列名 → { name, type, dflt } 清单, 按列名排序 (列顺序无语义 — 全部读取按列名取值) */
function tableInfo(db, table) {
  const res = db.exec(`PRAGMA table_info(${table})`);
  if (!res.length) return [];
  return res[0].values
    .map((r) => ({ name: r[1], type: r[2], dflt: r[4] ?? null }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

function triggerNames(db) {
  const res = db.exec(`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`);
  return res.length ? res[0].values.map((r) => r[0]) : [];
}

function indexNames(db) {
  const res = db.exec(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );
  return res.length ? res[0].values.map((r) => r[0]) : [];
}

function expectSchemaEqual(actualDb, expectedDb) {
  for (const table of TABLES) {
    expect(tableInfo(actualDb, table), `table_info(${table})`).toEqual(
      tableInfo(expectedDb, table)
    );
  }
  expect(triggerNames(actualDb), 'triggers').toEqual(triggerNames(expectedDb));
  expect(indexNames(actualDb), 'indexes').toEqual(indexNames(expectedDb));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderer ↔ core schema parity (Stage C 簇①)', () => {
  test('新建项目: core initSchema == 旧 renderer initNewProject SQL 快照', () => {
    const rendererDb = buildDb(RENDERER_FRESH_SQL);
    const coreRaw = new SQL.Database();
    new ProjectDb(coreRaw).initSchema('iconfont');

    expectSchemaEqual(coreRaw, rendererDb);

    // 初始行等价: id/projectName 写入一致, displayName 均为空
    const rendererRow = rendererDb.exec(
      `SELECT id, projectName, displayName FROM projectAttributes`
    )[0].values[0];
    const coreRow = coreRaw.exec(`SELECT id, projectName, displayName FROM projectAttributes`)[0]
      .values[0];
    expect(coreRow).toEqual(rendererRow);

    rendererDb.close();
    coreRaw.close();
  });

  test('打开旧版 .icp: core runMigrations == 旧 renderer 迁移路径 SQL 快照', () => {
    const rendererDb = buildDb([...LEGACY_BASE_SQL, ...RENDERER_LEGACY_MIGRATION_SQL]);
    const coreRaw = buildDb(LEGACY_BASE_SQL);
    new ProjectDb(coreRaw).runMigrations();

    expectSchemaEqual(coreRaw, rendererDb);

    rendererDb.close();
    coreRaw.close();
  });

  test('schema 收敛: core 新建 schema 与 core 迁移后 schema 列集合一致', () => {
    const freshRaw = new SQL.Database();
    new ProjectDb(freshRaw).initSchema('iconfont');
    const migratedRaw = buildDb(LEGACY_BASE_SQL);
    new ProjectDb(migratedRaw).runMigrations();

    for (const table of TABLES) {
      const freshCols = tableInfo(freshRaw, table).map((c) => `${c.name}:${c.type}`);
      const migratedCols = tableInfo(migratedRaw, table).map((c) => `${c.name}:${c.type}`);
      expect(migratedCols, `columns(${table})`).toEqual(freshCols);
    }
    expect(triggerNames(migratedRaw)).toEqual(triggerNames(freshRaw));
    expect(indexNames(migratedRaw)).toEqual(indexNames(freshRaw));

    freshRaw.close();
    migratedRaw.close();
  });

  test('迁移幂等: runMigrations 跑两遍不新增列/触发器', () => {
    const raw = buildDb(LEGACY_BASE_SQL);
    const projectDb = new ProjectDb(raw);
    projectDb.runMigrations();
    const after1 = {
      cols: TABLES.map((t) => tableInfo(raw, t)),
      triggers: triggerNames(raw),
      indexes: indexNames(raw),
    };
    projectDb.runMigrations();
    expect(TABLES.map((t) => tableInfo(raw, t))).toEqual(after1.cols);
    expect(triggerNames(raw)).toEqual(after1.triggers);
    expect(indexNames(raw)).toEqual(after1.indexes);
    raw.close();
  });
});
