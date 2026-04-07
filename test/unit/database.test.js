/**
 * Database module unit tests
 *
 * Tests the sql.js-backed Database class used by Bobcorn for icon/group
 * management. Each test gets a freshly-initialised in-memory database via
 * beforeEach so there is no cross-test contamination.
 *
 * The Database class is instantiated directly (not via the module's singleton)
 * so we avoid side-effects like `window.db` assignment.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import initSqlJs from 'sql.js/dist/sql-asm.js';

// ---------------------------------------------------------------------------
// Helpers re-exported by the app (duplicated here to avoid import.meta.env
// issues that arise from importing the app module directly in a Node env)
// ---------------------------------------------------------------------------

/** Wrap a value in SQL single-quotes */
const sf = (text) => `'${text}'`;

/** hex string -> decimal */
const hexToDec = (h) => parseInt(h, 16);

/** decimal -> uppercase hex string */
const decToHex = (d) => d.toString(16).toUpperCase();

/** Simple UUID generator (same algorithm as src/renderer/utils/tools) */
const generateUUID = () => {
  let d = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x7) | 0x8).toString(16);
  });
};

// Unicode range constants (mirrors src/renderer/config)
const PUBLIC_RANGE_DEC_MIN = 57344;
const PUBLIC_RANGE_DEC_MAX = 63743;
const PUBLIC_RANGE_HEX_MIN = 'E000';
const PUBLIC_RANGE_DEC_LIST = Array.from({ length: 6399 }, (_, i) => i + 57344);

// Table names (mirrors database/index.js)
const T_PROJECT = 'projectAttributes';
const T_GROUP = 'groupData';
const T_ICON = 'iconData';

// Inline fixture SVGs (no external file dependency)
const INLINE_SVGS = {
  'heart.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  'home.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
  'search.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
  'settings.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z"/></svg>',
  'star.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
};
const svgContent = (name) => INLINE_SVGS[name];

// ---------------------------------------------------------------------------
// Lightweight Database wrapper that mirrors the real class but can run in
// a plain Node / Vitest environment (no Electron, no DOMParser).
//
// We import the real Database class indirectly: the source file has
// `import.meta.env` references and browser-only deps (SVG / DOMParser).
// Instead we replicate the class's SQL logic so we test it faithfully while
// keeping setup simple.
//
// A better long-term approach would be to make the class importable in Node;
// for now this test-double shares **identical SQL** with the production code.
// ---------------------------------------------------------------------------

class TestDatabase {
  constructor(SQL) {
    this.SQL = SQL;
    this.db = null;
    this.dbInited = false;
  }

  // -- low-level helpers (copied verbatim from src/renderer/database/index.js) ------

  buildDataSTMT(dataSet, options) {
    let defaultOptions = { needName: true, needData: true, equal: true };
    options = Object.assign(defaultOptions, options);
    let dataSTMT = '';
    let dataSetLastIndex = Object.keys(dataSet).length - 1;
    if (!options.equal) {
      Object.keys(dataSet).forEach((colName, index) => {
        const colData = dataSet[colName];
        if (index !== dataSetLastIndex) {
          dataSTMT += `${colName} <> ${colData}, `;
        } else {
          dataSTMT += `${colName} <> ${colData}`;
        }
      });
    } else if (options.needName && options.needData) {
      Object.keys(dataSet).forEach((colName, index) => {
        const colData = dataSet[colName];
        if (index !== dataSetLastIndex) {
          dataSTMT += `${colName} = ${colData}, `;
        } else {
          dataSTMT += `${colName} = ${colData}`;
        }
      });
    } else if (!options.needName && options.needData) {
      dataSTMT += '(';
      Object.keys(dataSet).forEach((colName, index) => {
        const colData = dataSet[colName];
        if (index !== dataSetLastIndex) {
          dataSTMT += `${colData}, `;
        } else {
          dataSTMT += `${colData})`;
        }
      });
    } else if (options.needName && !options.needData) {
      dataSTMT += '(';
      Object.keys(dataSet).forEach((colName, index) => {
        if (index !== dataSetLastIndex) {
          dataSTMT += `${colName}, `;
        } else {
          dataSTMT += `${colName})`;
        }
      });
    }
    return dataSTMT;
  }

  initDatabases(data) {
    if (!this.dbInited) {
      this.dbInited = true;
      this.db = new this.SQL.Database(data);
      if (data) {
        const cols = this.db.exec(`PRAGMA table_info(${T_ICON})`);
        const hasFavCol = cols.length > 0 && cols[0].values.some((row) => row[1] === 'isFavorite');
        if (!hasFavCol) {
          this.db.run(`ALTER TABLE ${T_ICON} ADD COLUMN isFavorite INTEGER DEFAULT 0`);
        }
      }
    }
  }

  addDataToTable(tableName, dataSet, callback) {
    this.db.run(
      `INSERT INTO ${tableName} ${this.buildDataSTMT(dataSet, { needData: false })} VALUES ${this.buildDataSTMT(dataSet, { needName: false })}`,
    );
    callback && callback();
  }

  setDataOfTable(tableName, targetDataSet, dataSet, callback) {
    this.db.run(
      `UPDATE ${tableName} SET ${this.buildDataSTMT(dataSet)} WHERE ${this.buildDataSTMT(targetDataSet)}`,
    );
    callback && callback();
  }

  getDataOfTable(tableName, targetDataSet, options) {
    let defaultOptions = { single: false, where: false, equal: true };
    options = Object.assign(defaultOptions, options);
    let res = null;
    if (options.single) {
      if (options.where) {
        const stmt = this.db.prepare(
          `SELECT * FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet, { equal: options.equal })}`,
        );
        stmt.step();
        res = stmt.getAsObject();
      } else {
        const stmt = this.db.prepare(`SELECT * FROM ${tableName}`);
        stmt.step();
        res = stmt.getAsObject();
      }
    } else {
      const query = options.where
        ? `SELECT * FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet, { equal: options.equal })}`
        : `SELECT * FROM ${tableName}`;
      const rawData = this.db.exec(query);
      if (rawData.length !== 0) {
        const colNameList = rawData[0].columns;
        res = rawData[0].values.map((row) => {
          const rowData = {};
          row.forEach((colData, index) => {
            rowData[colNameList[index]] = colData;
          });
          return rowData;
        });
      }
    }
    return res;
  }

