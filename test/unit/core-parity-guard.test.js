/**
 * Core Parity Guard
 *
 * Two static-analysis mechanisms that make CLI-first the enforced default and
 * stop the GUI and CLI from silently diverging:
 *
 *   1. FROZEN RENDERER DATABASE SURFACE
 *      `src/renderer/database/index.ts` is the legacy sql.js class that still
 *      holds most of the GUI's business logic. Its current public method set is
 *      frozen below (RENDERER_DB_LEGACY_METHODS). Any method that is NOT in the
 *      frozen list — i.e. a brand-new method added to the renderer database —
 *      fails the test. New business capability must be built CLI-first (core
 *      operation + registry + CLI command), never bolted onto renderer database.
 *
 *   2. REGISTRY → CLI COVERAGE
 *      Every operation in `src/core/registry.ts` that declares a cliCommand must
 *      have that command actually registered in `src/cli/index.ts`. This catches
 *      the "core has it, CLI forgot to expose it" half-migration.
 *
 * These complement (they don't replace) core-boundary-guard (renderer → core
 * import boundary) and the migration dashboard (scripts/migration-status.js).
 *
 * NOTE: we deliberately do NOT guard renderer store/index.ts the same way — UI
 * state legitimately grows over time, so freezing it would produce noise.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OPERATIONS } from '../../src/core/registry';

const REPO_ROOT = join(__dirname, '../..');
const RENDERER_DB = join(REPO_ROOT, 'src/renderer/database/index.ts');
const CLI_ENTRY = join(REPO_ROOT, 'src/cli/index.ts');

// ---------------------------------------------------------------------------
// Mechanism 1 — frozen renderer database method surface
// ---------------------------------------------------------------------------

/**
 * FROZEN allow-list of the renderer Database class's method surface as of the
 * core-migration mechanism work. These are LEGACY STOCK — the goal is to shrink
 * this file by migrating logic into src/core, NOT to grow it.
 *
 * If this test fails because a method here is unknown, DO NOT just add the name.
 * New business capability must be CLI-first: implement it in src/core/operations,
 * register it in src/core/registry.ts, expose a CLI command in src/cli/index.ts,
 * and have the GUI call it via a thin store wrapper.
 *
 * Only add a name here if the method is genuinely a renderer-only, pure-UI helper
 * with no business semantics (e.g. a view aggregation) — and say why in the PR.
 *
 * (Removing a name when its method is deleted is optional housekeeping; a stale
 * entry here is harmless — the guard only fails on methods NOT listed.)
 */
const RENDERER_DB_LEGACY_METHODS = new Set([
  // ── mutation tracking / SQL plumbing ──
  'registerOnMutation',
  'notifyMutation',
  'init',
  'initDatabases',
  'buildDataSTMT',
  'addDataToTable',
  'setDataOfTable',
  'getDataOfTable',
  'delDataOfTable',
  'runMutation',
  'getDataCountsOfTable',
  'destroyDatabase',
  // ── project ──
  'initNewProject',
  'initNewProjectFromData',
  'migrateVariantColumns',
  'resetProject',
  'exportProject',
  'setProjectAttributes',
  'getProjectAttributes',
  'setProjectName',
  'getProjectName',
  'getProjectDisplayName',
  'setProjectDisplayName',
  'getProjectDescription',
  'setProjectDescription',
  'getProjectColor',
  'setProjectColor',
  'getProjectStats',
  // ── group ──
  'addGroupData',
  'setGroupData',
  'getGroupData',
  'addGroup',
  'delGroup',
  'getGroupList',
  'reorderGroups',
  'setGroupName',
  'setGroupInfo',
  'ensureGroupDescriptionColumn',
  'ensureGroupIconColumn',
  'getGroupName',
  // ── icon (helpers + queries) ──
  'setIconData',
  'getIconData',
  'checkIconCodeDuplicate',
  'formatIconDataFromFilePath',
  'formatIconDataFromData',
  'formatIconDataFromCpData',
  'getDuplicateIconCodes',
  'getAllIconCodes',
  'getHighestUsedIconCodeDec',
  'getNewIconCode',
  'requireNewIconCode',
  'planIconCodeFixes',
  'applyIconCodeFixes',
  'iconCodeInRange',
  'iconCodeCanUse',
  // ── icon (import) ──
  'addIcons',
  'addIconsFromData',
  'addIconsFromCpData',
  // ── icon (mutations / queries) ──
  'delIcon',
  'getIconCount',
  'getIconCountFromGroup',
  'getRecentlyUpdatedIcons',
  'getExportIconCodeMeta',
  'getIconList',
  'getAllIconsGrouped',
  'getIconContent',
  'getIconContentBatch',
  'ensureOriginalContent',
  'getOriginalContent',
  'getIconListFromGroup',
  'setIconName',
  'setIconCode',
  'moveIconGroup',
  'duplicateIconGroup',
  'moveIcons',
  'moveIconsWithVariants',
  'delIcons',
  'duplicateIcons',
  'updateIconsColor',
  // ── favorites ──
  'setIconFavorite',
  'setIconsFavorite',
  'getFavoriteIcons',
  'getFavoriteCount',
  // ── variants ──
  'addVariant',
  'getVariants',
  'getVariantCount',
  'getAllVariantCounts',
  'hasVariant',
  'deleteVariants',
  'moveIconWithVariants',
  'deleteIconWithVariants',
  'isVariant',
  'renewIconData',
  // ── misc ──
  'test',
]);

