/**
 * Core Boundary Guard
 *
 * Static analysis to enforce the core/renderer boundary during migration:
 * 1. No unapproved database imports in renderer (tracks migration progress)
 * 2. No browser globals in core (keeps core CLI-compatible)
 * 3. Every CLI-exposed Core operation has a registered command
 *
 * As operations are migrated from renderer → core, remove entries from
 * APPROVED_LEGACY. The goal is to reach ZERO entries.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { OPERATIONS } from '../../src/core/registry';

// Approved legacy imports — these files are known to import from database directly.
// As operations are migrated to core, remove entries from this list.
// The goal is to reach ZERO entries.
const APPROVED_LEGACY = new Set([
  'src/renderer/bootstrap.tsx',
  'src/renderer/store/index.ts',
  'src/renderer/containers/MainContainer/index.tsx',
  'src/renderer/components/IconBlock/index.tsx',
  'src/renderer/components/IconGridLocal/index.tsx',
  'src/renderer/components/IconInfoBar/index.tsx',
  'src/renderer/components/GroupIconPreview.tsx',
  'src/renderer/components/BatchPanel/index.tsx',
  'src/renderer/components/SideEditor/index.tsx',
  'src/renderer/components/SideEditor/VariantPanel.tsx',
  'src/renderer/components/SideMenu/index.tsx',
  'src/renderer/components/SideMenu/GroupList.tsx',
  'src/renderer/components/SideMenu/GroupDialogs.tsx',
  'src/renderer/components/SideMenu/ExportDialog.tsx',
  'src/renderer/components/SideMenu/ProjectSettingsDialog.tsx',
  'src/renderer/components/SideMenu/CodeCoverageMatrix.tsx',
  'src/renderer/components/SideMenu/codeAudit.ts',
  'src/renderer/components/SideMenu/ResourceNav.tsx',
  'src/renderer/utils/generators/demopageGenerator/index.ts',
  'src/renderer/utils/loaders/cpLoader/index.ts',
  'src/renderer/utils/loaders/icpLoader/index.ts',
]);

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

describe('Core boundary guard', () => {
  test('no unapproved database imports in renderer', () => {
    const rendererDir = join(__dirname, '../../src/renderer');
    const rendererFiles = walk(rendererDir);
    const dbImportPattern =
      /(?:import .+ from ['"].*\/database['"]|require\(['"].*\/database['"]\))/;
    const violations = [];

    for (const file of rendererFiles) {
      const rel = relative(join(__dirname, '../..'), file).replace(/\\/g, '/');
      // database module itself is fine
      if (rel.startsWith('src/renderer/database/')) continue;
      const content = readFileSync(file, 'utf8');
      if (dbImportPattern.test(content) && !APPROVED_LEGACY.has(rel)) {
        violations.push(rel);
      }
    }

    expect(
      violations,
      `Unapproved database imports found. Add to APPROVED_LEGACY or migrate to core:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  test('no window/browser globals in core', () => {
    const coreDir = join(__dirname, '../../src/core');
    let coreFiles;
    try {
      coreFiles = walk(coreDir);
    } catch {
      return; // core might not exist yet
    }
    const browserGlobals = /\b(window\.|document\.|navigator\.|import\.meta\.env)/;
    const violations = [];

    for (const file of coreFiles) {
      const content = readFileSync(file, 'utf8');
      const rel = relative(join(__dirname, '../..'), file).replace(/\\/g, '/');
      content.split('\n').forEach((line, i) => {
        if (browserGlobals.test(line) && !line.trimStart().startsWith('//')) {
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      violations,
      `Browser globals found in core:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  test('every CLI-exposed core operation has a command', () => {
    const cliExposed = OPERATIONS.filter(
      (op) => op.status === 'core' && op.cliCommand !== null,
    );
    // This test will matter once operations are migrated. For now, just verify structure.
    // When operations start being migrated to Core, this test ensures CLI commands keep up.
    for (const op of cliExposed) {
      expect(op.cliCommand).toBeTruthy();
    }
  });

  test('renderer must not import the core database barrel or lifecycle', () => {
    const rendererDir = join(__dirname, '../../src/renderer');
    const rendererFiles = walk(rendererDir);
    // The core database barrel re-exports lifecycle, which owns
    // require('sql.js/dist/sql-asm.js') and file I/O — importing it from the
    // renderer would drag Node-only loading into the browser bundle.
    // Renderer-safe deep paths are allowed: @core/database/project-db and
    // @core/database/safe-stmt.
    const barrelImport =
      /['"](?:@core\/database|[^'"]*\/core\/database)['"]/; // exact barrel specifier (no deep path)
    const lifecycleImport = /['"][^'"]*core\/database\/lifecycle['"]/;
    const violations = [];

    for (const file of rendererFiles) {
      const rel = relative(join(__dirname, '../..'), file).replace(/\\/g, '/');
      const content = readFileSync(file, 'utf8');
      content.split('\n').forEach((line, i) => {
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
        if (barrelImport.test(line) || lifecycleImport.test(line)) {
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      violations,
      `Renderer imports the core database barrel or lifecycle (Node-only):\n${violations.join('\n')}\n\n` +
        `Import '@core/database/project-db' (ProjectDb + sql.js types) or ` +
        `'@core/database/safe-stmt' instead — never the barrel or lifecycle.`,
    ).toEqual([]);
  });

  test('no Node builtin imports in ProjectDb or core commands (renderer-safe modules)', () => {
    // These modules must stay importable from the renderer: zero Node builtins
    // (import OR require form). Lifecycle concerns (fs/path/sql.js loading)
    // belong in src/core/database/lifecycle.ts.
    const targets = [join(__dirname, '../../src/core/database/project-db.ts')];
    try {
      targets.push(...walk(join(__dirname, '../../src/core/commands')));
    } catch {
      // src/core/commands does not exist yet — empty glob passes
    }
    const nodeBuiltinImport =
      /(?:from\s+['"](?:node:)?(?:crypto|fs|path|os|child_process)(?:\/[^'"]*)?['"]|require\(\s*['"](?:node:)?(?:crypto|fs|path|os|child_process)(?:\/[^'"]*)?['"]\s*\))/;
    const violations = [];

    for (const file of targets) {
      let content;
      try {
        content = readFileSync(file, 'utf8');
      } catch {
        continue; // file might not exist yet
      }
      const rel = relative(join(__dirname, '../..'), file).replace(/\\/g, '/');
      content.split('\n').forEach((line, i) => {
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
        if (nodeBuiltinImport.test(line)) {
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      violations,
      `Node builtin import(s) found in renderer-safe core modules:\n${violations.join('\n')}\n\n` +
        `ProjectDb and core commands must be environment-agnostic. Use ` +
        `src/core/uuid.ts for UUIDs and route file I/O through IoAdapter in ` +
        `src/core/database/lifecycle.ts.`,
    ).toEqual([]);
  });

  test('approved legacy list matches actual database importers', () => {
    const rendererDir = join(__dirname, '../../src/renderer');
    const rendererFiles = walk(rendererDir);
    const dbImportPattern =
      /(?:import .+ from ['"].*\/database['"]|require\(['"].*\/database['"]\))/;
    const actualImporters = new Set();

    for (const file of rendererFiles) {
      const rel = relative(join(__dirname, '../..'), file).replace(/\\/g, '/');
      if (rel.startsWith('src/renderer/database/')) continue;
      const content = readFileSync(file, 'utf8');
      if (dbImportPattern.test(content)) {
        actualImporters.add(rel);
      }
    }

    // Check for stale entries in APPROVED_LEGACY (files that no longer import database)
    const stale = [...APPROVED_LEGACY].filter((f) => !actualImporters.has(f));
    expect(
      stale,
      `Stale APPROVED_LEGACY entries (files no longer import database):\n${stale.join('\n')}`,
    ).toEqual([]);

    // Check for missing entries (files that import database but aren't approved)
    const missing = [...actualImporters].filter((f) => !APPROVED_LEGACY.has(f));
    expect(
      missing,
      `Missing APPROVED_LEGACY entries (files import database but aren't listed):\n${missing.join('\n')}`,
    ).toEqual([]);
  });
});