  delDataOfTable(tableName, targetDataSet, options, callback) {
    let defaultOptions = { all: false };
    options = Object.assign(defaultOptions, options);
    if (options.all) {
      this.db.exec(`DELETE FROM ${tableName}`);
    } else {
      this.db.exec(
        `DELETE FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet)}`,
      );
    }
    callback && callback();
  }

  getDataCountsOfTable(tableName, targetDataSet) {
    const query = targetDataSet
      ? `SELECT COUNT(*) FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet)}`
      : `SELECT COUNT(*) FROM ${tableName}`;
    const stmt = this.db.prepare(query);
    stmt.step();
    return stmt.getAsObject()['COUNT(*)'];
  }

  destroyDatabase() {
    this.dbInited = false;
    this.db = null;
  }

  // -- project-level -------------------------------------------------------

  initNewProject(projectName) {
    this.db.run(
      `CREATE TABLE ${T_PROJECT} (id varchar(255), projectName varchar(255), createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`,
    );
    this.db.run(
      `CREATE TRIGGER projectAttributesTimeRenewTrigger AFTER UPDATE ON ${T_PROJECT} FOR EACH ROW BEGIN UPDATE ${T_PROJECT} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`,
    );
    this.db.run(
      `INSERT INTO ${T_PROJECT} (id, projectName) VALUES ('projectAttributes', ${projectName ? sf(projectName) : sf('iconfont')})`,
    );

    this.db.run(
      `CREATE TABLE ${T_GROUP} (id varchar(255), groupName varchar(255), groupOrder int(255), groupColor varchar(255), groupIcon TEXT, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`,
    );
    this.db.run(
      `CREATE TRIGGER groupDataTimeRenewTrigger AFTER UPDATE ON ${T_GROUP} FOR EACH ROW BEGIN UPDATE ${T_GROUP} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`,
    );

    this.db.run(
      `CREATE TABLE ${T_ICON} (id varchar(255), iconCode varchar(255), iconName varchar(255), iconGroup varchar(255), iconSize int(255), iconType varchar(255), iconContent TEXT, isFavorite INTEGER DEFAULT 0, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`,
    );
    this.db.run(
      `CREATE TRIGGER iconDataTimeRenewTrigger AFTER UPDATE ON ${T_ICON} FOR EACH ROW BEGIN UPDATE ${T_ICON} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`,
    );

    // Cleanup triggers: auto-NULL groupIcon when referenced icon is deleted or moved out
    this.db.run(
      `CREATE TRIGGER cleanupGroupIconOnDelete AFTER DELETE ON ${T_ICON} FOR EACH ROW BEGIN UPDATE ${T_GROUP} SET groupIcon = NULL WHERE groupIcon = OLD.id; END`,
    );
    this.db.run(
      `CREATE TRIGGER cleanupGroupIconOnMove AFTER UPDATE OF iconGroup ON ${T_ICON} WHEN OLD.iconGroup != NEW.iconGroup BEGIN UPDATE ${T_GROUP} SET groupIcon = NULL WHERE groupIcon = OLD.id AND id = OLD.iconGroup; END`,
    );
  }

  resetProject(projectName) {
    this.destroyDatabase();
    this.initDatabases();
    this.initNewProject(projectName);
  }

  exportProject(callback) {
    callback && callback(this.db.export());
  }

  initNewProjectFromData(data) {
    this.destroyDatabase();
    this.initDatabases(data);
  }

  migrateGroupIconCleanup() {
    const cols = this.db.exec(`PRAGMA table_info(${T_GROUP})`);
    const has = cols.length > 0 && cols[0].values.some((row) => row[1] === 'groupIcon');
    if (!has) {
      this.db.run(`ALTER TABLE ${T_GROUP} ADD COLUMN groupIcon TEXT`);
    }
    // Repair orphaned references
    this.db.run(
      `UPDATE ${T_GROUP} SET groupIcon = NULL WHERE groupIcon IS NOT NULL AND groupIcon NOT IN (SELECT id FROM ${T_ICON})`,
    );
  }

  // -- project attributes ---------------------------------------------------

  setProjectAttributes(dataSet, callback) {
    const targetDataSet = { id: sf('projectAttributes') };
    this.setDataOfTable(T_PROJECT, targetDataSet, dataSet, callback);
  }

  getProjectAttributes(rowName) {
    const targetDataSet = { id: sf('projectAttributes') };
    return this.getDataOfTable(T_PROJECT, targetDataSet, { single: true, where: true })[rowName];
  }

  setProjectName(projectName, callback) {
    const dataSet = { projectName: sf(projectName) };
    this.setProjectAttributes(dataSet, callback);
  }

  getProjectName() {
    return this.getProjectAttributes('projectName');
  }

  // -- groups ---------------------------------------------------------------

  addGroup(name, callback) {
    const id = generateUUID();
    const groupOrder = this.getDataCountsOfTable(T_GROUP);
    this.addDataToTable(T_GROUP, {
      id: sf(id),
      groupName: sf(name),
      groupOrder,
    });
    callback &&
      callback({
        id,
        groupName: name,
        groupOrder,
      });
  }

  getGroupList() {
    return this.getDataOfTable(T_GROUP) || [];
  }

  getGroupData(id) {
    const targetDataSet = { id: sf(id) };
    return this.getDataOfTable(T_GROUP, targetDataSet, { single: true, where: true });
  }

  setGroupName(id, groupName, callback) {
    const dataSet = { groupName: sf(groupName) };
    const targetDataSet = { id: sf(id) };
    this.setDataOfTable(T_GROUP, targetDataSet, dataSet, callback);
  }