/**
 * Parse the class-field method definitions of the renderer Database class.
 *
 * The class defines every method as an arrow-function class field at exactly
 * two-space indentation, e.g.:
 *   `  getIconList = (): Record<string, any>[] => {`
 *   `  private runMutation = (sql: string, params?: any[]): void => {`
 *   `  init = async (): Promise<this> => {`
 *
 * The regex requires exactly two leading spaces (so nested `const x = (...)` at
 * 4+ spaces and top-level `const foo = (...)` at 0 spaces are ignored), an
 * optional access modifier, an identifier, `=`, an optional `async`, then `(`.
 * Plain property fields (`db: SqlJsDatabase | null`, `static ICON_META_COLS =
 * 'id, ...'`) and interface members (`run(sql): ...`) do not match because they
 * lack the `= (` shape. Tolerant of formatting: return-type annotations live
 * after the params, not before the `=`.
 */
function parseRendererDbMethods(source) {
  const methodRe =
    /^ {2}(?:(?:private|public|protected|static|readonly)\s+)*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s+)?\(/;
  const found = new Set();
  for (const line of source.split('\n')) {
    const m = methodRe.exec(line);
    if (m) found.add(m[1]);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Mechanism 2 — registry → CLI command coverage
// ---------------------------------------------------------------------------

/**
 * Operations that intentionally declare a cliCommand string in the registry but
 * are NOT expected to have a real command registration in cli/index.ts.
 * Currently EMPTY — every non-null cliCommand is really wired up (Canvas/DOM
 * ops like `variant generate` / `export icon` are registered as stubs that
 * print NOT_AVAILABLE_HEADLESS, which still counts as registered).
 * If you must exempt one, add `op.id` here WITH a reason comment.
 */
const CLI_COVERAGE_EXEMPTIONS = new Set([]);

/**
 * Collect the set of command tokens registered in cli/index.ts.
 * Every commander command — parent group or leaf — is declared as
 * `.command('<token> ...')`; we capture the first token of each.
 * A registry cliCommand like "group move-icons" is considered covered when
 * every space-separated word ("group", "move-icons") is a registered token
 * (parent groups are themselves registered via `.command('group')`).
 */
function parseCliCommandTokens(source) {
  const tokenRe = /\.command\(\s*['"`]([A-Za-z][\w-]*)/g;
  const tokens = new Set();
  let m;
  while ((m = tokenRe.exec(source)) !== null) {
    tokens.add(m[1]);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('core parity guard', () => {
  test('no new methods on renderer database (build new capability CLI-first)', () => {
    const source = readFileSync(RENDERER_DB, 'utf8');
    const methods = parseRendererDbMethods(source);

    // Sanity: the parser must actually find the class surface.
    expect(methods.size).toBeGreaterThan(50);

    const unexpected = [...methods].filter((name) => !RENDERER_DB_LEGACY_METHODS.has(name));

    expect(
      unexpected,
      `New method(s) found on src/renderer/database/index.ts:\n` +
        unexpected.map((n) => `  - ${n}`).join('\n') +
        `\n\nNew business capability must be CLI-first: implement it in ` +
        `src/core/operations, register it in src/core/registry.ts, expose a CLI ` +
        `command in src/cli/index.ts, and have the GUI call it through a thin ` +
        `store wrapper. Do NOT add methods to the renderer database.\n` +
        `If this is genuinely a renderer-only pure-UI helper with no business ` +
        `semantics, add its name to RENDERER_DB_LEGACY_METHODS in this test and ` +
        `explain why in the PR.`,
    ).toEqual([]);
  });

  test('every registry cliCommand is registered in the CLI', () => {
    const cliSource = readFileSync(CLI_ENTRY, 'utf8');
    const tokens = parseCliCommandTokens(cliSource);

    // Sanity: the parser must actually find commands.
    expect(tokens.size).toBeGreaterThan(10);

    const missing = [];
    for (const op of OPERATIONS) {
      if (op.cliCommand === null) continue; // internal / implicit — no CLI surface
      if (CLI_COVERAGE_EXEMPTIONS.has(op.id)) continue;
      const words = op.cliCommand.split(/\s+/).filter(Boolean);
      const gap = words.filter((w) => !tokens.has(w));
      if (gap.length > 0) {
        missing.push(`${op.id} → "${op.cliCommand}" (unregistered: ${gap.join(', ')})`);
      }
    }

    expect(
      missing,
      `Registry declares a cliCommand with no matching command in ` +
        `src/cli/index.ts (core has it, CLI forgot to expose it):\n` +
        missing.map((m) => `  - ${m}`).join('\n') +
        `\n\nRegister the command in src/cli/index.ts, or if the op should not ` +
        `have a CLI surface set its cliCommand to null in the registry. To ` +
        `intentionally exempt an op, add its id to CLI_COVERAGE_EXEMPTIONS here ` +
        `with a reason.`,
    ).toEqual([]);
  });
});
