/**
 * Core Database (ProjectDb) unit tests
 *
 * Tests the sql.js-backed ProjectDb class from src/core/database.
 * Uses createEmptyProject() for fresh in-memory databases.
 */

import { describe, test, expect } from 'vitest';
import { createEmptyProject, ProjectDb } from '../../src/core/database/index';

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

    // Assign icon as groupIcon via raw SQL (no setGroupIcon API yet)
    // Use the internal db by going through a public method that triggers SQL
    // We need raw access — use exec-style approach through the ProjectDb
    // Since ProjectDb doesn't expose raw SQL, we set groupIcon via setGroupDescription workaround
    // Actually, let's just use the SQL that the addGroup generated and update via a known method pattern

    // The ProjectDb doesn't have a setGroupIcon method yet, so we need raw SQL.
    // We can access it indirectly: the db.exec is not exposed, but we can use
    // a trick — call the internal db through the export/reimport cycle or
    // extend the approach. Actually, let's just access the private db field.
    // In tests, TypeScript won't stop us from accessing private fields via bracket notation.
    const rawDb = (db as any).db;
    rawDb.run(`UPDATE groupData SET groupIcon = '${iconId}' WHERE id = '${groupId}'`);

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

    // Assign icon as groupA's groupIcon
    const rawDb = (db as any).db;
    rawDb.run(`UPDATE groupData SET groupIcon = '${iconId}' WHERE id = '${groupA}'`);

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

    // Assign icon as groupIcon
    const rawDb = (db as any).db;
    rawDb.run(`UPDATE groupData SET groupIcon = '${iconId}' WHERE id = '${groupId}'`);

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
});