  getGroupName(id) {
    if (id === 'resource-all') return '全部';
    if (id === 'resource-uncategorized') return '未分类';
    if (id === 'resource-deleted') return '已删除';
    return this.getGroupData(id).groupName;
  }

  delGroup(id, callback) {
    const iconsOnGroup = this.getIconListFromGroup(id);
    iconsOnGroup.forEach((icon) => this.delIcon(icon.id));
    const targetDataSet = { id: sf(id) };
    this.delDataOfTable(T_GROUP, targetDataSet, { all: false }, callback);
  }

  // -- icons ----------------------------------------------------------------

  /** Insert a raw icon row (test-friendly, no file-system / DOMParser) */
  addIconRaw(dataSet, callback) {
    this.addDataToTable(T_ICON, dataSet, callback);
  }

  getIconData(id) {
    const targetDataSet = { id: sf(id) };
    return this.getDataOfTable(T_ICON, targetDataSet, { single: true, where: true });
  }

  setIconData(id, dataSet, callback) {
    const targetDataSet = { id: sf(id) };
    this.setDataOfTable(T_ICON, targetDataSet, dataSet, callback);
  }

  getIconCount() {
    return this.getDataCountsOfTable(T_ICON);
  }

  getIconCountFromGroup(targetGroup) {
    const targetDataSet = { iconGroup: sf(targetGroup) };
    return this.getDataCountsOfTable(T_ICON, targetDataSet);
  }

  getIconList() {
    const targetDataSet = { iconGroup: sf('resource-deleted') };
    return this.getDataOfTable(T_ICON, targetDataSet, { where: true, equal: false }) || [];
  }

  getIconListFromGroup(targetGroup) {
    if (typeof targetGroup === 'string') {
      if (targetGroup === 'resource-all') {
        return this.getDataOfTable(T_ICON) || [];
      }
      const targetDataSet = { iconGroup: sf(targetGroup) };
      return this.getDataOfTable(T_ICON, targetDataSet, { where: true }) || [];
    } else if (Array.isArray(targetGroup)) {
      let iconList = [];
      targetGroup.forEach((id) => {
        const targetDataSet = { iconGroup: sf(id) };
        const icons = this.getDataOfTable(T_ICON, targetDataSet, { where: true }) || [];
        iconList = iconList.concat(icons);
      });
      return iconList;
    }
  }

  setIconName(id, iconName, callback) {
    const dataSet = { iconName: sf(iconName) };
    this.setIconData(id, dataSet, callback);
  }

  setIconCode(id, newIconCode, callback) {
    const dataSet = { iconCode: sf(newIconCode).toUpperCase() };
    this.setIconData(id, dataSet, callback);
  }

  delIcon(id, callback) {
    const targetDataSet = { id: sf(id) };
    this.delDataOfTable(T_ICON, targetDataSet, { all: false }, callback);
  }

  moveIconGroup(id, targetGroup, callback) {
    const targetDataSet = { id: sf(id) };
    const dataSet = {
      iconGroup: sf(targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup),
    };
    this.setDataOfTable(T_ICON, targetDataSet, dataSet, callback);
  }

  duplicateIconGroup(id, targetGroup, callback) {
    const sourceIconData = this.getIconData(id);
    const dataSet = {
      id: sf(generateUUID()),
      iconCode: sf(this.getNewIconCode()),
      iconName: sf(sourceIconData.iconName),
      iconGroup: sf(targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup),
      iconSize: sourceIconData.iconSize,
      iconType: sf(sourceIconData.iconType),
      iconContent: sf(sourceIconData.iconContent),
    };
    this.addDataToTable(T_ICON, dataSet, callback);
  }

  getNewIconCode(type, test) {
    const rawData = this.db.exec(`SELECT iconCode from ${T_ICON}`);
    if (rawData.length) {
      const usedIconCodeList = rawData[0].values.map((code) => code[0]);
      const unusedIconCodeList = PUBLIC_RANGE_DEC_LIST.concat();
      usedIconCodeList.forEach((code) =>
        unusedIconCodeList.splice(unusedIconCodeList.indexOf(hexToDec(code)), 1),
      );
      const newIconCode = type === 'dec' ? unusedIconCodeList[0] : decToHex(unusedIconCodeList[0]);
      !test && unusedIconCodeList.splice(0, 1);
      return newIconCode;
    } else {
      return type === 'dec' ? PUBLIC_RANGE_DEC_MIN : PUBLIC_RANGE_HEX_MIN;
    }
  }

  iconCodeInRange(iconCode) {
    return (
      iconCode.length === 4 &&
      hexToDec(iconCode) >= PUBLIC_RANGE_DEC_MIN &&
      hexToDec(iconCode) <= PUBLIC_RANGE_DEC_MAX
    );
  }

  iconCodeCanUse(iconCode) {
    const targetDataSet = { iconCode: sf(iconCode).toUpperCase() };
    return !this.getDataOfTable(T_ICON, targetDataSet, { where: true }) && this.iconCodeInRange(iconCode);
  }

  setIconFavorite(id, isFavorite) {
    this.db.run(`UPDATE ${T_ICON} SET isFavorite = ? WHERE id = ?`, [isFavorite, id]);
  }

  setIconsFavorite(ids, isFavorite) {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db.run(
      `UPDATE ${T_ICON} SET isFavorite = ? WHERE id IN (${placeholders})`,
      [isFavorite, ...ids]
    );
  }

  getFavoriteIcons() {
    const rawData = this.db.exec(
      `SELECT * FROM ${T_ICON} WHERE isFavorite = 1 AND iconGroup != 'resource-deleted' AND iconGroup != 'resource-recycleBin'`
    );
    if (rawData.length === 0) return [];
    const colNameList = rawData[0].columns;
    return rawData[0].values.map((row) => {
      const rowData = {};
      row.forEach((colData, index) => { rowData[colNameList[index]] = colData; });
      return rowData;
    });
  }

