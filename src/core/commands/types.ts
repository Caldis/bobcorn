/**
 * Command-layer DTOs — plans, outcomes, and the shared warning vocabulary.
 *
 * Commands are synchronous pure-decision bodies: `fn(db: ProjectDb, args) → DTO`.
 * They own the variant-cascade decisions, out-of-range reassignment decisions,
 * and warning semantics that used to live inline in operations/. No file I/O —
 * reading/sanitizing/saving stays with the (Node-side) operations callers.
 *
 * Environment-agnostic and renderer-safe: commands only import
 * ../database/project-db, ../code-allocation, ../uuid and ../types.
 * Guarded by test/unit/core-boundary-guard.test.js (no Node builtins).
 */
import type { CodeRange } from '../code-allocation';

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

export type CommandWarning =
  /** Variants will be hard-deleted (delete/replace cascade). */
  | { type: 'variant-cascade-delete'; count: number }
  /** Variants follow their parent (move/recycle). */
  | { type: 'variant-follow'; count: number }
  /** Copy does not duplicate variants. */
  | { type: 'variant-not-copied'; count: number }
  /** Codes were reassigned into the target range during this command. */
  | { type: 'codes-reassigned'; count: number };

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

/** One code reassignment applied while moving into a ranged group. */
export interface CodeReassignment {
  id: string;
  oldCode: string;
  newCode: string;
}

export interface MovePlan {
  /** Normalized target group id ('resource-all' → 'resource-uncategorized'). */
  targetGroupId: string;
  /** Variants that will follow their parents. */
  variantCount: number;
  /**
   * Out-of-range summary when the target group declares a code range
   * (count = moved parents + variants whose code falls outside it), or null
   * when the target has no range.
   */
  outOfRange: null | { count: number; range: CodeRange; rangeFree: number };
}

export interface MoveOutcome {
  moved: number;
  /** Reassignments applied (only when opts.reassignOutOfRange). */
  reassigned: CodeReassignment[];
  warnings: CommandWarning[];
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete semantics:
 *   recycle   — parents AND variants move to 'resource-recycleBin' (recoverable)
 *   soft      — parents move to 'resource-deleted'; variants are hard-deleted
 *   permanent — parents AND variants are removed from the database entirely
 */
export type DeleteMode = 'recycle' | 'soft' | 'permanent';

export interface DeletePlan {
  /** Icons that actually exist and will be deleted. */
  count: number;
  /** Their variants (cascaded or following, depending on mode). */
  variantCount: number;
  warnings: CommandWarning[];
}

export interface DeleteOutcome {
  deleted: number;
  /** The icon ids actually deleted (existing rows only). */
  ids: string[];
  warnings: CommandWarning[];
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportItem {
  name: string;
  /** Already-sanitized SVG markup — file reading/sanitizing stays with the caller. */
  content: string;
  /** Icon type (defaults to 'svg'). */
  type?: string;
}

export interface ImportOutcome {
  added: number;
  /** Items that could not be imported (code-point exhaustion) — never thrown. */
  failed: number;
  /** Codes allocated past the batch baseline (new tail slots). */
  appended: number;
  /** Codes allocated at or below the batch baseline (reused holes). */
  filled: number;
  icons: { id: string; name: string; code: string }[];
  warnings: CommandWarning[];
  /**
   * The first per-item allocation error, or null when nothing failed. Callers
   * that keep the historical throw-on-exhaustion contract (CLI operations)
   * rethrow this; callers with per-item feedback (GUI) read `failed` instead.
   */
  firstError: Error | null;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export interface CopyOutcome {
  copied: number;
  /** Items not copied because the batch stopped on code-point exhaustion. */
  failed: number;
  icons: { id: string; name: string; code: string }[];
  warnings: CommandWarning[];
  /**
   * The error that stopped the batch (code-point exhaustion / missing source),
   * or null when every copy succeeded. Callers that keep the historical
   * throw contract (CLI operations) rethrow this.
   */
  stopError: Error | null;
}

// ---------------------------------------------------------------------------
// Replace
// ---------------------------------------------------------------------------

export interface ReplaceOutcome {
  warnings: CommandWarning[];
}

// ---------------------------------------------------------------------------
// Range violations
// ---------------------------------------------------------------------------

/** One icon whose code falls outside its own group's declared range. */
export interface RangeViolationRow {
  iconId: string;
  iconName: string;
  /** The icon's current (out-of-range or invalid) hex code. */
  code: string;
  groupId: string;
  groupName: string;
  /** The group's declared range the code violates. */
  range: CodeRange;
}

// ---------------------------------------------------------------------------
// Group code-range validation
// ---------------------------------------------------------------------------

export type RangeValidation =
  | { ok: true }
  | {
      ok: false;
      reason: 'out-of-pua' | 'inverted' | 'overlap';
      /** The overlapping group's id (reason 'overlap' only). */
      conflictGroupId?: string;
    };
