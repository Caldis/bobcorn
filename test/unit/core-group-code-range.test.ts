/**
 * Group code-range allocation tests.
 *
 * Two layers, both against the real code shared by CLI + GUI:
 *   1. The pure allocation module (src/core/code-allocation) — range append/fill,
 *      reserved-region skipping in the global pool, batch reassignment planning,
 *      and the range-aware import baseline.
 *   2. The sql.js-backed ProjectDb (src/core/database) wiring those into
 *      getNewIconCode / copyIcon / reassignIconsIntoRange with real group ranges.
 *
 * Mirrors the append/fill alignment precedent in core-code-allocation.test.ts.
 */

import { describe, test, expect } from 'vitest';
import { createEmptyProject } from '../../src/core/database/index';
import {
  allocateIconCodeDec,
  allocateInBounds,
  planRangeReassignments,
  highestUsedInRange,
  PUA_MIN,
  PUA_MAX,
} from '../../src/core/code-allocation';

const SVG_STUB = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';

let _counter = 0;
function uid(): string {
  return `test-${Date.now()}-${++_counter}`;
}

function insertIcon(db: any, iconCode: string, iconGroup = 'resource-uncategorized'): string {
  const id = uid();
  db.addIcon({
    id,
    iconCode,
    iconName: 'icon',
    iconGroup,
    iconSize: 1,
    iconType: 'svg',
    iconContent: SVG_STUB,
  });
  return id;
}

const dec = (hex: string) => parseInt(hex, 16);

// ---------------------------------------------------------------------------
// Pure allocation module
// ---------------------------------------------------------------------------

describe('allocateIconCodeDec — target range', () => {
  test('append allocates past the highest used code inside the range', () => {
    const used = new Set([dec('E100'), dec('E105')]);
    const range = { start: dec('E100'), end: dec('E1FF') };
    expect(allocateIconCodeDec('append', used, range)).toBe(dec('E106'));
  });

  test('fill reuses the lowest free hole inside the range', () => {
    const used = new Set([dec('E100'), dec('E105')]);
    const range = { start: dec('E100'), end: dec('E1FF') };
    expect(allocateIconCodeDec('fill', used, range)).toBe(dec('E101'));
  });

  test('append falls back to hole-filling when the range tail is full', () => {
    // Range E100-E103; E100,E101,E103 used → tail full, hole at E102.
    const used = new Set([dec('E100'), dec('E101'), dec('E103')]);
    const range = { start: dec('E100'), end: dec('E103') };
    expect(allocateIconCodeDec('append', used, range)).toBe(dec('E102'));
  });

  test('throws GROUP_RANGE_EXHAUSTED when the whole range is used', () => {
    const used = new Set([dec('E100'), dec('E101')]);
    const range = { start: dec('E100'), end: dec('E101') };
    expect(() => allocateIconCodeDec('append', used, range)).toThrow(/GROUP_RANGE_EXHAUSTED/);
    expect(() => allocateIconCodeDec('fill', used, range)).toThrow(/GROUP_RANGE_EXHAUSTED/);
  });

  test('empty range → first code point is the range start', () => {
    const range = { start: dec('E100'), end: dec('E1FF') };
    expect(allocateIconCodeDec('append', new Set(), range)).toBe(dec('E100'));
    expect(allocateIconCodeDec('fill', new Set(), range)).toBe(dec('E100'));
  });
});

describe('allocateIconCodeDec — global pool skips reserved ranges', () => {
  const reserved = [{ start: dec('E100'), end: dec('E1FF') }];

  test('append skips the reserved region', () => {
    // E000-E0FF used; next append must jump over reserved E100-E1FF to E200.
    const used = new Set<number>();
    for (let c = dec('E000'); c <= dec('E0FF'); c++) used.add(c);
    expect(allocateIconCodeDec('append', used, null, reserved)).toBe(dec('E200'));
  });

  test('fill skips the reserved region', () => {
    const used = new Set<number>();
    for (let c = dec('E000'); c <= dec('E0FF'); c++) used.add(c);
    expect(allocateIconCodeDec('fill', used, null, reserved)).toBe(dec('E200'));
  });

  test('no reserved ranges → identical to plain PUA allocation', () => {
    const used = new Set([dec('E000'), dec('E005')]);
    expect(allocateIconCodeDec('append', used, null, [])).toBe(dec('E006'));
    expect(allocateIconCodeDec('fill', used, null, [])).toBe(dec('E001'));
  });

  test('throws PUA_EXHAUSTED when every non-reserved pool code is used', () => {
    const used = new Set<number>();
    for (let c = PUA_MIN; c <= PUA_MAX; c++) {
      if (c < dec('E100') || c > dec('E1FF')) used.add(c); // fill the whole pool, leave reserved empty
    }
    expect(() => allocateIconCodeDec('append', used, null, reserved)).toThrow(/PUA_EXHAUSTED/);
    expect(() => allocateIconCodeDec('fill', used, null, reserved)).toThrow(/PUA_EXHAUSTED/);
  });
});