  getFavoriteCount() {
    const stmt = this.db.prepare(
      `SELECT COUNT(*) FROM ${T_ICON} WHERE isFavorite = 1 AND iconGroup != 'resource-deleted' AND iconGroup != 'resource-recycleBin'`
    );
    stmt.step();
    return stmt.getAsObject()['COUNT(*)'];
  }
}

// ===========================================================================
// Test suite
// ===========================================================================

let SQL;
let db;

/** Helper: insert an icon row with sensible defaults */
function insertIcon(overrides = {}) {
  const id = overrides.id || generateUUID();
  const code = overrides.iconCode || db.getNewIconCode();
  const group = overrides.iconGroup || 'resource-uncategorized';
  const content = overrides.iconContent || svgContent('heart.svg');
  const dataSet = {
    id: sf(id),
    iconCode: sf(code),
    iconName: sf(overrides.iconName || 'test-icon'),
    iconGroup: sf(group),
    iconSize: overrides.iconSize || 512,
    iconType: sf(overrides.iconType || 'svg'),
    iconContent: sf(content),
  };
  db.addIconRaw(dataSet);
  return { id, iconCode: code, iconGroup: group };
}

// ---------------------------------------------------------------------------
// Global setup: load sql.js once (expensive WASM/ASM init)
// ---------------------------------------------------------------------------
beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  db = new TestDatabase(SQL);
  db.initDatabases();
  db.initNewProject();
});

// ===========================================================================
// async init (sql.js loading)
// ===========================================================================
describe('async init (sql.js WASM/ASM loading)', () => {
  test('SQL engine loads and exposes Database constructor', () => {
    expect(SQL).toBeDefined();
    expect(typeof SQL.Database).toBe('function');
  });

  test('a fresh Database instance can be initialised', () => {
    const fresh = new TestDatabase(SQL);
    fresh.initDatabases();
    fresh.initNewProject();
    expect(fresh.db).not.toBeNull();
    expect(fresh.dbInited).toBe(true);
  });

  test('initDatabases is idempotent (second call is a no-op)', () => {
    const fresh = new TestDatabase(SQL);
    fresh.initDatabases();
    const firstDb = fresh.db;
    fresh.initDatabases(); // should not create a second db
    expect(fresh.db).toBe(firstDb);
  });
});

// ===========================================================================
// initNewProject / resetProject
// ===========================================================================
describe('initNewProject / resetProject', () => {
  test('initNewProject creates the three tables', () => {
    const tables = db.db
      .exec("SELECT name FROM sqlite_master WHERE type='table'")[0]
      .values.flat();
    expect(tables).toContain(T_PROJECT);
    expect(tables).toContain(T_GROUP);
    expect(tables).toContain(T_ICON);
  });

  test('default project name is "iconfont"', () => {
    expect(db.getProjectName()).toBe('iconfont');
  });

  test('custom project name is stored', () => {
    const fresh = new TestDatabase(SQL);
    fresh.initDatabases();
    fresh.initNewProject('my-icons');
    expect(fresh.getProjectName()).toBe('my-icons');
  });

  test('resetProject clears all data and re-creates tables', () => {
    db.addGroup('g1');
    insertIcon();
    expect(db.getGroupList().length).toBe(1);
    expect(db.getIconCount()).toBe(1);

    db.resetProject('fresh');
    expect(db.getProjectName()).toBe('fresh');
    expect(db.getGroupList().length).toBe(0);
    expect(db.getIconCount()).toBe(0);
  });
});

// ===========================================================================
// addGroup / getGroupList / setGroupName / delGroup
// ===========================================================================
describe('addGroup / getGroupList / setGroupName / delGroup', () => {
  test('addGroup creates a group and returns it via callback', () => {
    let result;
    db.addGroup('Icons', (g) => { result = g; });
    expect(result).toBeDefined();
    expect(result.groupName).toBe('Icons');
    expect(result.groupOrder).toBe(0);
  });

  test('getGroupList returns all groups', () => {
    db.addGroup('A');
    db.addGroup('B');
    db.addGroup('C');
    const list = db.getGroupList();
    expect(list.length).toBe(3);
    expect(list.map((g) => g.groupName)).toEqual(['A', 'B', 'C']);
  });

  test('groupOrder increments correctly', () => {
    db.addGroup('First');
    db.addGroup('Second');
    const list = db.getGroupList();
    expect(list[0].groupOrder).toBe(0);
    expect(list[1].groupOrder).toBe(1);
  });

  test('setGroupName updates the name', () => {
    let groupId;
    db.addGroup('Old', (g) => { groupId = g.id; });
    db.setGroupName(groupId, 'New');
    expect(db.getGroupName(groupId)).toBe('New');
  });

  test('getGroupName returns virtual names for special ids', () => {
    expect(db.getGroupName('resource-all')).toBe('全部');
    expect(db.getGroupName('resource-uncategorized')).toBe('未分类');
    expect(db.getGroupName('resource-deleted')).toBe('已删除');
  });

  test('delGroup removes the group and its icons', () => {
    let groupId;
    db.addGroup('ToDelete', (g) => { groupId = g.id; });
    insertIcon({ iconGroup: groupId });
    insertIcon({ iconGroup: groupId });
    expect(db.getIconListFromGroup(groupId).length).toBe(2);

    db.delGroup(groupId);
    expect(db.getGroupList().length).toBe(0);
    // icons belonging to that group are also deleted
    expect(db.getIconCount()).toBe(0);
  });

  test('delGroup fires callback', () => {
    let groupId;
    db.addGroup('X', (g) => { groupId = g.id; });
    let called = false;
    db.delGroup(groupId, () => { called = true; });
    expect(called).toBe(true);
  });
});

