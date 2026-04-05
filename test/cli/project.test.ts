/**
 * CLI project command tests — validates `project inspect` behavior.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { run, runJson, tmpProject, writeSvg } from './helpers';
import { writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('project inspect', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  // ── nonexistent file ─────────────────────────────────────
  it('returns FILE_NOT_FOUND with exit 2 for nonexistent file', async () => {
    const { json, raw } = await runJson(['project', 'inspect', 'does-not-exist-12345.icp']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('FILE_NOT_FOUND');
    expect(json.data).toBeNull();
  });

  it('prints error to stderr in non-JSON mode for nonexistent file', async () => {
    const result = await run(['project', 'inspect', 'does-not-exist-12345.icp']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Error:');
  });

  // ── valid file ───────────────────────────────────────────
  it('returns success with data for an existing .icp file', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    // Create a minimal .icp file (just needs to exist for the current stub impl)
    const icpPath = join(tmp.dir, 'test-project.icp');
    await writeFile(icpPath, Buffer.from('test-project-content'), 'utf-8');

    const { json, raw } = await runJson(['project', 'inspect', icpPath]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data).not.toBeNull();
    expect(json.data.path).toBeTruthy();
    expect(json.data.status).toBe('valid');
    expect(json.code).toBeNull();
    expect(json.error).toBeNull();
  });

  it('meta.command is "project inspect"', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test-project.icp');
    await writeFile(icpPath, Buffer.from('dummy'), 'utf-8');

    const { json } = await runJson(['project', 'inspect', icpPath]);
    expect(json.meta.command).toBe('project inspect');
  });

  it('meta.version matches package version', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test-project.icp');
    await writeFile(icpPath, Buffer.from('dummy'), 'utf-8');

    const { json } = await runJson(['project', 'inspect', icpPath]);
    // version output should match --version output
    const versionResult = await run(['--version']);
    expect(json.meta.version).toBe(versionResult.stdout.trim());
  });

  it('meta.duration_ms is a non-negative number', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test-project.icp');
    await writeFile(icpPath, Buffer.from('dummy'), 'utf-8');

    const { json } = await runJson(['project', 'inspect', icpPath]);
    expect(json.meta.duration_ms).toBeGreaterThanOrEqual(0);
  });
});
