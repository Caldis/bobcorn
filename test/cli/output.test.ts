/**
 * CLI output format tests — validates version, help, and JSON envelope structure.
 */
import { describe, it, expect } from 'vitest';
import { run, runJson } from './helpers';

describe('CLI output format', () => {
  // ── --version ────────────────────────────────────────────
  it('--version prints a semver version string', async () => {
    const result = await run(['--version']);
    expect(result.exitCode).toBe(0);
    // Expect something like "1.10.0"
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  // ── --help ───────────────────────────────────────────────
  describe('--help lists all top-level commands', () => {
    const expectedCommands = [
      'project',
      'icon',
      'group',
      'export',
      'variant',
      'search',
      'favorite',
    ];

    it('exits with code 0', async () => {
      const result = await run(['--help']);
      expect(result.exitCode).toBe(0);
    });

    for (const cmd of expectedCommands) {
      it(`lists "${cmd}" command`, async () => {
        const result = await run(['--help']);
        expect(result.stdout).toContain(cmd);
      });
    }
  });

  // ── --json error envelope ────────────────────────────────
  describe('--json error returns valid JSON envelope', () => {
    it('returns parseable JSON on error', async () => {
      const { json, raw } = await runJson(['project', 'inspect', 'nonexistent-file-xyz.icp']);
      expect(raw.exitCode).not.toBe(0);
      expect(json).not.toBeNull();
    });

    it('has correct envelope structure', async () => {
      const { json } = await runJson(['project', 'inspect', 'nonexistent-file-xyz.icp']);
      expect(json).toHaveProperty('ok', false);
      expect(json).toHaveProperty('error');
      expect(json).toHaveProperty('code');
      expect(json).toHaveProperty('warnings');
      expect(json).toHaveProperty('data');
      expect(json).toHaveProperty('meta');
    });

    it('has correct meta structure', async () => {
      const { json } = await runJson(['project', 'inspect', 'nonexistent-file-xyz.icp']);
      const { meta } = json;
      expect(meta).toHaveProperty('command');
      expect(meta).toHaveProperty('projectPath');
      expect(meta).toHaveProperty('duration_ms');
      expect(meta).toHaveProperty('version');
      expect(typeof meta.command).toBe('string');
      expect(typeof meta.duration_ms).toBe('number');
      expect(typeof meta.version).toBe('string');
    });

    it('error code is FILE_NOT_FOUND for missing file', async () => {
      const { json } = await runJson(['project', 'inspect', 'nonexistent-file-xyz.icp']);
      expect(json.code).toBe('FILE_NOT_FOUND');
    });

    it('ok is false and data is null on total failure', async () => {
      const { json } = await runJson(['project', 'inspect', 'nonexistent-file-xyz.icp']);
      expect(json.ok).toBe(false);
      expect(json.data).toBeNull();
    });

    it('warnings is an array', async () => {
      const { json } = await runJson(['project', 'inspect', 'nonexistent-file-xyz.icp']);
      expect(Array.isArray(json.warnings)).toBe(true);
    });
  });
});