// ===========================================================================
// addIcons (using raw insertion with fixture SVGs)
// ===========================================================================
describe('addIcons (raw insertion with fixture SVGs)', () => {
  test('insert a single icon', () => {
    const icon = insertIcon({ iconName: 'heart', iconContent: svgContent('heart.svg') });
    expect(db.getIconCount()).toBe(1);
    const data = db.getIconData(icon.id);
    expect(data.iconName).toBe('heart');
    expect(data.iconCode).toBe('E000');
  });

  test('insert multiple icons from different fixtures', () => {
    const files = ['heart.svg', 'home.svg', 'search.svg', 'settings.svg', 'star.svg'];
    const inserted = files.map((f) =>
      insertIcon({ iconName: f.replace('.svg', ''), iconContent: svgContent(f) }),
    );
    expect(db.getIconCount()).toBe(5);
    // Each gets a unique code
    const codes = inserted.map((i) => i.iconCode);
    expect(new Set(codes).size).toBe(5);
  });

  test('icon content is stored faithfully', () => {
    const raw = svgContent('star.svg');
    const icon = insertIcon({ iconContent: raw });
    const stored = db.getIconData(icon.id).iconContent;
    expect(stored).toBe(raw);
  });
});

// ===========================================================================
// getIconListFromGroup / getIconCount
// ===========================================================================
describe('getIconListFromGroup / getIconCount', () => {
  test('getIconListFromGroup with string group id', () => {
    let gId;
    db.addGroup('G1', (g) => { gId = g.id; });
    insertIcon({ iconGroup: gId, iconName: 'a' });
    insertIcon({ iconGroup: gId, iconName: 'b' });
    insertIcon({ iconGroup: 'resource-uncategorized', iconName: 'c' });

    const fromGroup = db.getIconListFromGroup(gId);
    expect(fromGroup.length).toBe(2);
  });

  test('getIconListFromGroup with "resource-all" returns all', () => {
    let gId;
    db.addGroup('G1', (g) => { gId = g.id; });
    insertIcon({ iconGroup: gId });
    insertIcon({ iconGroup: 'resource-uncategorized' });

    const all = db.getIconListFromGroup('resource-all');
    expect(all.length).toBe(2);
  });

  test('getIconListFromGroup with array of group ids', () => {
    let g1, g2;
    db.addGroup('G1', (g) => { g1 = g.id; });
    db.addGroup('G2', (g) => { g2 = g.id; });
    insertIcon({ iconGroup: g1 });
    insertIcon({ iconGroup: g1 });
    insertIcon({ iconGroup: g2 });

    const combined = db.getIconListFromGroup([g1, g2]);
    expect(combined.length).toBe(3);
  });

  test('getIconCount reflects total icon count', () => {
    expect(db.getIconCount()).toBe(0);
    insertIcon();
    insertIcon();
    expect(db.getIconCount()).toBe(2);
  });

  test('getIconCountFromGroup counts per-group', () => {
    let gId;
    db.addGroup('G1', (g) => { gId = g.id; });
    insertIcon({ iconGroup: gId });
    insertIcon({ iconGroup: gId });
    insertIcon({ iconGroup: 'resource-uncategorized' });

    expect(db.getIconCountFromGroup(gId)).toBe(2);
    expect(db.getIconCountFromGroup('resource-uncategorized')).toBe(1);
  });
});

// ===========================================================================
// getNewIconCode / iconCodeInRange / iconCodeCanUse
// ===========================================================================
describe('getNewIconCode / iconCodeInRange / iconCodeCanUse', () => {
  test('getNewIconCode returns E000 when no icons exist', () => {
    expect(db.getNewIconCode()).toBe('E000');
  });

  test('getNewIconCode returns decimal when type="dec"', () => {
    expect(db.getNewIconCode('dec')).toBe(57344);
  });

  test('getNewIconCode increments after an icon is inserted', () => {
    insertIcon(); // takes E000
    const next = db.getNewIconCode();
    expect(next).toBe('E001');
  });

  test('getNewIconCode with test=true does not consume the code', () => {
    const code1 = db.getNewIconCode(undefined, true);
    const code2 = db.getNewIconCode(undefined, true);
    // Both should return the same code because test=true means "don't consume"
    // NOTE: in the production code, the splice only modifies a local copy,
    // so this behaviour is consistent.
    expect(code1).toBe(code2);
  });

  test('iconCodeInRange accepts valid codes', () => {
    expect(db.iconCodeInRange('E000')).toBe(true);
    expect(db.iconCodeInRange('F8FF')).toBe(true);
    expect(db.iconCodeInRange('EA00')).toBe(true);
  });

  test('iconCodeInRange rejects out-of-range codes', () => {
    expect(db.iconCodeInRange('DFFF')).toBe(false); // below min
    expect(db.iconCodeInRange('F900')).toBe(false); // above max
    expect(db.iconCodeInRange('0000')).toBe(false);
  });

  test('iconCodeInRange rejects codes with wrong length', () => {
    expect(db.iconCodeInRange('E00')).toBe(false);   // 3 chars
    expect(db.iconCodeInRange('E0000')).toBe(false);  // 5 chars
  });

  test('iconCodeCanUse returns true for unused in-range code', () => {
    expect(db.iconCodeCanUse('E000')).toBe(true);
    expect(db.iconCodeCanUse('E500')).toBe(true);
  });

  test('iconCodeCanUse returns false for already-used code', () => {
    insertIcon({ iconCode: 'E000' });
    expect(db.iconCodeCanUse('E000')).toBe(false);
  });

  test('iconCodeCanUse returns false for out-of-range code', () => {
    expect(db.iconCodeCanUse('0001')).toBe(false);
    expect(db.iconCodeCanUse('FFFF')).toBe(false);
  });
});

