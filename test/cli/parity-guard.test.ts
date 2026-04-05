/**
 * CLI parity guard — ensures every Core operation with a cliCommand has CLI tests.
 *
 * Scans all test/cli/*.test.ts files for references to each operation's CLI command.
 * Operations with cliCommand: null are skipped (internal/implicit ops).
 *
 * Currently passes trivially because no Core operations have been migrated yet
 * (all are OpStatus.Legacy). As operations move to OpStatus.Core, this test
 * enforces that CLI test coverage keeps pace with migration.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPERATIONS, OpStatus } from '../../src/core/registry';

// Collect all test file contents from test/cli/ (excluding this file itself)
const CLI_TEST_DIR = join(__dirname);
const testFileContents: string[] = readdirSync(CLI_TEST_DIR)
  .filter((f) => f.endsWith('.test.ts') && f !== 'parity-guard.test.ts')
  .map((f) => readFileSync(join(CLI_TEST_DIR, f), 'utf-8'));

const allTestText = testFileContents.join('\n');

describe('CLI parity guard', () => {
  // Get all operations that have a CLI command and are migrated to Core
  const coreOpsWithCliCommand = OPERATIONS.filter(
    (op) => op.cliCommand !== null && op.status === OpStatus.Core
  );

  // Get all operations that have a CLI command (regardless of status)
  const allOpsWithCliCommand = OPERATIONS.filter((op) => op.cliCommand !== null);

  it('registry has operations defined', () => {
    expect(OPERATIONS.length).toBeGreaterThan(0);
  });

  it('all operations with cliCommand are accounted for', () => {
    // This verifies the registry shape — every op with a cliCommand should have
    // a non-empty string
    for (const op of allOpsWithCliCommand) {
      expect(op.cliCommand).toBeTruthy();
      expect(typeof op.cliCommand).toBe('string');
    }
  });

  if (coreOpsWithCliCommand.length === 0) {
    it('no Core operations yet — parity guard passes trivially', () => {
      // All operations are Legacy; no Core ops to enforce coverage for yet.
      // This test will become meaningful as migration proceeds.
      expect(coreOpsWithCliCommand).toHaveLength(0);
    });
  } else {
    // For each Core operation with a CLI command, verify it's referenced in tests
    for (const op of coreOpsWithCliCommand) {
      it(`has CLI test coverage for ${op.id} (${op.cliCommand})`, () => {
        // Check that the CLI command string appears somewhere in test files.
        // The command could appear as part of a test description, in args arrays,
        // or as a string literal. We check for the command name or op id.
        const command = op.cliCommand!;
        const commandParts = command.split(' ');

        // Look for the command in test files (e.g. "project inspect", "icon list")
        const hasCommandRef = allTestText.includes(command);
        // Also check for the operation id (e.g. "project.inspect")
        const hasIdRef = allTestText.includes(op.id);

        expect(
          hasCommandRef || hasIdRef,
          `Core operation "${op.id}" (CLI: "${command}") has no test coverage in test/cli/*.test.ts`
        ).toBe(true);
      });
    }
  }

  // Summary stat: report migration progress
  it('reports migration progress', () => {
    const total = allOpsWithCliCommand.length;
    const core = coreOpsWithCliCommand.length;
    const legacy = allOpsWithCliCommand.filter((op) => op.status === OpStatus.Legacy).length;
    const migrating = allOpsWithCliCommand.filter(
      (op) => op.status === OpStatus.Migrating
    ).length;

    // Just verify the counts add up — this is informational
    expect(core + legacy + migrating).toBe(total);
  });
});