describe('planRangeReassignments', () => {
  test('reassigns only out-of-range rows, sharing one baseline', () => {
    const range = { start: dec('E100'), end: dec('E10F') };
    const used = new Set([dec('E100'), dec('E500'), dec('E501')]); // E100 already in range + two intruders
    const affected = [
      { id: 'a', code: 'E100' }, // in range → untouched
      { id: 'b', code: 'E500' }, // out → reassigned
      { id: 'c', code: 'E501' }, // out → reassigned
    ];
    const plan = planRangeReassignments('append', used, affected, range);
    expect(plan).toEqual([
      { id: 'b', oldCode: 'E500', newCode: 'E101' },
      { id: 'c', oldCode: 'E501', newCode: 'E102' },
    ]);
  });

  test('throws GROUP_RANGE_EXHAUSTED when the range cannot fit all rows', () => {
    const range = { start: dec('E100'), end: dec('E100') }; // capacity 1, already full
    const used = new Set([dec('E100'), dec('E500')]);
    const affected = [{ id: 'b', code: 'E500' }];
    expect(() => planRangeReassignments('append', used, affected, range)).toThrow(
      /GROUP_RANGE_EXHAUSTED/
    );
  });
});

describe('allocateInBounds / highestUsedInRange', () => {
  test('allocateInBounds returns null when the range is full', () => {
    const used = new Set([dec('E100'), dec('E101')]);
    expect(allocateInBounds('append', used, dec('E100'), dec('E101'))).toBeNull();
  });

  test('highestUsedInRange returns start-1 for an empty range', () => {
    expect(highestUsedInRange(new Set(), dec('E100'), dec('E1FF'))).toBe(dec('E100') - 1);
  });

  test('highestUsedInRange ignores codes outside the range (global-vs-range baseline)', () => {
    // A code above the range (E500) must NOT raise the range baseline.
    const used = new Set([dec('E100'), dec('E103'), dec('E500')]);
    expect(highestUsedInRange(used, dec('E100'), dec('E1FF'))).toBe(dec('E103'));
  });

  test('appended/filled classification uses the range baseline', () => {
    // Simulate the addIcons feedback: baseline = highest used inside the range.
    const range = { start: dec('E100'), end: dec('E1FF') };
    const used = new Set([dec('E100'), dec('E103'), dec('E500')]); // E500 is a higher global code
    const baseline = highestUsedInRange(used, range.start, range.end); // E103, NOT E500
    // A fresh append inside the range lands at E104 → appended (dec > baseline).
    const appendCode = allocateIconCodeDec('append', used, range);
    expect(appendCode).toBe(dec('E104'));
    expect(appendCode > baseline).toBe(true);
    // A fill lands in the E101 hole → filled (dec <= baseline).
    const fillCode = allocateIconCodeDec('fill', used, range);
    expect(fillCode).toBe(dec('E101'));
    expect(fillCode <= baseline).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ProjectDb wiring
// ---------------------------------------------------------------------------

describe('ProjectDb.getNewIconCode — group ranges', () => {
  test('allocates inside the target group range (append + fill)', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Ranged');
    db.setGroupCodeRange(g, dec('E100'), dec('E1FF'));
    insertIcon(db, 'E100', g);
    insertIcon(db, 'E105', g);
    expect(db.getNewIconCode('append', g)).toBe('E106');
    expect(db.getNewIconCode('fill', g)).toBe('E101');
    db.close();
  });

  test('range tail full falls back to hole-filling inside the range', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Ranged');
    db.setGroupCodeRange(g, dec('E100'), dec('E103'));
    insertIcon(db, 'E100', g);
    insertIcon(db, 'E101', g);
    insertIcon(db, 'E103', g);
    expect(db.getNewIconCode('append', g)).toBe('E102');
    db.close();
  });

  test('throws GROUP_RANGE_EXHAUSTED when the range is full', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Ranged');
    db.setGroupCodeRange(g, dec('E100'), dec('E101'));
    insertIcon(db, 'E100', g);
    insertIcon(db, 'E101', g);
    expect(() => db.getNewIconCode('append', g)).toThrow(/GROUP_RANGE_EXHAUSTED/);
    db.close();
  });

  test('global pool skips a declared (reserved) range', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Ranged');
    db.setGroupCodeRange(g, dec('E100'), dec('E1FF'));
    // Fill E000-E0FF in uncategorized; global next must skip reserved E100-E1FF.
    for (let c = dec('E000'); c <= dec('E0FF'); c++) {
      insertIcon(db, c.toString(16).toUpperCase(), 'resource-uncategorized');
    }
    expect(db.getNewIconCode('append')).toBe('E200');
    expect(db.getNewIconCode('fill')).toBe('E200');
    db.close();
  });

  test('clearing a range frees the reserved region for the global pool', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Ranged');
    db.setGroupCodeRange(g, dec('E100'), dec('E1FF'));
    for (let c = dec('E000'); c <= dec('E0FF'); c++) {
      insertIcon(db, c.toString(16).toUpperCase(), 'resource-uncategorized');
    }
    expect(db.getNewIconCode('append')).toBe('E200'); // reserved
    db.setGroupCodeRange(g, null, null); // clear
    expect(db.getNewIconCode('append')).toBe('E100'); // reserved region reopened
    db.close();
  });

  test('no range → behaviour identical to the plain allocator', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Plain');
    insertIcon(db, 'E000', g);
    insertIcon(db, 'E005', g);
    expect(db.getNewIconCode('append', g)).toBe('E006');
    expect(db.getNewIconCode('fill', g)).toBe('E001');
    db.close();
  });
});

