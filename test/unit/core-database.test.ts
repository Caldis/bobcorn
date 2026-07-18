/**
 * Core Database (ProjectDb) unit tests
 *
 * Tests the sql.js-backed ProjectDb class from src/core/database.
 * Uses createEmptyProject() for fresh in-memory databases.
 */

import { describe, test, expect } from 'vitest';
import { createEmptyProject, ProjectDb } from '../../src/core/database/index';
import { createProject, inspectProject } from '../../src/core/operations/project';
import type { IoAdapter } from '../../src/core/io';

// Minimal in-memory IoAdapter for testing core operations without disk I/O.
function memIo(): IoAdapter {
  const files = new Map<string, Uint8Array>();
  return {
    async readFile(p) {
      const data = files.get(p);
      if (!data) throw new Error(`File not found: ${p}`);
      return data;
    },
    async writeFile(p, data) {
      files.set(p, data);
    },
    async exists(p) {
      return files.has(p);
    },
    async mkdir() {
      /* no-op */
    },
    resolve: (...parts) => parts.join('/'),
    join: (...parts) => parts.join('/'),
    basename: (p) => p.split('/').pop() || p,
    dirname: (p) => p.split('/').slice(0, -1).join('/') || '.',
    extname: (p) => {
      const b = p.split('/').pop() || '';
      const i = b.lastIndexOf('.');
      return i > 0 ? b.slice(i) : '';
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SVG_STUB = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';

let _counter = 0;
function uid(): string {
  return `test-${Date.now()}-${++_counter}`;
}

// ---------------------------------------------------------------------------
// groupIcon cleanup triggers
// ---------------------------------------------------------------------------

describe('groupIcon cleanup triggers', () => {
  test('deleting an icon NULLs groupIcon references', async () => {
    const db = await createEmptyProject('trigger-test');

    // Create a group and an icon in it
    const groupId = uid();
    const iconId = uid();
    db.addGroup(groupId, 'Group A');
    db.addIcon({
      id: iconId,
      iconCode: 'E000',
      iconName: 'test-icon',
      iconGroup: groupId,
      iconSize: 100,
      iconType: 'svg',
      iconContent: SVG_STUB,
    });

    // Assign icon as group cover via the ProjectDb setter
    db.setGroupIcon(groupId, iconId);

    // Verify groupIcon was set
    let groups = db.getGroupList();
    let group = groups.find((g) => g.id === groupId);
    expect((group as any).groupIcon).toBe(iconId);

    // Delete the icon (soft-delete moves to resource-deleted, fires MOVE trigger)
    db.deleteIcon(iconId);

    // Verify groupIcon is now NULL
    groups = db.getGroupList();
    group = groups.find((g) => g.id === groupId);
    expect((group as any).groupIcon).toBeNull();

    db.close();
  });

  test('moving icon to another group NULLs groupIcon in source group', async () => {
    const db = await createEmptyProject('trigger-test');

    const groupA = uid();
    const groupB = uid();
    const iconId = uid();
    db.addGroup(groupA, 'Group A');
    db.addGroup(groupB, 'Group B');
    db.addIcon({
      id: iconId,
      iconCode: 'E000',
      iconName: 'test-icon',
      iconGroup: groupA,
      iconSize: 100,
      iconType: 'svg',
      iconContent: SVG_STUB,
    });

    // Assign icon as groupA's cover via the ProjectDb setter
    db.setGroupIcon(groupA, iconId);

    // Verify it was set
    let groups = db.getGroupList();
    let group = groups.find((g) => g.id === groupA);
    expect((group as any).groupIcon).toBe(iconId);

    // Move icon to groupB
    db.moveIcon(iconId, groupB);

    // Verify groupA's groupIcon is now NULL
    groups = db.getGroupList();
    group = groups.find((g) => g.id === groupA);
    expect((group as any).groupIcon).toBeNull();

    db.close();
  });

  test('moving icon within same group does NOT clear groupIcon', async () => {
    const db = await createEmptyProject('trigger-test');

    const groupId = uid();
    const iconId = uid();
    db.addGroup(groupId, 'Group A');
    db.addIcon({
      id: iconId,
      iconCode: 'E000',
      iconName: 'test-icon',
      iconGroup: groupId,
      iconSize: 100,
      iconType: 'svg',
      iconContent: SVG_STUB,
    });

    // Assign icon as group cover via the ProjectDb setter
    db.setGroupIcon(groupId, iconId);

    // Verify it was set
    let groups = db.getGroupList();
    let group = groups.find((g) => g.id === groupId);
    expect((group as any).groupIcon).toBe(iconId);

    // "Move" icon to the same group (no-op move)
    db.moveIcon(iconId, groupId);

    // Verify groupIcon is still set (trigger WHEN clause prevents firing)
    groups = db.getGroupList();
    group = groups.find((g) => g.id === groupId);
    expect((group as any).groupIcon).toBe(iconId);

    db.close();
  });

  test('migration repairs orphaned groupIcon references', async () => {
    const db = await createEmptyProject('test');
    const rawDb = (db as any).db;

    // Create a group
    rawDb.run(`INSERT INTO groupData (id, groupName, groupOrder) VALUES ('g1', 'Group1', 0)`);

    // Set groupIcon to a non-existent icon (simulating orphaned reference)
    rawDb.run(`UPDATE groupData SET groupIcon = 'ghost-icon-id' WHERE id = 'g1'`);

    // Verify the orphan exists
    const before = rawDb.exec(`SELECT groupIcon FROM groupData WHERE id = 'g1'`);
    expect(before[0].values[0][0]).toBe('ghost-icon-id');

    // Run migrations (should repair orphans)
    db.runMigrations();

    // Orphaned reference should be NULLed
    const after = rawDb.exec(`SELECT groupIcon FROM groupData WHERE id = 'g1'`);
    expect(after[0].values[0][0]).toBeNull();

    db.close();
  });
});

// ---------------------------------------------------------------------------
// Group setters (setGroupIcon / setGroupDescription / addGroup description)
// ---------------------------------------------------------------------------

describe('group setters', () => {
  test('setGroupIcon sets and clears the group cover', async () => {
    const db = await createEmptyProject('setter-test');
    const groupId = uid();
    const iconId = uid();
    db.addGroup(groupId, 'Group A');
    db.addIcon({
      id: iconId,
      iconCode: 'E000',
      iconName: 'cover-icon',
      iconGroup: groupId,
      iconSize: 100,
      iconType: 'svg',
      iconContent: SVG_STUB,
    });

    db.setGroupIcon(groupId, iconId);
    let group = db.getGroup(groupId);
    expect(group?.groupIcon).toBe(iconId);

    // Clear with null → SQL NULL
    db.setGroupIcon(groupId, null);
    group = db.getGroup(groupId);
    expect(group?.groupIcon).toBeNull();

    db.close();
  });

  test("setGroupIcon escapes quotes and only touches the target group's row", async () => {
    const db = await createEmptyProject('setter-test');
    const groupA = uid();
    const groupB = uid();
    db.addGroup(groupA, 'Group A');
    db.addGroup(groupB, 'Group B');

    db.setGroupIcon(groupA, "icon-with-'quote");
    expect(db.getGroup(groupA)?.groupIcon).toBe("icon-with-'quote");
    expect(db.getGroup(groupB)?.groupIcon).toBeNull();

    db.close();
  });

  test('setGroupDescription round-trips and clears with null', async () => {
    const db = await createEmptyProject('setter-test');
    const groupId = uid();
    db.addGroup(groupId, 'Group A');

    db.setGroupDescription(groupId, 'hello world');
    expect(db.getGroup(groupId)?.groupDescription).toBe('hello world');

    db.setGroupDescription(groupId, null);
    expect(db.getGroup(groupId)?.groupDescription).toBeNull();

    db.close();
  });

  test('addGroup writes optional description in the same INSERT; omitted → NULL', async () => {
    const db = await createEmptyProject('setter-test');
    const withDesc = uid();
    const withoutDesc = uid();

    const created = db.addGroup(withDesc, 'Described', 'my description');
    expect(created).toEqual({ id: withDesc, groupName: 'Described', groupOrder: 0 });
    expect(db.getGroup(withDesc)?.groupDescription).toBe('my description');

    db.addGroup(withoutDesc, 'Plain');
    expect(db.getGroup(withoutDesc)?.groupDescription).toBeNull();

    db.close();
  });

  test('getGroup returns null for a missing id', async () => {
    const db = await createEmptyProject('setter-test');
    expect(db.getGroup('no-such-group')).toBeNull();
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Project name (displayName) vs icon code prefix (projectName) split
// ---------------------------------------------------------------------------

describe('displayName (project name) vs projectName (icon code prefix)', () => {
  test('createEmptyProject sets prefix; displayName defaults to null', async () => {
    const db = await createEmptyProject('myfont');
    expect(db.getProjectName()).toBe('myfont');
    expect(db.getProjectDisplayName()).toBeNull();
    db.close();
  });

  test('createEmptyProject accepts a separate displayName', async () => {
    const db = await createEmptyProject('myfont', 'My Project');
    expect(db.getProjectName()).toBe('myfont');
    expect(db.getProjectDisplayName()).toBe('My Project');
    db.close();
  });

  test('setProjectDisplayName round-trips and can be cleared without touching the prefix', async () => {
    const db = await createEmptyProject('iconfont');
    db.setProjectDisplayName('Hello');
    expect(db.getProjectDisplayName()).toBe('Hello');
    db.setProjectDisplayName(null);
    expect(db.getProjectDisplayName()).toBeNull();
    expect(db.getProjectName()).toBe('iconfont'); // prefix untouched
    db.close();
  });

  test('migration adds displayName column to legacy projects (no displayName)', async () => {
    const db = await createEmptyProject('legacy');
    const rawDb = (db as any).db;
    // Simulate an old .icp: recreate projectAttributes without the displayName column
    rawDb.run('DROP TABLE projectAttributes');
    rawDb.run(
      `CREATE TABLE projectAttributes (id varchar(255), projectName varchar(255), createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
    );
    rawDb.run(
      `INSERT INTO projectAttributes (id, projectName) VALUES ('projectAttributes', 'legacy')`
    );

    db.runMigrations();

    // Column now exists; getter returns null (not throw) and can be set afterwards
    expect(db.getProjectDisplayName()).toBeNull();
    db.setProjectDisplayName('Recovered');
    expect(db.getProjectDisplayName()).toBe('Recovered');
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Core operation: createProject / inspectProject with the name/prefix split
// ---------------------------------------------------------------------------

describe('createProject + inspectProject (name/prefix split)', () => {
  test('inspect reports display name and prefix separately', async () => {
    const io = memIo();
    await createProject(io, 'proj.icp', 'myfont', 'My Project');
    const info = await inspectProject(io, 'proj.icp');
    expect(info.name).toBe('My Project'); // human-facing display name
    expect(info.prefix).toBe('myfont'); // icon code prefix
    expect(info.iconCount).toBe(0);
  });

  test('inspect name falls back to prefix when display name is unset', async () => {
    const io = memIo();
    await createProject(io, 'proj.icp', 'fallbackfont');
    const info = await inspectProject(io, 'proj.icp');
    expect(info.name).toBe('fallbackfont');
    expect(info.prefix).toBe('fallbackfont');
  });
});

// ---------------------------------------------------------------------------
// getDuplicateIconCodes — renderer 撞码标识委托 (Stage C 簇②) 的 core 侧行为
// ---------------------------------------------------------------------------

describe('getDuplicateIconCodes', () => {
  const addIconWithCode = (db: any, code: string, group = 'resource-uncategorized') => {
    db.addIcon({
      id: uid(),
      iconCode: code,
      iconName: `icon-${code}`,
      iconGroup: group,
      iconSize: 100,
      iconType: 'svg',
      iconContent: SVG_STUB,
    });
  };

  test('returns uppercase-normalized duplicate codes only (single GROUP BY)', async () => {
    const db = await createEmptyProject('dup-test');
    addIconWithCode(db, 'E000');
    addIconWithCode(db, 'e000'); // 大小写混写也算撞码 (UPPER 归一化)
    addIconWithCode(db, 'E001');
    expect(db.getDuplicateIconCodes()).toEqual(['E000']);
    db.close();
  });

  test('includes recycle bin / deleted / variant rows and returns [] when clean', async () => {
    const db = await createEmptyProject('dup-test');
    addIconWithCode(db, 'E000');
    expect(db.getDuplicateIconCodes()).toEqual([]);
    // 回收站行也参与撞码统计 (与 renderer 版语义一致: 全表无过滤)
    addIconWithCode(db, 'E000', 'resource-recycleBin');
    expect(db.getDuplicateIconCodes()).toEqual(['E000']);
    db.close();
  });
});
