/**
 * Variant Guard Coverage Test
 *
 * Static analysis: scans all component files for direct calls to
 * icon-mutating database methods that should go through variantGuard.
 *
 * If this test fails, it means someone called a dangerous db method
 * without checking for variants first. Fix by:
 * 1. Adding checkVariants() before the call, OR
 * 2. If the call is intentionally unguarded (e.g., deleting a variant
 *    itself), add the file:line to the ALLOWED_UNGUARDED list below.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// Database methods that modify icons and SHOULD be guarded
const GUARDED_METHODS = [
  'db.delIcon',
  'db.moveIconGroup',
  'db.moveIcons',
  'db.renewIconData',
];

// Files + line descriptions that are intentionally unguarded.
// Each entry: "relative/path.tsx:reason"
const ALLOWED_UNGUARDED = [
  // VariantPanel deletes variant icons (which have no sub-variants)
  'src/renderer/components/SideEditor/VariantPanel.tsx:db.delIcon — deleting a variant itself, no sub-variants possible',
];

// Safe alternatives that already handle variants internally
const SAFE_ALTERNATIVES = [
  'db.deleteIconWithVariants',
  'db.moveIconWithVariants',
  'db.moveIconsWithVariants',
  'db.deleteVariants',
];

const COMPONENTS_DIR = join(__dirname, '../../src/renderer/components');

function getAllTsxFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...getAllTsxFiles(full));
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

describe('variant guard coverage', () => {
  const files = getAllTsxFiles(COMPONENTS_DIR);

  test('all component files found', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const filePath of files) {
    const relPath = relative(join(__dirname, '../..'), filePath).replace(/\\/g, '/');

    test(`${relPath} — no unguarded icon mutations`, () => {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const violations = [];

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

        for (const method of GUARDED_METHODS) {
          // Match the method but not safe alternatives (e.g., db.moveIcons but not db.moveIconsWithVariants)
          const methodRegex = new RegExp(method.replace('.', '\\.') + '(?!WithVariants|\\w)');
          if (!methodRegex.test(line)) continue;

          // Check if this file+method is in allowed list
          const isAllowed = ALLOWED_UNGUARDED.some(
            (entry) => entry.startsWith(relPath) && entry.includes(method)
          );
          if (isAllowed) continue;

          // Check if checkVariants is imported and called in same function scope
          // Simple heuristic: file must import checkVariants
          const hasGuardImport = content.includes('checkVariants');
          if (!hasGuardImport) {
            violations.push(
              `Line ${lineNum}: ${method}() called without variantGuard. ` +
              `Either add checkVariants() or use a safe alternative (${SAFE_ALTERNATIVES.join(', ')}). ` +
              `If intentionally unguarded, add to ALLOWED_UNGUARDED in this test.`
            );
          }
        }
      });

      if (violations.length > 0) {
        expect.fail(
          `Found ${violations.length} unguarded icon mutation(s) in ${relPath}:\n` +
          violations.map((v) => `  - ${v}`).join('\n')
        );
      }
    });
  }
});
