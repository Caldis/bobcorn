/**
 * CLI project/icon/group command tests — validates real core operations.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { run, runJson, tmpProject } from './helpers';
import { join } from 'node:path';

describe('project create', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('creates a valid .icp file', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'new-project.icp');
    const { json, raw } = await runJson(['project', 'create', icpPath]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data).not.toBeNull();
    expect(json.data.projectPath).toContain('new-project.icp');
  });

  it('created file can be inspected', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const { json, raw } = await runJson(['project', 'inspect', icpPath]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe('iconfont');
    expect(json.data.prefix).toBe('iconfont');
    expect(json.data.iconCount).toBe(0);
    expect(json.data.groupCount).toBe(0);
    expect(json.data.groups).toEqual([]);
  });

  it('creates project with custom name', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'custom.icp');
    await run(['project', 'create', icpPath, '--name', 'my-icons']);

    const { json } = await runJson(['project', 'inspect', icpPath]);
    expect(json.data.name).toBe('my-icons');
    expect(json.data.prefix).toBe('my-icons');
  });
});

describe('project inspect', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

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

  it('returns success with data for a created .icp file', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test-project.icp');
    await run(['project', 'create', icpPath]);

    const { json, raw } = await runJson(['project', 'inspect', icpPath]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data).not.toBeNull();
    expect(json.data.name).toBeTruthy();
    expect(json.data.iconCount).toBe(0);
    expect(json.code).toBeNull();
    expect(json.error).toBeNull();
  });

  it('meta.command is "project inspect"', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test-project.icp');
    await run(['project', 'create', icpPath]);

    const { json } = await runJson(['project', 'inspect', icpPath]);
    expect(json.meta.command).toBe('project inspect');
  });

  it('meta.version matches package version', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test-project.icp');
    await run(['project', 'create', icpPath]);

    const { json } = await runJson(['project', 'inspect', icpPath]);
    const versionResult = await run(['--version']);
    expect(json.meta.version).toBe(versionResult.stdout.trim());
  });

  it('meta.duration_ms is a non-negative number', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test-project.icp');
    await run(['project', 'create', icpPath]);

    const { json } = await runJson(['project', 'inspect', icpPath]);
    expect(json.meta.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('human-readable output includes project info', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test-project.icp');
    await run(['project', 'create', icpPath]);

    const result = await run(['project', 'inspect', icpPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Name:');
    expect(result.stdout).toContain('iconfont');
    expect(result.stdout).toContain('Icons:');
  });
});

describe('icon list', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('returns empty array for empty project', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const { json, raw } = await runJson(['icon', 'list', icpPath]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual([]);
  });

  it('returns FILE_NOT_FOUND for missing file', async () => {
    const { json, raw } = await runJson(['icon', 'list', 'nonexistent.icp']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('FILE_NOT_FOUND');
  });

  it('human-readable output says "No icons found" for empty project', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const result = await run(['icon', 'list', icpPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No icons found');
  });
});

describe('group list', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('returns empty array for empty project (no default groups)', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const { json, raw } = await runJson(['group', 'list', icpPath]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual([]);
  });

  it('returns FILE_NOT_FOUND for missing file', async () => {
    const { json, raw } = await runJson(['group', 'list', 'nonexistent.icp']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('FILE_NOT_FOUND');
  });

  it('human-readable output says "No groups found" for empty project', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const result = await run(['group', 'list', icpPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No groups found');
  });
});
