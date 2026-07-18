/**
 * Group commands — synchronous pure-decision bodies over an open ProjectDb.
 *
 * Environment-agnostic and renderer-safe: only imports ../database/project-db,
 * ../code-allocation and ./types. Guarded by
 * test/unit/core-boundary-guard.test.js.
 */
import type { ProjectDb } from '../database/project-db';
import { PUA_MIN, PUA_MAX, type CodeRange } from '../code-allocation';
import type { RangeValidation } from './types';

/**
 * Validate a group's prospective code range (null = clear, always valid):
 *   - both bounds inside the PUA range E000-F8FF → otherwise 'out-of-pua'
 *   - start <= end → otherwise 'inverted'
 *   - no overlap with any OTHER group's declared range → otherwise 'overlap'
 *     (with the conflicting group's id)
 * Checks run in that order, mirroring the historical operations validation, so
 * an input violating several rules reports the same reason as before.
 */
export function validateGroupCodeRange(
  db: ProjectDb,
  groupId: string,
  range: CodeRange | null
): RangeValidation {
  if (range === null) return { ok: true };

  const { start, end } = range;
  if (start < PUA_MIN || end > PUA_MAX) {
    return { ok: false, reason: 'out-of-pua' };
  }
  if (start > end) {
    return { ok: false, reason: 'inverted' };
  }

  const conflict = db
    .getGroupRanges()
    .find((other) => other.id !== groupId && start <= other.end && other.start <= end);
  if (conflict) {
    return { ok: false, reason: 'overlap', conflictGroupId: conflict.id };
  }

  return { ok: true };
}
