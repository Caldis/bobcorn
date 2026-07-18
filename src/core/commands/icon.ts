/**
 * Icon commands — synchronous pure-decision bodies over an open ProjectDb.
 *
 * Each command is `fn(db, args) → DTO` (sql.js is synchronous; commands do no
 * I/O). They collect the variant-cascade decisions, out-of-range reassignment
 * decisions and warning semantics that used to live inline in
 * src/core/operations/icon.ts, so the (Node) operations layer and, later, the
 * GUI store call the exact same bodies.
 *
 * Environment-agnostic and renderer-safe: only imports ../database/project-db,
 * ../code-allocation, ../uuid, ../types and ./types. Guarded by
 * test/unit/core-boundary-guard.test.js.
 */
import type { ProjectDb } from '../database/project-db';
import type { CodeAllocationMode } from '../types';
import { highestUsedInRange, PUA_MIN, PUA_MAX, type CodeRange } from '../code-allocation';
import { generateUUID } from '../uuid';
import type {
  CommandWarning,
  CopyOutcome,
  DeleteMode,
  DeleteOutcome,
  DeletePlan,
  ImportItem,
  ImportOutcome,
  MoveOutcome,
  MovePlan,
  RangeViolationRow,
  ReplaceOutcome,
} from './types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Environment-agnostic byte length (avoids Node-only Buffer). */
const textEncoder = new TextEncoder();
function byteLength(str: string): number {
  return textEncoder.encode(str).length;
}

/** The virtual 'resource-all' group resolves to uncategorized for writes. */
function normalizeGroupId(groupId: string): string {
  return groupId === 'resource-all' ? 'resource-uncategorized' : groupId;
}

/** True when a hex code parses and falls inside the inclusive range. */
function codeInRange(code: string, range: CodeRange): boolean {
  const dec = parseInt(code, 16);
  return Number.isFinite(dec) && dec >= range.start && dec <= range.end;
}

