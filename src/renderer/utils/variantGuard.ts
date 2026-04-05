/**
 * Variant Guard — centralized check layer for icon operations
 *
 * Any operation that modifies, moves, or deletes an icon with variants
 * should go through this guard. It provides:
 * - Variant count detection
 * - Standardized warning UI (React node with highlighted variant info)
 * - Consistent cascade behavior across all operations
 *
 * Operations covered:
 * - recycle (move to bin): variants follow
 * - delete (permanent): variants cascade-deleted
 * - move (to group): variants follow
 * - copy (duplicate): variants NOT copied (only the icon itself)
 * - replace (swap SVG content): variants become stale → warn + delete
 */

import React from 'react';
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): icon.delete
import db from '../database';

export interface VariantGuardResult {
  /** Number of variants the icon has */
  count: number;
  /** Whether the icon has any variants */
  hasVariants: boolean;
  /** Whether the icon itself IS a variant */
  isVariant: boolean;
}

/**
 * Check variant status for an icon.
 */
export function checkVariants(iconId: string): VariantGuardResult {
  const isVariant = db.isVariant(iconId);
  const count = isVariant ? 0 : db.getVariantCount(iconId);
  return { count, hasVariants: count > 0, isVariant };
}

/**
 * Build a React node that appends a highlighted variant warning
 * below the main content message.
 *
 * @param mainContent - The primary message text
 * @param variantCount - Number of variants
 * @param t - i18n translate function
 * @param warningKey - i18n key for the variant warning (default: 'variant.deleteConfirm')
 */
export function buildVariantWarning(
  mainContent: string,
  variantCount: number,
  t: (key: string, opts?: any) => string,
  warningKey: string = 'variant.deleteConfirm'
): React.ReactNode {
  if (variantCount <= 0) return mainContent;

  return React.createElement(
    'div',
    null,
    React.createElement('p', null, mainContent),
    React.createElement(
      'p',
      {
        className:
          'mt-2 px-2.5 py-1.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium',
      },
      `⚠ ${t(warningKey, { count: variantCount })}`
    )
  );
}