// ===========================================================================
// moveIconGroup / duplicateIconGroup
// ===========================================================================
describe('moveIconGroup / duplicateIconGroup', () => {
  test('moveIconGroup changes the icon group', () => {
    let g1, g2;
    db.addGroup('Source', (g) => { g1 = g.id; });
    db.addGroup('Target', (g) => { g2 = g.id; });
    const icon = insertIcon({ iconGroup: g1 });

    db.moveIconGroup(icon.id, g2);
    const updated = db.getIconData(icon.id);
    expect(updated.iconGroup).toBe(g2);
  });

  test('moveIconGroup to "resource-all" redirects to "resource-uncategorized"', () => {
    let g1;
    db.addGroup('Source', (g) => { g1 = g.id; });
    const icon = insertIcon({ iconGroup: g1 });

    db.moveIconGroup(icon.id, 'resource-all');
    const updated = db.getIconData(icon.id);
    expect(updated.iconGroup).toBe('resource-uncategorized');
  });

  test('moveIconGroup fires callback', () => {
    const icon = insertIcon();
    let called = false;
    db.moveIconGroup(icon.id, 'resource-uncategorized', () => { called = true; });
    expect(called).toBe(true);
  });

  test('duplicateIconGroup creates a copy with new id and code', () => {
    let gId;
    db.addGroup('G', (g) => { gId = g.id; });
    const icon = insertIcon({ iconGroup: gId, iconName: 'original' });

    let duplicated;
    db.duplicateIconGroup(icon.id, gId, () => { duplicated = true; });
    expect(duplicated).toBe(true);
    expect(db.getIconCount()).toBe(2);

    const all = db.getIconListFromGroup(gId);
    expect(all.length).toBe(2);
    // Both should have the same name
    expect(all[0].iconName).toBe('original');
    expect(all[1].iconName).toBe('original');
    // But different ids and codes
    expect(all[0].id).not.toBe(all[1].id);
    expect(all[0].iconCode).not.toBe(all[1].iconCode);
  });

  test('duplicateIconGroup to "resource-all" redirects to "resource-uncategorized"', () => {
    const icon = insertIcon({ iconGroup: 'resource-uncategorized', iconName: 'dup-test' });
    db.duplicateIconGroup(icon.id, 'resource-all');

    // There should be 2 icons total now, both in resource-uncategorized
    const list = db.getIconListFromGroup('resource-uncategorized');
    expect(list.length).toBe(2);
  });
});

// ===========================================================================
// setIconName / setIconCode
// ===========================================================================
describe('setIconName / setIconCode', () => {
  test('setIconName updates the name', () => {
    const icon = insertIcon({ iconName: 'before' });
    db.setIconName(icon.id, 'after');
    expect(db.getIconData(icon.id).iconName).toBe('after');
  });

  test('setIconName fires callback', () => {
    const icon = insertIcon();
    let called = false;
    db.setIconName(icon.id, 'x', () => { called = true; });
    expect(called).toBe(true);
  });

  test('setIconCode updates the code (uppercase)', () => {
    const icon = insertIcon({ iconCode: 'E000' });
    db.setIconCode(icon.id, 'e100');
    // The production code wraps in sf() then calls .toUpperCase(), which
    // produces the SQL literal 'E100'. When read back, SQL strips the outer
    // quotes so the stored value is plain "E100".
    expect(db.getIconData(icon.id).iconCode).toBe('E100');
  });

  test('setIconCode fires callback', () => {
    const icon = insertIcon();
    let called = false;
    db.setIconCode(icon.id, 'E200', () => { called = true; });
    expect(called).toBe(true);
  });
});

// ===========================================================================
// exportProject / initNewProjectFromData
// ===========================================================================
describe('exportProject / initNewProjectFromData', () => {
  test('export and re-import preserves project data', () => {
    db.setProjectName('export-test');
    db.addGroup('ExportGroup');
    insertIcon({ iconName: 'exported-icon' });

    let exportedData;
    db.exportProject((data) => { exportedData = data; });
    expect(exportedData).toBeInstanceOf(Uint8Array);
    expect(exportedData.length).toBeGreaterThan(0);

    // Re-import into a fresh instance
    const db2 = new TestDatabase(SQL);
    db2.initNewProjectFromData(exportedData);

    expect(db2.getProjectName()).toBe('export-test');
    expect(db2.getGroupList().length).toBe(1);
    expect(db2.getGroupList()[0].groupName).toBe('ExportGroup');
    expect(db2.getIconCount()).toBe(1);
    expect(db2.getIconListFromGroup('resource-all')[0].iconName).toBe('exported-icon');
  });

  test('initNewProjectFromData destroys existing db first', () => {
    insertIcon();
    expect(db.getIconCount()).toBe(1);

    // Export a clean db
    const fresh = new TestDatabase(SQL);
    fresh.initDatabases();
    fresh.initNewProject('clean');
    let data;
    fresh.exportProject((d) => { data = d; });

    db.initNewProjectFromData(data);
    expect(db.getProjectName()).toBe('clean');
    expect(db.getIconCount()).toBe(0);
  });
});

// ===========================================================================
// buildDataSTMT (SQL generator)
// ===========================================================================
describe('buildDataSTMT (SQL generator)', () => {
  test('default: name=value pairs', () => {
    const result = db.buildDataSTMT({ a: 1, b: "'hello'" });
    expect(result).toBe("a = 1, b = 'hello'");
  });

  test('needName=false, needData=true: values in parens', () => {
    const result = db.buildDataSTMT({ a: 1, b: "'x'" }, { needName: false });
    expect(result).toBe("(1, 'x')");
  });

  test('needName=true, needData=false: column names in parens', () => {
    const result = db.buildDataSTMT({ colA: 1, colB: 2 }, { needData: false });
    expect(result).toBe('(colA, colB)');
  });

  test('equal=false: generates <> comparisons', () => {
    const result = db.buildDataSTMT({ x: 5 }, { equal: false });
    expect(result).toBe('x <> 5');
  });

  test('single key-value pair (no trailing comma)', () => {
    const result = db.buildDataSTMT({ only: "'val'" });
    expect(result).toBe("only = 'val'");
  });

  test('multiple keys preserve order', () => {
    const result = db.buildDataSTMT({ z: 3, a: 1, m: 2 }, { needData: false });
    expect(result).toBe('(z, a, m)');
  });
});

