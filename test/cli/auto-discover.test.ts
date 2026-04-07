/**
 * CLI project auto-discovery tests.
 *
 * Tests the priority chain for resolving .icp project files:
 *   1. Explicit positional argument
 *   2. --project global flag
 *   3. Auto-discover *.icp in current directory
 */
import { describe, it, expect, afterEach } from 'vitest';
import { run, runJson, tmpProject, SF_SYMBOLS_ICP, HAS_SF_FIXTURE } from './helpers';
import { join } from 'node:path';
import { copyFile, writeFile } from 'node:fs/promises';

describe('auto-discover: single .icp in cwd', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('icon list succeeds from a directory with exactly one .icp file', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    // Create a project in the temp dir
    await run(['project', 'create', join(tmp.dir, 'my-project.icp')]);

    // Run icon list from that directory WITHOUT specifying the .icp path
    const { json, raw } = await runJson(['icon', 'list'], { cwd: tmp.dir });
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual([]);
  });

  it('project inspect succeeds from a directory with one .icp file', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    await run(['project', 'create', join(tmp.dir, 'test.icp'), '--name', 'auto-test']);

    const { json, raw } = await runJson(['project', 'inspect'], { cwd: tmp.dir });
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe('auto-test');
  });

  it('group list succeeds with auto-discovery', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    await run(['project', 'create', join(tmp.dir, 'icons.icp')]);

    const { json, raw } = await runJson(['group', 'list'], { cwd: tmp.dir });
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual([]);
  });
});

describe('auto-discover: no .icp in cwd', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('icon list fails with helpful error when no .icp files exist', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    // tmp.dir is empty — no .icp files
    const { json, raw } = await runJson(['icon', 'list'], { cwd: tmp.dir });
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('PROJECT_NOT_FOUND');
    expect(json.error).toContain('No .icp project file found');
  });

  it('error message includes usage hints', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const result = await run(['icon', 'list'], { cwd: tmp.dir });
    expect(result.exitCode).toBe(2);
    // The error message should suggest specifying a path
    expect(result.stderr + result.stdout).toContain('bobcorn icon list my-project.icp');
  });
});

describe('auto-discover: multiple .icp files in cwd', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('icon list fails listing both files when 2 .icp files exist', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    // Create two .icp files in the same directory
    await run(['project', 'create', join(tmp.dir, 'icons-v1.icp')]);
    await run(['project', 'create', join(tmp.dir, 'icons-v2.icp')]);

    const { json, raw } = await runJson(['icon', 'list'], { cwd: tmp.dir });
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('PROJECT_NOT_FOUND');
    expect(json.error).toContain('Multiple .icp files found');
    expect(json.error).toContain('icons-v1.icp');
    expect(json.error).toContain('icons-v2.icp');
  });
});

describe('explicit path (backward compatible)', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('icon list works with explicit path argument', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'explicit.icp');
    await run(['project', 'create', icpPath]);

    // Explicit path — should work regardless of cwd
    const { json, raw } = await runJson(['icon', 'list', icpPath]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual([]);
  });

  it.skipIf(!HAS_SF_FIXTURE)('project inspect with explicit path still works', async () => {
    // Use the sf-symbols fixture directly
    const { json, raw } = await runJson(['project', 'inspect', SF_SYMBOLS_ICP]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe('sf-symbols');
  });
});

describe('--project global flag', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('icon list works with --project flag', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'flagged.icp');
    await run(['project', 'create', icpPath]);

    // Use --project flag instead of positional arg
    const { json, raw } = await runJson(['--project', icpPath, 'icon', 'list']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual([]);
  });

  it.skipIf(!HAS_SF_FIXTURE)('project inspect works with --project flag', async () => {
    const { json, raw } = await runJson(['--project', SF_SYMBOLS_ICP, 'project', 'inspect']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe('sf-symbols');
  });
});

describe('priority chain', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('explicit positional overrides --project flag', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    // Create two projects with different names
    const icp1 = join(tmp.dir, 'project-a.icp');
    const icp2 = join(tmp.dir, 'project-b.icp');
    await run(['project', 'create', icp1, '--name', 'alpha']);
    await run(['project', 'create', icp2, '--name', 'beta']);

    // Explicit positional (project-a) should override --project flag (project-b)
    const { json, raw } = await runJson([
      '--project', icp2,
      'project', 'inspect', icp1,
    ]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe('alpha'); // Not 'beta'
  });

  it('--project flag overrides auto-discovery', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    // Create one project in cwd (auto-discoverable) and one elsewhere
    const cwdProject = join(tmp.dir, 'local.icp');
    await run(['project', 'create', cwdProject, '--name', 'local']);

    // Create a second project in a subdirectory
    const subDir = join(tmp.dir, 'sub');
    await run(['project', 'create', join(subDir, 'remote.icp'), '--name', 'remote']);

    // --project flag should override the auto-discovered local.icp
    const { json, raw } = await runJson(
      ['--project', join(subDir, 'remote.icp'), 'project', 'inspect'],
      { cwd: tmp.dir }
    );
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe('remote');
  });
});
