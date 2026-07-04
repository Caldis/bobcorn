/**
 * Core icon-code allocation mode tests (append / fill).
 *
 * Mirrors the renderer's getNewIconCode semantics
 * (test/unit/database.test.js "getNewIconCode / iconCodeInRange / iconCodeCanUse")
 * against the real sql.js-backed ProjectDb from src/core/database.
 */

import { describe, test, expect } from 'vitest';
import { createEmptyProject } from '../../src/core/database/index';

const SVG_STUB = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';

let _counter = 0;
function uid(): string {
  return `test-${Date.now()}-${++_counter}`;
}

/** Insert an icon row with a given code (defaults to a throwaway placeholder). */
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

/** Fill the icon table with every PUA code (E000-F8FF) except those in `holes`. */
function fillAllCodes(db: any, holes: string[] = []): void {
  const holeSet = new Set(holes.map((h) => parseInt(h, 16)));
  const rawDb = (db as any).db;
  for (let start = 0xe000; start <= 0xf8ff; start += 400) {
    const rows: string[] = [];
    for (let c = start; c < Math.min(start + 400, 0xf900); c++) {
      if (holeSet.has(c)) continue;
      const hex = c.toString(16).toUpperCase();
      rows.push(`('id-${c}', '${hex}', 'fill', 'resource-uncategorized', 1, 'svg', '<svg/>')`);
    }
    if (rows.length) {
      rawDb.run(
        `INSERT INTO iconData (id, iconCode, iconName, iconGroup, iconSize, iconType, iconContent) VALUES ${rows.join(',')}`
      );
    }
  }
}

describe('ProjectDb.getNewIconCode — allocation modes', () => {
  test('returns E000 when no icons exist (mode irrelevant)', async () => {
    const db = await createEmptyProject('test');
    expect(db.getNewIconCode()).toBe('E000');
    expect(db.getNewIconCode('fill')).toBe('E000');
    db.close();
  });

  test('default mode (no arg) is append', async () => {
    const db = await createEmptyProject('test');
    insertIcon(db, 'E000');
    insertIcon(db, 'E005'); // E001-E004 are holes
    expect(db.getNewIconCode()).toBe('E006');
    db.close();
  });

  test('append mode skips holes and allocates past the highest used code', async () => {
    const db = await createEmptyProject('test');
    insertIcon(db, 'E000');
    insertIcon(db, 'E005');
    expect(db.getNewIconCode('append')).toBe('E006');
    db.close();
  });

  test('fill mode reuses the first free hole', async () => {
    const db = await createEmptyProject('test');
    insertIcon(db, 'E000');
    insertIcon(db, 'E005');
    expect(db.getNewIconCode('fill')).toBe('E001');
    db.close();
  });

  test('append mode falls back to hole-filling when the tail is full', async () => {
    const db = await createEmptyProject('test');
    fillAllCodes(db, ['E050']); // only E050 is free; highest used is F8FF
    expect(db.getNewIconCode('append')).toBe('E050');
    db.close();
  });

  test('can allocate the final code point F8FF (off-by-one guard)', async () => {
    const db = await createEmptyProject('test');
    fillAllCodes(db, ['F8FF']);
    expect(db.getNewIconCode('append')).toBe('F8FF');
    expect(db.getNewIconCode('fill')).toBe('F8FF');
    db.close();
  });

  test('throws PUA_EXHAUSTED when all 6400 codes are used (both modes)', async () => {
    const db = await createEmptyProject('test');
    fillAllCodes(db);
    expect(() => db.getNewIconCode('append')).toThrow(/PUA_EXHAUSTED/);
    expect(() => db.getNewIconCode('fill')).toThrow(/PUA_EXHAUSTED/);
    db.close();
  });

  test('invalid/garbage stored codes are ignored, not treated as occupying E000-E0FFFF range', async () => {
    const db = await createEmptyProject('test');
    insertIcon(db, 'E000');
    // A malformed code (parseInt(..., 16) => NaN) must not affect allocation.
    const rawDb = (db as any).db;
    rawDb.run(
      `INSERT INTO iconData (id, iconCode, iconName, iconGroup, iconSize, iconType, iconContent) VALUES ('bad-1', 'zzzz', 'bad', 'resource-uncategorized', 1, 'svg', '<svg/>')`
    );
    expect(db.getNewIconCode('append')).toBe('E001');
    expect(db.getNewIconCode('fill')).toBe('E001');
    db.close();
  });
});

describe('ProjectDb.copyIcon — allocation mode threading', () => {
  test('default (append) allocates past the highest used code, skipping holes', async () => {
    const db = await createEmptyProject('test');
    const groupId = uid();
    db.addGroup(groupId, 'Group A');
    const a = insertIcon(db, 'E000', groupId);
    insertIcon(db, 'E005', groupId); // hole at E001-E004

    const copy = db.copyIcon(a, groupId);
    expect(copy.iconCode).toBe('E006');
    db.close();
  });

  test('explicit fill mode reuses the first free hole', async () => {
    const db = await createEmptyProject('test');
    const groupId = uid();
    db.addGroup(groupId, 'Group A');
    const a = insertIcon(db, 'E000', groupId);
    insertIcon(db, 'E005', groupId);

    const copy = db.copyIcon(a, groupId, 'fill');
    expect(copy.iconCode).toBe('E001');
    db.close();
  });

  test('throws PUA_EXHAUSTED when codes are exhausted', async () => {
    const db = await createEmptyProject('test');
    const groupId = uid();
    db.addGroup(groupId, 'Group A');
    const a = insertIcon(db, 'E000', groupId);
    fillAllCodes(db);

    expect(() => db.copyIcon(a, groupId)).toThrow(/PUA_EXHAUSTED/);
    db.close();
  });
});
