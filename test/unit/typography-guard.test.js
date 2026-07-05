/**
 * Typography Guard
 *
 * Static analysis that keeps text styling funnelled through the semantic
 * `.t-*` classes (defined in src/renderer/styles/globals.css) instead of
 * drifting back into ad-hoc utilities. See docs/TYPOGRAPHY.md.
 *
 * Two rules:
 *   1. No hardcoded Tailwind palette colors as TEXT color — use semantic
 *      tokens (text-foreground / -muted / -subtle, text-danger/warning/…).
 *      Decorative bg-/border-/fill-/stroke- palette colors are allowed.
 *   2. Raw `text-[Npx]` pixel sizes are only tolerated in a frozen set of
 *      files that legitimately need micro-labels / dark-bg tooltips /
 *      responsive dual-sizes. New components must use `.t-*`.
 *
 * The `RAW_PX_LEGACY` list is a ratchet: it may only shrink. When you remove
 * the last raw pixel from a file, drop it from the list. Goal: ZERO entries.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const COMPONENTS_DIR = join(__dirname, '../../src/renderer/components');
const REPO_ROOT = join(__dirname, '../..');

// Files grandfathered to keep raw `text-[Npx]` (micro-labels, dark-bg
// tooltips, responsive dual-size, tightly-tuned interactive controls).
// This list may only SHRINK — never add a new file. Goal: ZERO.
const RAW_PX_LEGACY = new Set([
  'src/renderer/components/IconBlock/index.tsx',
  'src/renderer/components/IconGridLocal/index.tsx',
  'src/renderer/components/CodeMatrix/index.tsx',
  'src/renderer/components/BatchPanel/index.tsx',
  'src/renderer/components/SideEditor/VariantPanel.tsx',
  'src/renderer/components/SideMenu/CodeCoverageMatrix.tsx',
  'src/renderer/components/SideMenu/ExportDialog.tsx',
  'src/renderer/components/SideMenu/FileMenuBar.tsx',
  'src/renderer/components/SideMenu/GroupDialogs.tsx',
  'src/renderer/components/SideMenu/UpdateIndicator.tsx',
  'src/renderer/components/SideMenu/SettingsDialog.tsx',
  'src/renderer/components/SideMenu/ProjectSettingsDialog.tsx',
]);

// Tailwind palette hues that must never be used as a TEXT color.
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const TEXT_PALETTE = new RegExp(`\\btext-(?:${PALETTE})-\\d`);
const RAW_PX = /text-\[\d+px\]/;

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (/\.(tsx|jsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

function rel(file) {
  return relative(REPO_ROOT, file).replace(/\\/g, '/');
}

describe('Typography guard', () => {
  const files = walk(COMPONENTS_DIR);

  test('no hardcoded palette colors used as text color', () => {
    const violations = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      content.split('\n').forEach((line, i) => {
        if (TEXT_PALETTE.test(line) && !line.trimStart().startsWith('//')) {
          violations.push(`${rel(file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      violations,
      `Hardcoded palette text colors found — use a semantic token ` +
        `(text-foreground/-muted/-subtle, text-danger/warning/success/info/accent):\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  test('raw text-[Npx] only appears in grandfathered files', () => {
    const offenders = [];
    for (const file of files) {
      const r = rel(file);
      const content = readFileSync(file, 'utf8');
      if (RAW_PX.test(content) && !RAW_PX_LEGACY.has(r)) {
        offenders.push(r);
      }
    }
    expect(
      offenders,
      `New file(s) use raw text-[Npx]. Use a semantic .t-* class ` +
        `(see docs/TYPOGRAPHY.md) instead of hardcoding pixel sizes:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('RAW_PX_LEGACY has no stale entries (ratchet only shrinks)', () => {
    const actual = new Set();
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (RAW_PX.test(content)) actual.add(rel(file));
    }
    const stale = [...RAW_PX_LEGACY].filter((f) => !actual.has(f));
    expect(
      stale,
      `Stale RAW_PX_LEGACY entries — these files no longer use raw text-[Npx], ` +
        `remove them from the list:\n${stale.join('\n')}`,
    ).toEqual([]);
  });
});
