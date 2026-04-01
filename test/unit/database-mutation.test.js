/**
 * Database mutation tracking tests
 *
 * Verifies that ALL C/U/D operations trigger the notifyMutation callback
 * through the 4 gate methods: addDataToTable, setDataOfTable, delDataOfTable, runMutation.
 *
 * Uses a MutationTrackingDatabase that extends the TestDatabase pattern from
 * database.test.js, adding the same mutation gate infrastructure as production.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import initSqlJs from 'sql.js/dist/sql-asm.js';

const sf = (text) => `'${text}'`;
const generateUUID = () => {
  let d = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x7) | 0x8).toString(16);
  });
};

const T_PROJECT = 'projectAttributes';
const T_GROUP = 'groupData';
const T_ICON = 'iconData';

// ---------------------------------------------------------------------------
// MutationTrackingDatabase — mirrors production Database's gate pattern
// ---------------------------------------------------------------------------

class MutationTrackingDatabase {
  constructor(SQL) {
    this.SQL = SQL;
    this.db = null;
    this.dbInited = false;
    // Mutation tracking — same as production
    this.onMutationCallback = null;
  }

  registerOnMutation(cb) { this.onMutationCallback = cb; }
  notifyMutation() { this.onMutationCallback?.(); }

  // ── 4 Gate Methods (same as production) ──────────────────────────

  addDataToTable(tableName, dataSet, callback) {
    const stmt = this.buildDataSTMT(dataSet, { needData: false });
    const vals = this.buildDataSTMT(dataSet, { needName: false });
    this.db.run(`INSERT INTO ${tableName} ${stmt} VALUES ${vals}`);
    this.notifyMutation();
    callback && callback();
  }

  setDataOfTable(tableName, targetDataSet, dataSet, callback) {
    this.db.run(
      `UPDATE ${tableName} SET ${this.buildDataSTMT(dataSet)} WHERE ${this.buildDataSTMT(targetDataSet)}`
    );
    this.notifyMutation();
    callback && callback();
  }

  delDataOfTable(tableName, targetDataSet, options, callback) {
    const opts = Object.assign({ all: false }, options);
    if (opts.all) {
      this.db.exec(`DELETE FROM ${tableName}`);
    } else {
      this.db.exec(`DELETE FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet)}`);
    }
    this.notifyMutation();
    callback && callback();
  }

  runMutation(sql, params) {
    if (params) this.db.run(sql, params);
    else this.db.run(sql);
    this.notifyMutation();
  }

  // ── Helpers ──────────────────────────────────────────────────────

  buildDataSTMT(dataSet, options) {
    let defaultOptions = { needName: true, needData: true, equal: true };
    options = Object.assign(defaultOptions, options);
    let dataSTMT = '';
    let keys = Object.keys(dataSet);
    let last = keys.length - 1;
    if (!options.equal) {
      keys.forEach((col, i) => { dataSTMT += `${col} <> ${dataSet[col]}${i < last ? ', ' : ''}`; });
    } else if (options.needName && options.needData) {
      keys.forEach((col, i) => { dataSTMT += `${col} = ${dataSet[col]}${i < last ? ', ' : ''}`; });
    } else if (!options.needName && options.needData) {
      dataSTMT = '(' + keys.map((col) => dataSet[col]).join(', ') + ')';
    } else if (options.needName && !options.needData) {
      dataSTMT = '(' + keys.join(', ') + ')';
    }
    return dataSTMT;
  }

  initDatabases(data) {
    if (!this.dbInited) {
      this.dbInited = true;
      this.db = new this.SQL.Database(data);
    }
  }

  destroyDatabase() {
    this.dbInited = false;
    this.db = null;
  }

  initNewProject(projectName) {
    this.db.run(`CREATE TABLE ${T_PROJECT} (id varchar(255), projectName varchar(255), createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`);
    this.db.run(`CREATE TABLE ${T_GROUP} (id varchar(255), groupName varchar(255), groupOrder int(255), groupColor varchar(255), createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`);
    this.db.run(`CREATE TABLE ${T_ICON} (id varchar(255), iconCode varchar(255), iconName varchar(255), iconGroup varchar(255), iconSize int(255), iconType varchar(255), iconContent TEXT, iconContentOriginal TEXT, isFavorite INTEGER DEFAULT 0, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`);
    // Insert default project row
    this.db.run(`INSERT INTO ${T_PROJECT} (id, projectName) VALUES ('projectAttributes', ${projectName ? sf(projectName) : sf('iconfont')})`);
  }

  resetProject(projectName) {
    this.destroyDatabase();
    this.initDatabases();
    this.initNewProject(projectName);
    // In production, initNewProject → addDataToTable is NOT used here (raw SQL),
    // so resetProject relies on the gate methods it calls internally.
  }

  getDataCountsOfTable(tableName, targetDataSet) {
    const query = targetDataSet
      ? `SELECT COUNT(*) FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet)}`
      : `SELECT COUNT(*) FROM ${tableName}`;
    const stmt = this.db.prepare(query);
    stmt.step();
    return stmt.getAsObject()['COUNT(*)'];
  }

  getDataOfTable(tableName, targetDataSet, options) {
    let opts = Object.assign({ single: false, where: false, equal: true }, options);
    if (opts.single) {
      const query = opts.where
        ? `SELECT * FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet, { equal: opts.equal })}`
        : `SELECT * FROM ${tableName}`;
      const stmt = this.db.prepare(query);
      stmt.step();
      return stmt.getAsObject();
    }
    const query = opts.where
      ? `SELECT * FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet, { equal: opts.equal })}`
      : `SELECT * FROM ${tableName}`;
    const rawData = this.db.exec(query);
    if (rawData.length === 0) return null;
    const cols = rawData[0].columns;
    return rawData[0].values.map((row) => {
      const obj = {};
      row.forEach((val, i) => { obj[cols[i]] = val; });
      return obj;
    });
  }

  // ── High-level methods (mirror production) ───────────────────────

  setProjectAttributes(dataSet, callback) {
    const target = { id: sf('projectAttributes') };
    this.setDataOfTable(T_PROJECT, target, dataSet, callback);
  }

  setProjectName(name, callback) {
    this.setProjectAttributes({ projectName: sf(name) }, callback);
  }

  addGroup(name, callback) {
    const id = generateUUID();
    const order = this.getDataCountsOfTable(T_GROUP);
    this.addDataToTable(T_GROUP, { id: sf(id), groupName: sf(name), groupOrder: order });
    callback && callback({ id, groupName: name, groupOrder: order });
  }

  setGroupData(id, dataSet, callback) {
    const target = { id: sf(id) };
    this.setDataOfTable(T_GROUP, target, dataSet, callback);
  }

  setGroupName(id, groupName, callback) {
    this.setGroupData(id, { groupName: sf(groupName) }, callback);
  }

  delGroup(id, callback) {
    // Move icons to uncategorized (raw SQL write → runMutation)
    this.runMutation(`UPDATE ${T_ICON} SET iconGroup = 'resource-uncategorized' WHERE iconGroup = ${sf(id)}`);
    const target = { id: sf(id) };
    this.delDataOfTable(T_GROUP, target, { all: false }, callback);
  }

  reorderGroups(orderedIds, callback) {
    orderedIds.forEach((id, index) => {
      this.runMutation(`UPDATE ${T_GROUP} SET groupOrder = ${index} WHERE id = '${id}'`);
    });
    callback && callback();
  }

  addIconRaw(dataSet, callback) {
    this.addDataToTable(T_ICON, dataSet, callback);
  }

  setIconData(id, dataSet, callback) {
    const target = { id: sf(id) };
    this.setDataOfTable(T_ICON, target, dataSet, callback);
  }

  setIconName(id, name, callback) {
    this.setIconData(id, { iconName: sf(name) }, callback);
  }

  setIconCode(id, code, callback) {
    this.setIconData(id, { iconCode: sf(code).toUpperCase() }, callback);
  }

  delIcon(id, callback) {
    const target = { id: sf(id) };
    this.delDataOfTable(T_ICON, target, { all: false }, callback);
  }

  moveIconGroup(id, targetGroup, callback) {
    const target = { id: sf(id) };
    const group = targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup;
    this.setDataOfTable(T_ICON, target, { iconGroup: sf(group) }, callback);
  }

  duplicateIconGroup(id, targetGroup, callback) {
    const source = this.getDataOfTable(T_ICON, { id: sf(id) }, { single: true, where: true });
    const group = targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup;
    this.addDataToTable(T_ICON, {
      id: sf(generateUUID()),
      iconCode: sf('E001'),
      iconName: sf(source.iconName),
      iconGroup: sf(group),
      iconSize: source.iconSize,
      iconType: sf(source.iconType),
      iconContent: sf(source.iconContent || ''),
      iconContentOriginal: sf(source.iconContentOriginal || source.iconContent || ''),
    }, callback);
  }

  // Batch ops (use runMutation for raw SQL)
  moveIcons(ids, targetGroup, callback) {
    const group = targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup;
    const placeholders = ids.map(() => '?').join(',');
    this.runMutation(`UPDATE ${T_ICON} SET iconGroup = ? WHERE id IN (${placeholders})`, [group, ...ids]);
    callback && callback();
  }

  delIcons(ids, callback) {
    const placeholders = ids.map(() => '?').join(',');
    this.runMutation(`DELETE FROM ${T_ICON} WHERE id IN (${placeholders})`, ids);
    callback && callback();
  }

  duplicateIcons(ids, targetGroup, callback) {
    const group = targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup;
    ids.forEach((id) => {
      const source = this.getDataOfTable(T_ICON, { id: sf(id) }, { single: true, where: true });
      this.addDataToTable(T_ICON, {
        id: sf(generateUUID()),
        iconCode: sf('E002'),
        iconName: sf(source.iconName),
        iconGroup: sf(group),
        iconSize: source.iconSize || 0,
        iconType: sf(source.iconType || 'svg'),
        iconContent: sf(source.iconContent || ''),
        iconContentOriginal: sf(source.iconContentOriginal || source.iconContent || ''),
      });
    });
    callback && callback();
  }

  setIconFavorite(id, isFavorite) {
    this.runMutation(
      `UPDATE ${T_ICON} SET isFavorite = ? WHERE id = ?`,
      [isFavorite, id]
    );
  }

  setIconsFavorite(ids, isFavorite) {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.runMutation(
      `UPDATE ${T_ICON} SET isFavorite = ? WHERE id IN (${placeholders})`,
      [isFavorite, ...ids]
    );
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let SQL;
beforeEach(async () => {
  if (!SQL) SQL = await initSqlJs();
});

function createDb() {
  const db = new MutationTrackingDatabase(SQL);
  db.initDatabases();
  db.initNewProject('test');
  return db;
}

function addTestIcon(db, id, group = 'resource-uncategorized') {
  db.addDataToTable(T_ICON, {
    id: sf(id),
    iconCode: sf('E000'),
    iconName: sf('test-icon'),
    iconGroup: sf(group),
    iconSize: 100,
    iconType: sf('svg'),
    iconContent: sf('<svg></svg>'),
    iconContentOriginal: sf('<svg></svg>'),
  });
}

function addTestGroup(db, id, name, order = 0) {
  db.addDataToTable(T_GROUP, {
    id: sf(id),
    groupName: sf(name),
    groupOrder: order,
  });
}

// ── Gate method tests ──────────────────────────────────────────────

describe('mutation gate: base methods trigger notifyMutation', () => {
  test('addDataToTable triggers callback', () => {
    const db = createDb();
    const spy = vi.fn();
    db.registerOnMutation(spy);
    spy.mockClear(); // clear any calls from createDb

    db.addDataToTable(T_GROUP, { id: sf('g1'), groupName: sf('Group1'), groupOrder: 0 });
    expect(spy).toHaveBeenCalled();
  });

  test('setDataOfTable triggers callback', () => {
    const db = createDb();
    const spy = vi.fn();
    db.registerOnMutation(spy);

    db.setDataOfTable(T_PROJECT, { id: sf('projectAttributes') }, { projectName: sf('newName') });
    expect(spy).toHaveBeenCalled();
  });

  test('delDataOfTable triggers callback', () => {
    const db = createDb();
    addTestGroup(db, 'g1', 'Group1');
    const spy = vi.fn();
    db.registerOnMutation(spy);

    db.delDataOfTable(T_GROUP, { id: sf('g1') }, { all: false });
    expect(spy).toHaveBeenCalled();
  });

  test('runMutation triggers callback', () => {
    const db = createDb();
    addTestIcon(db, 'icon1');
    const spy = vi.fn();
    db.registerOnMutation(spy);

    db.runMutation(`UPDATE ${T_ICON} SET iconName = 'updated' WHERE id = 'icon1'`);
    expect(spy).toHaveBeenCalled();
  });

  test('no callback registered does not throw', () => {
    const db = createDb();
    // No registerOnMutation call — should not throw
    expect(() => {
      db.addDataToTable(T_GROUP, { id: sf('g1'), groupName: sf('Group1'), groupOrder: 0 });
    }).not.toThrow();
  });
});

// ── High-level method coverage ─────────────────────────────────────

describe('mutation tracking: all high-level write methods trigger callback', () => {
  let db;
  let spy;

  beforeEach(() => {
    db = createDb();
    spy = vi.fn();
    db.registerOnMutation(spy);
    spy.mockClear();
  });

  // -- Project --

  test('setProjectAttributes', () => {
    db.setProjectAttributes({ projectName: sf('renamed') });
    expect(spy).toHaveBeenCalled();
  });

  test('setProjectName (delegates to setProjectAttributes)', () => {
    db.setProjectName('renamed');
    expect(spy).toHaveBeenCalled();
  });

  // -- Groups --

  test('addGroup', () => {
    db.addGroup('NewGroup');
    expect(spy).toHaveBeenCalled();
  });

  test('setGroupData', () => {
    addTestGroup(db, 'g1', 'Group1');
    spy.mockClear();
    db.setGroupData('g1', { groupName: sf('Renamed') });
    expect(spy).toHaveBeenCalled();
  });

  test('setGroupName (delegates to setGroupData)', () => {
    addTestGroup(db, 'g1', 'Group1');
    spy.mockClear();
    db.setGroupName('g1', 'Renamed');
    expect(spy).toHaveBeenCalled();
  });

  test('delGroup triggers for both icon move + group delete', () => {
    addTestGroup(db, 'g1', 'Group1');
    addTestIcon(db, 'icon1', 'g1');
    spy.mockClear();
    db.delGroup('g1');
    // runMutation (move icons) + delDataOfTable (delete group) = at least 2 calls
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('reorderGroups', () => {
    addTestGroup(db, 'g1', 'A', 0);
    addTestGroup(db, 'g2', 'B', 1);
    spy.mockClear();
    db.reorderGroups(['g2', 'g1']);
    // runMutation called per group = 2 calls
    expect(spy).toHaveBeenCalledTimes(2);
  });

  // -- Icons --

  test('addIconRaw (direct addDataToTable)', () => {
    addTestIcon(db, 'icon1');
    // spy was called by addTestIcon which uses addDataToTable
    expect(spy).toHaveBeenCalled();
  });

  test('setIconData', () => {
    addTestIcon(db, 'icon1');
    spy.mockClear();
    db.setIconData('icon1', { iconName: sf('updated') });
    expect(spy).toHaveBeenCalled();
  });

  test('setIconName (delegates to setIconData)', () => {
    addTestIcon(db, 'icon1');
    spy.mockClear();
    db.setIconName('icon1', 'newname');
    expect(spy).toHaveBeenCalled();
  });

  test('setIconCode (delegates to setIconData)', () => {
    addTestIcon(db, 'icon1');
    spy.mockClear();
    db.setIconCode('icon1', 'E999');
    expect(spy).toHaveBeenCalled();
  });

  test('delIcon', () => {
    addTestIcon(db, 'icon1');
    spy.mockClear();
    db.delIcon('icon1');
    expect(spy).toHaveBeenCalled();
  });

  test('moveIconGroup', () => {
    addTestIcon(db, 'icon1');
    addTestGroup(db, 'g1', 'Target');
    spy.mockClear();
    db.moveIconGroup('icon1', 'g1');
    expect(spy).toHaveBeenCalled();
  });

  test('duplicateIconGroup', () => {
    addTestIcon(db, 'icon1');
    spy.mockClear();
    db.duplicateIconGroup('icon1', 'resource-uncategorized');
    expect(spy).toHaveBeenCalled();
  });

  // -- Batch operations --

  test('moveIcons (batch)', () => {
    addTestIcon(db, 'icon1');
    addTestIcon(db, 'icon2');
    addTestGroup(db, 'g1', 'Target');
    spy.mockClear();
    db.moveIcons(['icon1', 'icon2'], 'g1');
    expect(spy).toHaveBeenCalled();
  });

  test('delIcons (batch)', () => {
    addTestIcon(db, 'icon1');
    addTestIcon(db, 'icon2');
    spy.mockClear();
    db.delIcons(['icon1', 'icon2']);
    expect(spy).toHaveBeenCalled();
  });

  test('duplicateIcons (batch)', () => {
    addTestIcon(db, 'icon1');
    spy.mockClear();
    db.duplicateIcons(['icon1'], 'resource-uncategorized');
    expect(spy).toHaveBeenCalled();
  });

  // -- Favorites --

  test('setIconFavorite', () => {
    addTestIcon(db, 'fav1');
    spy.mockClear();
    db.setIconFavorite('fav1', 1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('setIconsFavorite', () => {
    addTestIcon(db, 'fav2');
    addTestIcon(db, 'fav3');
    spy.mockClear();
    db.setIconsFavorite(['fav2', 'fav3'], 1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('setIconsFavorite with empty array does not notify', () => {
    spy.mockClear();
    db.setIconsFavorite([], 1);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── Idempotency of markDirty integration ───────────────────────────

describe('mutation callback idempotency integration', () => {
  test('multiple writes only set dirty once via boolean guard', () => {
    const db = createDb();
    let isDirty = false;
    let setCount = 0;
    db.registerOnMutation(() => {
      // Simulates markDirty's boolean guard
      if (!isDirty) {
        isDirty = true;
        setCount++;
      }
    });

    // Bulk operation: add 50 icons
    for (let i = 0; i < 50; i++) {
      addTestIcon(db, `icon-${i}`);
    }

    // markDirty's guard ensures only 1 "set" despite 50 notifications
    expect(setCount).toBe(1);
    expect(isDirty).toBe(true);
  });
});

// ── Read operations should NOT trigger mutation ────────────────────

describe('read operations do not trigger mutation', () => {
  test('getDataOfTable does not trigger', () => {
    const db = createDb();
    addTestIcon(db, 'icon1');
    const spy = vi.fn();
    db.registerOnMutation(spy);
    spy.mockClear();

    db.getDataOfTable(T_ICON, { id: sf('icon1') }, { single: true, where: true });
    db.getDataOfTable(T_ICON);
    db.getDataCountsOfTable(T_ICON);
    expect(spy).not.toHaveBeenCalled();
  });
});