// ===========================================================================
// Edge cases
// ===========================================================================
describe('edge cases', () => {
  test('getGroupList on empty table returns []', () => {
    expect(db.getGroupList()).toEqual([]);
  });

  test('getIconListFromGroup on empty table returns []', () => {
    expect(db.getIconListFromGroup('resource-all')).toEqual([]);
    expect(db.getIconListFromGroup('nonexistent-id')).toEqual([]);
  });

  test('getIconList on empty table returns []', () => {
    expect(db.getIconList()).toEqual([]);
  });

  test('getIconCount on empty table returns 0', () => {
    expect(db.getIconCount()).toBe(0);
  });

  test('getIconCountFromGroup with nonexistent group returns 0', () => {
    expect(db.getIconCountFromGroup('no-such-group')).toBe(0);
  });

  test('delGroup with no icons does not error', () => {
    let gId;
    db.addGroup('Empty', (g) => { gId = g.id; });
    expect(() => db.delGroup(gId)).not.toThrow();
    expect(db.getGroupList().length).toBe(0);
  });

  test('getDataOfTable returns null for empty result sets', () => {
    const result = db.getDataOfTable(T_ICON);
    expect(result).toBeNull();
  });

  test('getDataOfTable with where returns null when no match', () => {
    const result = db.getDataOfTable(T_ICON, { id: sf('nonexistent') }, { where: true });
    expect(result).toBeNull();
  });

  test('destroyDatabase resets state', () => {
    db.destroyDatabase();
    expect(db.db).toBeNull();
    expect(db.dbInited).toBe(false);
  });

  test('project name can be updated', () => {
    db.setProjectName('updated');
    expect(db.getProjectName()).toBe('updated');
  });

  test('setProjectName fires callback', () => {
    let called = false;
    db.setProjectName('x', () => { called = true; });
    expect(called).toBe(true);
  });

  test('delIcon removes a single icon', () => {
    const icon1 = insertIcon({ iconName: 'keep' });
    const icon2 = insertIcon({ iconName: 'remove' });
    expect(db.getIconCount()).toBe(2);

    db.delIcon(icon2.id);
    expect(db.getIconCount()).toBe(1);
    expect(db.getIconData(icon1.id).iconName).toBe('keep');
  });

  test('multiple icons get sequential codes', () => {
    const codes = [];
    for (let i = 0; i < 5; i++) {
      const icon = insertIcon();
      codes.push(icon.iconCode);
    }
    expect(codes).toEqual(['E000', 'E001', 'E002', 'E003', 'E004']);
  });

  test('getIconList excludes resource-deleted group', () => {
    insertIcon({ iconGroup: 'resource-uncategorized', iconName: 'visible' });
    insertIcon({ iconGroup: 'resource-deleted', iconName: 'deleted' });
    const list = db.getIconList();
    expect(list.length).toBe(1);
    expect(list[0].iconName).toBe('visible');
  });
});