/** Total variant count across the given parent ids. */
function countVariants(db: ProjectDb, ids: string[]): number {
  let count = 0;
  for (const id of ids) {
    count += db.getVariantCount(id);
  }
  return count;
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

/**
 * Plan a move: normalized target, how many variants will follow, and — when the
 * target group declares a code range — how many affected rows (parents +
 * variants) currently sit outside that range plus the range's free capacity.
 */
export function planMoveIcons(db: ProjectDb, ids: string[], targetGroupId: string): MovePlan {
  const target = normalizeGroupId(targetGroupId);
  const variantCount = countVariants(db, ids);

  const range = db.getGroupCodeRange(target);
  let outOfRange: MovePlan['outOfRange'] = null;
  if (range) {
    let count = 0;
    for (const id of ids) {
      const icon = db.getIcon(id);
      if (icon && !codeInRange(String(icon.iconCode ?? ''), range)) count += 1;
      for (const variant of db.getVariants(id)) {
        if (!codeInRange(String(variant.iconCode ?? ''), range)) count += 1;
      }
    }
    const occupancy = db.getRangeOccupancy(range.start, range.end);
    outOfRange = { count, range, rangeFree: occupancy.free };
  }

  return { targetGroupId: target, variantCount, outOfRange };
}

/**
 * Move icons (variants always follow their parents). Codes are kept as-is by
 * default — moving out-of-range icons without reassignOutOfRange is legal and
 * leaves their codes untouched. With reassignOutOfRange and a ranged target,
 * every out-of-range row is reallocated inside the range (one shared baseline;
 * throws GROUP_RANGE_EXHAUSTED when the range cannot fit them all).
 */
export function moveIcons(
  db: ProjectDb,
  ids: string[],
  targetGroupId: string,
  opts?: { reassignOutOfRange?: boolean; codeMode?: CodeAllocationMode }
): MoveOutcome {
  const plan = planMoveIcons(db, ids, targetGroupId);

  db.moveIcons(ids, plan.targetGroupId);

  const reassigned = opts?.reassignOutOfRange
    ? db.reassignIconsIntoRange(ids, plan.targetGroupId, opts?.codeMode)
    : [];

  const warnings: CommandWarning[] = [];
  if (plan.variantCount > 0) warnings.push({ type: 'variant-follow', count: plan.variantCount });
  if (reassigned.length > 0) warnings.push({ type: 'codes-reassigned', count: reassigned.length });

  return { moved: ids.length, reassigned, warnings };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

function deleteWarnings(mode: DeleteMode, variantCount: number): CommandWarning[] {
  if (variantCount === 0) return [];
  return mode === 'recycle'
    ? [{ type: 'variant-follow', count: variantCount }]
    : [{ type: 'variant-cascade-delete', count: variantCount }];
}

/**
 * Plan a delete: how many of the ids actually exist, how many variants are
 * affected, and the mode-dependent variant warning (recycle keeps variants
 * with their parent; soft/permanent hard-delete them).
 */
export function planDeleteIcons(db: ProjectDb, ids: string[], mode: DeleteMode): DeletePlan {
  const validIds = ids.filter((id) => db.getIcon(id) !== null);
  const variantCount = countVariants(db, validIds);
  return {
    count: validIds.length,
    variantCount,
    warnings: deleteWarnings(mode, variantCount),
  };
}

/**
 * Delete icons in one of three modes:
 *   recycle   → db.recycleIcons (parents + variants into the recycle bin)
 *   soft      → db.softDeleteIcons (parents to 'resource-deleted', variants hard-deleted)
 *   permanent → db.permanentDeleteIcons (parents + variants removed entirely)
 * Missing ids are skipped (mirrors the historical operations behaviour).
 */
export function deleteIcons(db: ProjectDb, ids: string[], mode: DeleteMode): DeleteOutcome {
  const plan = planDeleteIcons(db, ids, mode);
  const validIds = ids.filter((id) => db.getIcon(id) !== null);

  if (mode === 'recycle') {
    db.recycleIcons(validIds);
  } else if (mode === 'soft') {
    db.softDeleteIcons(validIds);
  } else {
    db.permanentDeleteIcons(validIds);
  }

  return { deleted: validIds.length, ids: validIds, warnings: plan.warnings };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Import already-sanitized icons into a group. Codes are allocated per item via
 * the shared allocator (inside the target group's range when it declares one).
 *
 * The batch baseline — the highest used code inside the target range, or inside
 * the whole PUA for unranged targets — is taken ONCE before the loop; each
 * allocated code is classified against it as appended (dec > baseline, a new
 * tail slot) or filled (dec <= baseline, a reused hole). Mirrors the renderer
 * addIcons feedback semantics (src/renderer/database/index.ts#addIcons).
 *
 * Per-item PUA/GROUP_RANGE exhaustion is counted into `failed` — never thrown.
 * The first error is surfaced as `firstError` for callers that keep the
 * historical throw contract.
 */
export function importIcons(
  db: ProjectDb,
  items: ImportItem[],
  opts?: { targetGroupId?: string; codeMode?: CodeAllocationMode }
): ImportOutcome {
  const target = normalizeGroupId(opts?.targetGroupId ?? 'resource-uncategorized');

  // Batch baseline (taken once): range-local when the target declares a range,
  // global PUA highest otherwise.
  const usedSet = db.getUsedIconCodesDec();
  const range = db.getGroupCodeRange(target);
  const baselineMaxCode = range
    ? highestUsedInRange(usedSet, range.start, range.end)
    : highestUsedInRange(usedSet, PUA_MIN, PUA_MAX);

  let added = 0;
  let failed = 0;
  let appended = 0;
  let filled = 0;
  let firstError: Error | null = null;
  const icons: { id: string; name: string; code: string }[] = [];

  for (const item of items) {
    let iconCode: string;
    try {
      iconCode = db.getNewIconCode(opts?.codeMode, target);
    } catch (err) {
      failed += 1;
      if (!firstError) firstError = toError(err);
      continue;
    }

    const id = generateUUID();
    db.addIcon({
      id,
      iconCode,
      iconName: item.name,
      iconGroup: target,
      iconSize: byteLength(item.content),
      iconType: item.type ?? 'svg',
      iconContent: item.content,
    });

    added += 1;
    const dec = parseInt(iconCode, 16);
    if (Number.isFinite(dec) && dec > baselineMaxCode) {
      appended += 1;
    } else {
      filled += 1;
    }
    icons.push({ id, name: item.name, code: iconCode });
  }

  return { added, failed, appended, filled, icons, warnings: [], firstError };
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * Copy icons into a target group (new UUID + freshly allocated code each).
 * Variants are NOT copied (variant-not-copied warning). The batch stops at the
 * first failure — code-point exhaustion would fail every remaining copy too —
 * counting the rest into `failed` and surfacing the error as `stopError`.
 */
export function copyIcons(
  db: ProjectDb,
  ids: string[],
  targetGroupId: string,
  opts?: { codeMode?: CodeAllocationMode }
): CopyOutcome {
  const target = normalizeGroupId(targetGroupId);
  const variantCount = countVariants(db, ids);

  const icons: { id: string; name: string; code: string }[] = [];
  let stopError: Error | null = null;
  for (const sourceId of ids) {
    try {
      const result = db.copyIcon(sourceId, target, opts?.codeMode);
      icons.push({ id: result.id, name: result.iconName, code: result.iconCode });
    } catch (err) {
      stopError = toError(err);
      break; // 码点耗尽即停 — 剩余项全部计入 failed
    }
  }

  const warnings: CommandWarning[] = [];
  if (variantCount > 0) warnings.push({ type: 'variant-not-copied', count: variantCount });

  return {
    copied: icons.length,
    failed: ids.length - icons.length,
    icons,
    warnings,
    stopError,
  };
}

// ---------------------------------------------------------------------------
// Replace
// ---------------------------------------------------------------------------

/**
 * Replace an icon's content (sets iconContent + iconContentOriginal + size).
 * Any variants are hard-deleted first (variant-cascade-delete warning) — they
 * derive from the old artwork and never outlive it.
 */
export function replaceIconContent(db: ProjectDb, id: string, content: string): ReplaceOutcome {
  const variantCount = db.getVariantCount(id);
  db.replaceIconContent(id, content);

  const warnings: CommandWarning[] = [];
  if (variantCount > 0) warnings.push({ type: 'variant-cascade-delete', count: variantCount });
  return { warnings };
}

// ---------------------------------------------------------------------------
// Range violations
// ---------------------------------------------------------------------------

/**
 * Every icon whose code falls outside its own group's declared range (parents
 * AND variants). Groups without a range are not checked. Feeds the operations
 * rangeViolations DTO and the (future) store out-of-range refresh.
 */
export function rangeViolations(db: ProjectDb): RangeViolationRow[] {
  const out: RangeViolationRow[] = [];
  for (const r of db.getGroupRanges()) {
    for (const row of db.getGroupIconsOutOfRange(r.id, r.start, r.end)) {
      out.push({
        iconId: row.id,
        iconName: row.iconName,
        code: row.iconCode,
        groupId: r.id,
        groupName: r.groupName,
        range: { start: r.start, end: r.end },
      });
    }
  }
  return out;
}
