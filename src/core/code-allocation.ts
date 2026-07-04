/**
 * Icon code-point allocation — the single source of truth shared by the CLI
 * (src/core/database/index.ts#getNewIconCode) and the GUI
 * (src/renderer/database/index.ts#getNewIconCode). Both sides call the SAME
 * pure function so their allocation results can never silently diverge
 * (guarded by test/unit/core-code-allocation.test.ts + the group-range tests).
 *
 * Pure and environment-agnostic: no DB handle, no browser globals, no Node
 * deps. Callers gather the current usage + declared group ranges via SQL and
 * hand the raw numbers in.
 *
 * Allocation semantics (see docs/superpowers/specs/2026-07-04-group-code-ranges-design.md):
 *   target group has a range R = [start, end]:
 *     append — code past the highest used code inside R; when R's tail is full,
 *              fall back to filling the lowest free hole inside R; R full →
 *              GROUP_RANGE_EXHAUSTED.
 *     fill   — the lowest free code inside R; R full → GROUP_RANGE_EXHAUSTED.
 *   global pool (unassigned / no-range group) = PUA − union(all declared ranges):
 *     append/fill as today, but skipping every reserved (declared-range) code
 *     point; pool exhausted → PUA_EXHAUSTED.
 */

/** Private-Use-Area bounds (decimal). 6400 code points E000-F8FF. */
export const PUA_MIN = 0xe000; // 57344
export const PUA_MAX = 0xf8ff; // 63743

export type AllocationMode = 'append' | 'fill';

/** A declared code range, decimal-inclusive [start, end]. */
export interface CodeRange {
  start: number;
  end: number;
}

/**
 * Allocate the next free icon code point (decimal).
 *
 * @param mode - append (default GUI/CLI behaviour) or fill (hole-first)
 * @param usedSet - every code point currently in use (decimal; NaN entries ignored by callers)
 * @param targetRange - the target group's declared range, or null for the global pool
 * @param reservedRanges - all declared group ranges (used to carve the global pool); ignored when targetRange is set
 * @throws Error('GROUP_RANGE_EXHAUSTED') when the target range is full
 * @throws Error('PUA_EXHAUSTED: ...') when the global pool is full
 */
export function allocateIconCodeDec(
  mode: AllocationMode,
  usedSet: Set<number>,
  targetRange: CodeRange | null,
  reservedRanges: CodeRange[] = [],
  puaMin: number = PUA_MIN,
  puaMax: number = PUA_MAX
): number {
  // ── Target group has a declared range → allocate strictly inside it ──
  if (targetRange) {
    const code = allocateInBounds(mode, usedSet, targetRange.start, targetRange.end);
    if (code === null) {
      throw new Error(
        `GROUP_RANGE_EXHAUSTED: all code points in the group range ` +
          `${hex(targetRange.start)}-${hex(targetRange.end)} are in use`
      );
    }
    return code;
  }

  // ── Global pool = PUA minus every declared range (reserved code points) ──
  const isReserved = (c: number): boolean => reservedRanges.some((r) => c >= r.start && c <= r.end);

  if (mode === 'append') {
    // Highest used code that belongs to the global pool (reserved codes ignored).
    let highest = puaMin - 1;
    usedSet.forEach((c) => {
      if (Number.isFinite(c) && c >= puaMin && c <= puaMax && !isReserved(c) && c > highest) {
        highest = c;
      }
    });
    // The smallest free, non-reserved code above the highest used one.
    for (let c = highest + 1; c <= puaMax; c++) {
      if (!isReserved(c) && !usedSet.has(c)) return c;
    }
    // Tail full — fall through to hole-filling in the pool.
  }

  for (let c = puaMin; c <= puaMax; c++) {
    if (!isReserved(c) && !usedSet.has(c)) return c;
  }
  throw new Error('PUA_EXHAUSTED: all 6400 code points (E000-F8FF) are in use');
}

/**
 * Allocate a code point within the inclusive bounds [start, end].
 * Returns null when every code point in the range is used.
 * Exported so the move-reassignment path can allocate directly into a range.
 */
export function allocateInBounds(
  mode: AllocationMode,
  usedSet: Set<number>,
  start: number,
  end: number
): number | null {
  if (mode === 'append') {
    // Highest used code inside the range (defaults to start-1 when the range is empty).
    let highest = start - 1;
    usedSet.forEach((c) => {
      if (Number.isFinite(c) && c >= start && c <= end && c > highest) highest = c;
    });
    const next = highest + 1;
    if (next <= end) return next; // guaranteed free (greater than every used code in range)
    // Tail full — fall back to hole-filling inside the range.
  }
  for (let c = start; c <= end; c++) {
    if (!usedSet.has(c)) return c;
  }
  return null;
}

/** Uppercase hex string of a decimal code point (e.g. 57344 → "E000"). */
export function hex(dec: number): string {
  return dec.toString(16).toUpperCase();
}

/**
 * Highest used code point inside the inclusive bounds [start, end], or
 * `start - 1` when the range holds no used code. This is the batch baseline the
 * GUI's import feedback compares against to classify each freshly-allocated
 * code as "appended" (dec > baseline, a new tail slot) vs "filled" (dec <=
 * baseline, a reused hole). Using the range's own baseline — instead of the
 * global highest-used code — keeps the appended/filled split meaningful when
 * icons are imported into a group whose range sits below other groups' codes.
 */
export function highestUsedInRange(usedSet: Set<number>, start: number, end: number): number {
  let highest = start - 1;
  usedSet.forEach((c) => {
    if (Number.isFinite(c) && c >= start && c <= end && c > highest) highest = c;
  });
  return highest;
}

export interface RangeReassignment {
  id: string;
  oldCode: string;
  newCode: string;
}

/**
 * Plan the reassignment of out-of-range icons into a group's range. Shared by
 * the CLI (core moveIcons) and the GUI (renderer moveIcon*WithVariants) so both
 * produce identical new codes for the same input.
 *
 * `usedSet` is a snapshot of every used code point taken once for the batch; it
 * is mutated as codes are allocated so the batch never self-collides. Rows
 * already inside the range are left untouched.
 *
 * @param mode - allocation mode within the range ('append' default)
 * @param usedSet - baseline of all used code points (decimal); mutated in place
 * @param affected - candidate rows (parents + variants) as { id, code (hex) }
 * @param range - the target group's range
 * @throws Error('GROUP_RANGE_EXHAUSTED') when the range cannot fit every out-of-range icon
 */
export function planRangeReassignments(
  mode: AllocationMode,
  usedSet: Set<number>,
  affected: { id: string; code: string }[],
  range: CodeRange
): RangeReassignment[] {
  const out: RangeReassignment[] = [];
  for (const row of affected) {
    const oldDec = parseInt(row.code, 16);
    const inRange = Number.isFinite(oldDec) && oldDec >= range.start && oldDec <= range.end;
    if (inRange) continue;
    const newDec = allocateInBounds(mode, usedSet, range.start, range.end);
    if (newDec === null) {
      throw new Error(
        `GROUP_RANGE_EXHAUSTED: all code points in the group range ` +
          `${hex(range.start)}-${hex(range.end)} are in use`
      );
    }
    if (Number.isFinite(oldDec)) usedSet.delete(oldDec);
    usedSet.add(newDec);
    out.push({ id: row.id, oldCode: row.code, newCode: hex(newDec) });
  }
  return out;
}
