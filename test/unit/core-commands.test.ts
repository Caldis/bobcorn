/**
 * Core command layer tests (src/core/commands) — in-memory ProjectDb direct.
 *
 * Commands are synchronous pure-decision bodies (`fn(db, args) → DTO`); these
 * tests exercise them against a real sql.js database via createEmptyProject:
 * plan/execute pairs, the three delete semantics, import appended/filled
 * classification, copy stop-on-exhaustion, replace variant cascade, group
 * code-range validation reasons, and every CommandWarning type.
 */

import { describe, test, expect } from 'vitest';
import { createEmptyProject } from '../../src/core/database/index';
import type { ProjectDb } from '../../src/core/database/index';
import {
  planMoveIcons,
  moveIcons,
  planDeleteIcons,
  deleteIcons,
  importIcons,
  copyIcons,
  replaceIconContent,
  rangeViolations,
} from '../../src/core/commands/icon';
import { validateGroupCodeRange } from '../../src/core/commands/group';

const SVG_STUB = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';

let _counter = 0;
function uid(): string {
  return `test-${Date.now()}-${++_counter}`;
}

const dec = (hex: string) => parseInt(hex, 16);

function insertIcon(db: ProjectDb, iconCode: string, iconGroup = 'resource-uncategorized'): string {
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

/** Insert a variant row (raw SQL — ProjectDb has no variant-creation API). */
function insertVariant(
  db: ProjectDb,
  parentId: string,
  iconCode: string,
  iconGroup = 'resource-uncategorized'
): string {
  const id = uid();
  (db as any).db.run(
    `INSERT INTO iconData (id, iconCode, iconName, iconGroup, iconSize, iconType, iconContent, variantOf) ` +
      `VALUES ('${id}', '${iconCode}', 'variant', '${iconGroup}', 1, 'svg', '<svg/>', '${parentId}')`
  );
  return id;
}

function warningOf(warnings: { type: string; count: number }[], type: string) {
  return warnings.find((w) => w.type === type);
}

// ---------------------------------------------------------------------------
// Move — plan/execute pair
// ---------------------------------------------------------------------------

describe('planMoveIcons / moveIcons', () => {
  test('plan outOfRange count matches the codes moveIcons actually reassigns', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Ranged');
    db.setGroupCodeRange(g, dec('E100'), dec('E10F'));
    const parent = insertIcon(db, 'E500');
    const variant = insertVariant(db, parent, 'E501');

    const plan = planMoveIcons(db, [parent], g);
    expect(plan.targetGroupId).toBe(g);
    expect(plan.variantCount).toBe(1);
    expect(plan.outOfRange).not.toBeNull();
    expect(plan.outOfRange!.count).toBe(2); // parent + variant, both outside E100-E10F
    expect(plan.outOfRange!.range).toEqual({ start: dec('E100'), end: dec('E10F') });
    expect(plan.outOfRange!.rangeFree).toBe(16);

    const outcome = moveIcons(db, [parent], g, { reassignOutOfRange: true });
    expect(outcome.moved).toBe(1);
    expect(outcome.reassigned).toHaveLength(plan.outOfRange!.count);
    expect(outcome.reassigned.map((r) => r.newCode)).toEqual(['E100', 'E101']);
    // Variants follow the parent; both landed in the ranged group.
    expect(db.getIcon(parent)!.iconGroup).toBe(g);
    expect(db.getIcon(variant)!.iconGroup).toBe(g);
    // Both warning semantics fire.
    expect(warningOf(outcome.warnings, 'variant-follow')).toEqual({
      type: 'variant-follow',
      count: 1,
    });
    expect(warningOf(outcome.warnings, 'codes-reassigned')).toEqual({
      type: 'codes-reassigned',
      count: 2,
    });
    db.close();
  });

  test('normalizes resource-all to resource-uncategorized (no range → outOfRange null)', async () => {
    const db = await createEmptyProject('test');
    const id = insertIcon(db, 'E000', 'resource-uncategorized');
    const plan = planMoveIcons(db, [id], 'resource-all');
    expect(plan.targetGroupId).toBe('resource-uncategorized');
    expect(plan.outOfRange).toBeNull();
    db.close();
  });

  test('without reassignOutOfRange an out-of-range icon moves and keeps its code', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Ranged');
    db.setGroupCodeRange(g, dec('E100'), dec('E1FF'));
    const id = insertIcon(db, 'E000');

    const outcome = moveIcons(db, [id], g);
    expect(outcome.moved).toBe(1);
    expect(outcome.reassigned).toEqual([]);
    expect(warningOf(outcome.warnings, 'codes-reassigned')).toBeUndefined();
    expect(db.getIcon(id)!.iconGroup).toBe(g);
    expect(db.getIcon(id)!.iconCode).toBe('E000'); // 现状语义: 照常移动不改码
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Delete — the three modes
// ---------------------------------------------------------------------------

describe('planDeleteIcons / deleteIcons', () => {
  test('recycle moves parent AND variant into the recycle bin (variant-follow)', async () => {
    const db = await createEmptyProject('test');
    const parent = insertIcon(db, 'E000');
    const variant = insertVariant(db, parent, 'E001');

    const plan = planDeleteIcons(db, [parent], 'recycle');
    expect(plan).toEqual({
      count: 1,
      variantCount: 1,
      warnings: [{ type: 'variant-follow', count: 1 }],
    });

    const outcome = deleteIcons(db, [parent], 'recycle');
    expect(outcome.deleted).toBe(plan.count);
    expect(outcome.ids).toEqual([parent]);
    expect(outcome.warnings).toEqual(plan.warnings);
    expect(db.getIcon(parent)!.iconGroup).toBe('resource-recycleBin');
    expect(db.getIcon(variant)!.iconGroup).toBe('resource-recycleBin');
    db.close();
  });

  test('soft moves parent to resource-deleted and hard-deletes the variant (variant-cascade-delete)', async () => {
    const db = await createEmptyProject('test');
    const parent = insertIcon(db, 'E000');
    const variant = insertVariant(db, parent, 'E001');

    const outcome = deleteIcons(db, [parent], 'soft');
    expect(outcome.deleted).toBe(1);
    expect(outcome.warnings).toEqual([{ type: 'variant-cascade-delete', count: 1 }]);
    expect(db.getIcon(parent)!.iconGroup).toBe('resource-deleted');
    expect(db.getIcon(variant)).toBeNull();
    db.close();
  });

  test('permanent removes parent AND variant entirely', async () => {
    const db = await createEmptyProject('test');
    const parent = insertIcon(db, 'E000');
    const variant = insertVariant(db, parent, 'E001');

    const plan = planDeleteIcons(db, [parent], 'permanent');
    expect(plan.warnings).toEqual([{ type: 'variant-cascade-delete', count: 1 }]);

    const outcome = deleteIcons(db, [parent], 'permanent');
    expect(outcome.deleted).toBe(1);
    expect(db.getIcon(parent)).toBeNull();
    expect(db.getIcon(variant)).toBeNull();
    db.close();
  });

  test('missing ids are skipped, not errors', async () => {
    const db = await createEmptyProject('test');
    const real = insertIcon(db, 'E000');
    const outcome = deleteIcons(db, ['no-such-id', real], 'soft');
    expect(outcome.deleted).toBe(1);
    expect(outcome.ids).toEqual([real]);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Import — appended/filled classification + failed 不抛
// ---------------------------------------------------------------------------

describe('importIcons', () => {
  test('append classifies against the batch baseline taken once (range-local)', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Ranged');
    db.setGroupCodeRange(g, dec('E100'), dec('E1FF'));
    insertIcon(db, 'E100', g);
    insertIcon(db, 'E103', g); // baseline = E103 (holes at E101, E102)

    const outcome = importIcons(
      db,
      [
        { name: 'a', content: SVG_STUB },
        { name: 'b', content: SVG_STUB },
      ],
      { targetGroupId: g, codeMode: 'append' }
    );
    expect(outcome.added).toBe(2);
    expect(outcome.failed).toBe(0);
    expect(outcome.icons.map((i) => i.code)).toEqual(['E104', 'E105']);
    expect(outcome.appended).toBe(2); // both past the E103 baseline
    expect(outcome.filled).toBe(0);
    expect(outcome.firstError).toBeNull();
    db.close();
  });

  test('fill reuses holes below the baseline and classifies them as filled', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Ranged');
    db.setGroupCodeRange(g, dec('E100'), dec('E1FF'));
    insertIcon(db, 'E100', g);
    insertIcon(db, 'E103', g);

    const outcome = importIcons(
      db,
      [
        { name: 'a', content: SVG_STUB },
        { name: 'b', content: SVG_STUB },
      ],
      { targetGroupId: g, codeMode: 'fill' }
    );
    expect(outcome.icons.map((i) => i.code)).toEqual(['E101', 'E102']);
    expect(outcome.appended).toBe(0);
    expect(outcome.filled).toBe(2);
    db.close();
  });

  test('unranged import into an empty project appends from E000', async () => {
    const db = await createEmptyProject('test');
    const outcome = importIcons(db, [{ name: 'first', content: SVG_STUB }]);
    expect(outcome.icons[0].code).toBe('E000');
    expect(outcome.appended).toBe(1);
    expect(db.getIcon(outcome.icons[0].id)!.iconGroup).toBe('resource-uncategorized');
    db.close();
  });

  test('range exhaustion counts into failed without throwing', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Tiny');
    db.setGroupCodeRange(g, dec('E100'), dec('E100')); // capacity 1
    insertIcon(db, 'E100', g); // full

    const outcome = importIcons(
      db,
      [
        { name: 'x', content: SVG_STUB },
        { name: 'y', content: SVG_STUB },
      ],
      { targetGroupId: g }
    );
    expect(outcome.added).toBe(0);
    expect(outcome.failed).toBe(2);
    expect(outcome.icons).toEqual([]);
    expect(outcome.firstError).toBeInstanceOf(Error);
    expect(outcome.firstError!.message).toMatch(/GROUP_RANGE_EXHAUSTED/);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Copy — 耗尽即停 + variant-not-copied
// ---------------------------------------------------------------------------

describe('copyIcons', () => {
  test('stops at code-point exhaustion, counting the rest as failed', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Tiny');
    db.setGroupCodeRange(g, dec('E100'), dec('E101')); // capacity 2
    const a = insertIcon(db, 'E000');
    const b = insertIcon(db, 'E001');
    const c = insertIcon(db, 'E002');

    const outcome = copyIcons(db, [a, b, c], g);
    expect(outcome.copied).toBe(2);
    expect(outcome.failed).toBe(1);
    expect(outcome.icons.map((i) => i.code)).toEqual(['E100', 'E101']);
    expect(outcome.stopError).toBeInstanceOf(Error);
    expect(outcome.stopError!.message).toMatch(/GROUP_RANGE_EXHAUSTED/);
    db.close();
  });

  test('does not copy variants and warns variant-not-copied', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Plain');
    const parent = insertIcon(db, 'E000');
    insertVariant(db, parent, 'E001');

    const outcome = copyIcons(db, [parent], g);
    expect(outcome.copied).toBe(1);
    expect(outcome.failed).toBe(0);
    expect(outcome.stopError).toBeNull();
    expect(outcome.warnings).toEqual([{ type: 'variant-not-copied', count: 1 }]);
    expect(db.getVariantCount(outcome.icons[0].id)).toBe(0);
    // Source keeps its own variant.
    expect(db.getVariantCount(parent)).toBe(1);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Replace — variant cascade
// ---------------------------------------------------------------------------

describe('replaceIconContent', () => {
  test('hard-deletes variants and warns variant-cascade-delete', async () => {
    const db = await createEmptyProject('test');
    const parent = insertIcon(db, 'E000');
    const v1 = insertVariant(db, parent, 'E001');
    const v2 = insertVariant(db, parent, 'E002');

    const newContent = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
    const outcome = replaceIconContent(db, parent, newContent);
    expect(outcome.warnings).toEqual([{ type: 'variant-cascade-delete', count: 2 }]);
    expect(db.getIcon(v1)).toBeNull();
    expect(db.getIcon(v2)).toBeNull();
    const row = db.getIcon(parent)!;
    expect(row.iconContent).toBe(newContent);
    expect(row.iconContentOriginal).toBe(newContent);
    db.close();
  });

  test('no variants → no warnings', async () => {
    const db = await createEmptyProject('test');
    const id = insertIcon(db, 'E000');
    const outcome = replaceIconContent(db, id, SVG_STUB);
    expect(outcome.warnings).toEqual([]);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Range violations
// ---------------------------------------------------------------------------

describe('rangeViolations', () => {
  test('flags icons outside their own group range; unranged groups are ignored', async () => {
    const db = await createEmptyProject('test');
    const ranged = uid();
    const plain = uid();
    db.addGroup(ranged, 'Nav');
    db.addGroup(plain, 'Free');
    db.setGroupCodeRange(ranged, dec('E100'), dec('E1FF'));
    const stray = insertIcon(db, 'E000', ranged); // out of Nav's range
    insertIcon(db, 'E100', ranged); // in range
    insertIcon(db, 'E500', plain); // unranged group — never checked

    const rows = rangeViolations(db);
    expect(rows).toEqual([
      {
        iconId: stray,
        iconName: 'icon',
        code: 'E000',
        groupId: ranged,
        groupName: 'Nav',
        range: { start: dec('E100'), end: dec('E1FF') },
      },
    ]);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Group code-range validation
// ---------------------------------------------------------------------------

describe('validateGroupCodeRange', () => {
  test('null (clear) is always valid', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Nav');
    expect(validateGroupCodeRange(db, g, null)).toEqual({ ok: true });
    db.close();
  });

  test('rejects bounds outside the PUA with out-of-pua', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Nav');
    expect(validateGroupCodeRange(db, g, { start: dec('D000'), end: dec('E100') })).toEqual({
      ok: false,
      reason: 'out-of-pua',
    });
    expect(validateGroupCodeRange(db, g, { start: dec('E100'), end: dec('F900') })).toEqual({
      ok: false,
      reason: 'out-of-pua',
    });
    db.close();
  });

  test('rejects start > end with inverted', async () => {
    const db = await createEmptyProject('test');
    const g = uid();
    db.addGroup(g, 'Nav');
    expect(validateGroupCodeRange(db, g, { start: dec('E200'), end: dec('E100') })).toEqual({
      ok: false,
      reason: 'inverted',
    });
    db.close();
  });

  test('rejects overlap with another group and reports the conflicting group id', async () => {
    const db = await createEmptyProject('test');
    const a = uid();
    const b = uid();
    db.addGroup(a, 'Nav');
    db.addGroup(b, 'Media');
    db.setGroupCodeRange(a, dec('E100'), dec('E1FF'));

    expect(validateGroupCodeRange(db, b, { start: dec('E1F0'), end: dec('E2FF') })).toEqual({
      ok: false,
      reason: 'overlap',
      conflictGroupId: a,
    });
    // A group may re-declare its own (overlapping) range.
    expect(validateGroupCodeRange(db, a, { start: dec('E100'), end: dec('E1FF') })).toEqual({
      ok: true,
    });
    // Adjacent (non-overlapping) is fine.
    expect(validateGroupCodeRange(db, b, { start: dec('E200'), end: dec('E2FF') })).toEqual({
      ok: true,
    });
    db.close();
  });
});