describe('ProjectDb.copyIcon — into a ranged group', () => {
  test('copy allocates inside the target group range', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Ranged');
    db.setGroupCodeRange(g, dec('E100'), dec('E1FF'));
    const src = insertIcon(db, 'E500', 'resource-uncategorized');
    const copy = db.copyIcon(src, g);
    expect(copy.iconCode).toBe('E100'); // first free inside the range
    db.close();
  });
});

describe('ProjectDb.reassignIconsIntoRange — move reassignment', () => {
  test('reassigns out-of-range icons into the target range', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Ranged');
    db.setGroupCodeRange(g, dec('E100'), dec('E10F'));
    const x = insertIcon(db, 'E500', g); // out of range but already in the group
    const y = insertIcon(db, 'E501', g);
    const plan = db.reassignIconsIntoRange([x, y], g);
    expect(plan.map((p: any) => p.newCode)).toEqual(['E100', 'E101']);
    expect(db.getIcon(x)!.iconCode).toBe('E100');
    expect(db.getIcon(y)!.iconCode).toBe('E101');
    db.close();
  });

  test('leaves in-range icons untouched', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Ranged');
    db.setGroupCodeRange(g, dec('E100'), dec('E1FF'));
    const inRange = insertIcon(db, 'E10A', g);
    const plan = db.reassignIconsIntoRange([inRange], g);
    expect(plan).toEqual([]);
    expect(db.getIcon(inRange)!.iconCode).toBe('E10A');
    db.close();
  });

  test('no-op when the group has no range', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Plain');
    const x = insertIcon(db, 'E500', g);
    expect(db.reassignIconsIntoRange([x], g)).toEqual([]);
    expect(db.getIcon(x)!.iconCode).toBe('E500');
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Schema migration (old file without the columns opens + gains the range)
// ---------------------------------------------------------------------------

describe('code-range schema migration', () => {
  test('a group table without the range columns gains them on open', async () => {
    const db = await createEmptyProject('test');
    const raw = (db as any).db;
    // Simulate a legacy file: drop the range columns by rebuilding the table.
    raw.run(`ALTER TABLE groupData RENAME TO groupData_old`);
    raw.run(
      `CREATE TABLE groupData (id varchar(255), groupName varchar(255), groupOrder int(255), groupColor varchar(255), groupDescription TEXT, groupIcon TEXT, createTime datetime, updateTime datetime)`
    );
    raw.run(
      `INSERT INTO groupData (id, groupName, groupOrder) SELECT id, groupName, groupOrder FROM groupData_old`
    );
    raw.run(`DROP TABLE groupData_old`);
    // Re-run migrations (as openProject would) and confirm the columns come back.
    (db as any).runMigrations();
    const g = uid();
    db.addGroup(g, 'Ranged');
    db.setGroupCodeRange(g, dec('E100'), dec('E1FF'));
    expect(db.getGroupCodeRange(g)).toEqual({ start: dec('E100'), end: dec('E1FF') });
    db.close();
  });
});