// ===========================================================================
// favorites
// ===========================================================================
describe('favorites', () => {
  test('new icons have isFavorite = 0 by default', () => {
    const { id } = insertIcon({ id: 'fav-test-1', iconName: 'TestIcon' });
    const icon = db.getIconData(id);
    expect(icon.isFavorite).toBe(0);
  });

  test('setIconFavorite sets isFavorite to 1', () => {
    const { id } = insertIcon({ id: 'fav-test-2', iconName: 'TestIcon2' });
    db.setIconFavorite(id, 1);
    const icon = db.getIconData(id);
    expect(icon.isFavorite).toBe(1);
  });

  test('setIconFavorite sets isFavorite back to 0', () => {
    const { id } = insertIcon({ id: 'fav-test-3', iconName: 'TestIcon3' });
    db.setIconFavorite(id, 1);
    db.setIconFavorite(id, 0);
    const icon = db.getIconData(id);
    expect(icon.isFavorite).toBe(0);
  });

  test('setIconsFavorite batch-sets multiple icons', () => {
    const i1 = insertIcon({ id: 'fav-batch-1', iconName: 'B1' });
    const i2 = insertIcon({ id: 'fav-batch-2', iconName: 'B2' });
    insertIcon({ id: 'fav-batch-3', iconName: 'B3' });
    db.setIconsFavorite([i1.id, i2.id], 1);
    expect(db.getFavoriteCount()).toBe(2);
    expect(db.getFavoriteIcons().length).toBe(2);
  });

  test('getFavoriteIcons excludes recycleBin icons', () => {
    const { id } = insertIcon({ id: 'fav-del-1', iconName: 'Del1' });
    db.setIconFavorite(id, 1);
    expect(db.getFavoriteCount()).toBe(1);
    db.setIconData(id, { iconGroup: sf('resource-recycleBin') });
    expect(db.getFavoriteCount()).toBe(0);
    expect(db.getFavoriteIcons().length).toBe(0);
  });

  test('getFavoriteCount returns 0 on empty project', () => {
    expect(db.getFavoriteCount()).toBe(0);
  });

  test('getFavoriteIcons excludes resource-deleted icons', () => {
    const { id } = insertIcon({ id: 'fav-del-2', iconName: 'Del2' });
    db.setIconFavorite(id, 1);
    expect(db.getFavoriteCount()).toBe(1);
    db.setIconData(id, { iconGroup: sf('resource-deleted') });
    expect(db.getFavoriteCount()).toBe(0);
    expect(db.getFavoriteIcons().length).toBe(0);
  });

  test('setIconsFavorite batch-unfavorites icons', () => {
    const i1 = insertIcon({ id: 'fav-unbatch-1', iconName: 'U1' });
    const i2 = insertIcon({ id: 'fav-unbatch-2', iconName: 'U2' });
    db.setIconsFavorite([i1.id, i2.id], 1);
    expect(db.getFavoriteCount()).toBe(2);
    db.setIconsFavorite([i1.id, i2.id], 0);
    expect(db.getFavoriteCount()).toBe(0);
  });

  test('setIconFavorite is idempotent', () => {
    const { id } = insertIcon({ id: 'fav-idem-1', iconName: 'Idem' });
    db.setIconFavorite(id, 1);
    db.setIconFavorite(id, 1);
    expect(db.getFavoriteCount()).toBe(1);
  });

  test('delIcon removes icon from favorites', () => {
    const { id } = insertIcon({ id: 'fav-delicon-1', iconName: 'DelIcon' });
    db.setIconFavorite(id, 1);
    expect(db.getFavoriteCount()).toBe(1);
    db.delIcon(id);
    expect(db.getFavoriteCount()).toBe(0);
  });

  test('duplicateIconGroup does not inherit isFavorite', () => {
    const { id } = insertIcon({ id: 'fav-dup-1', iconName: 'DupSrc' });
    db.setIconFavorite(id, 1);
    db.duplicateIconGroup(id, 'resource-uncategorized');
    // Original is favorited, duplicate is not
    expect(db.getFavoriteCount()).toBe(1);
  });

  test('getFavoriteIcons returns objects with isFavorite field', () => {
    const { id } = insertIcon({ id: 'fav-shape-1', iconName: 'Shape' });
    db.setIconFavorite(id, 1);
    const favs = db.getFavoriteIcons();
    expect(favs.length).toBe(1);
    expect(favs[0].isFavorite).toBe(1);
    expect(favs[0].id).toBe(id);
    expect(favs[0].iconName).toBe('Shape');
  });

  test('isFavorite survives export/import round trip', () => {
    const { id } = insertIcon({ id: 'fav-rt-1', iconName: 'RoundTrip' });
    db.setIconFavorite(id, 1);
    expect(db.getFavoriteCount()).toBe(1);
    // Export and reimport
    let exported;
    db.exportProject((data) => { exported = data; });
    const newDb = new TestDatabase(SQL);
    newDb.initDatabases(exported);
    expect(newDb.getFavoriteCount()).toBe(1);
    const icon = newDb.getIconData(id);
    expect(icon.isFavorite).toBe(1);
  });

  test('migration adds isFavorite column to existing database', () => {
    const oldDb = new TestDatabase(SQL);
    oldDb.initDatabases();
    oldDb.db.run(
      `CREATE TABLE ${T_ICON} (id varchar(255), iconCode varchar(255), iconName varchar(255), iconGroup varchar(255), iconSize int(255), iconType varchar(255), iconContent TEXT, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
    );
    oldDb.db.run(`INSERT INTO ${T_ICON} (id, iconName) VALUES ('old-icon', 'OldIcon')`);
    const data = oldDb.db.export();
    const newDb = new TestDatabase(SQL);
    newDb.initDatabases(data);
    const icon = newDb.getDataOfTable(T_ICON, { id: sf('old-icon') }, { single: true, where: true });
    expect(icon.isFavorite).toBe(0);
  });
});

// ===========================================================================
// groupIcon cleanup triggers
// ===========================================================================
describe('groupIcon cleanup triggers', () => {
  test('deleting an icon NULLs groupIcon references', () => {
    let groupId;
    db.addGroup('G', (g) => { groupId = g.id; });
    const icon = insertIcon({ iconGroup: groupId });
    // Set groupIcon via raw SQL
    db.db.run(`UPDATE ${T_GROUP} SET groupIcon = '${icon.id}' WHERE id = '${groupId}'`);
    // Verify it was set
    const before = db.getGroupData(groupId);
    expect(before.groupIcon).toBe(icon.id);
    // Delete the icon — trigger should NULL the reference
    db.delIcon(icon.id);
    const after = db.getGroupData(groupId);
    expect(after.groupIcon).toBeNull();
  });

  test('moving icon to different group NULLs groupIcon in source group', () => {
    let groupA, groupB;
    db.addGroup('A', (g) => { groupA = g.id; });
    db.addGroup('B', (g) => { groupB = g.id; });
    const icon = insertIcon({ iconGroup: groupA });
    // Set groupA's groupIcon to this icon
    db.db.run(`UPDATE ${T_GROUP} SET groupIcon = '${icon.id}' WHERE id = '${groupA}'`);
    const before = db.getGroupData(groupA);
    expect(before.groupIcon).toBe(icon.id);
    // Move icon to groupB
    db.moveIconGroup(icon.id, groupB);
    const after = db.getGroupData(groupA);
    expect(after.groupIcon).toBeNull();
  });

  test('moving icon within same group keeps groupIcon', () => {
    let groupId;
    db.addGroup('G', (g) => { groupId = g.id; });
    const icon = insertIcon({ iconGroup: groupId });
    // Set groupIcon
    db.db.run(`UPDATE ${T_GROUP} SET groupIcon = '${icon.id}' WHERE id = '${groupId}'`);
    const before = db.getGroupData(groupId);
    expect(before.groupIcon).toBe(icon.id);
    // "Move" icon to the same group (trigger WHEN clause should skip)
    db.moveIconGroup(icon.id, groupId);
    const after = db.getGroupData(groupId);
    expect(after.groupIcon).toBe(icon.id);
  });

  test('migration repairs orphaned groupIcon references', () => {
    let groupId;
    db.addGroup('G', (g) => { groupId = g.id; });
    // Set groupIcon to a non-existent icon id via raw SQL
    db.db.run(`UPDATE ${T_GROUP} SET groupIcon = 'ghost-icon-id' WHERE id = '${groupId}'`);
    const before = db.getGroupData(groupId);
    expect(before.groupIcon).toBe('ghost-icon-id');
    // Run migration — should repair orphaned reference
    db.migrateGroupIconCleanup();
    const after = db.getGroupData(groupId);
    expect(after.groupIcon).toBeNull();
  });
});
