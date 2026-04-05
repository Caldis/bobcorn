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

// ---------------------------------------------------------------------------
// sf-symbols fixture tests — validate against real 7007-icon project
// ---------------------------------------------------------------------------
const SF_SYMBOLS_ICP = join(__dirname, '..', 'fixtures', 'sf-symbols', 'sf-symbols.icp');

describe('sf-symbols: project inspect', () => {
  it('reads correct project name and counts', async () => {
    const { json, raw } = await runJson(['project', 'inspect', SF_SYMBOLS_ICP]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe('sf-symbols');
    expect(json.data.iconCount).toBe(7007);
    expect(json.data.groupCount).toBe(28);
  });

  it('lists all 28 groups with correct names', async () => {
    const { json } = await runJson(['project', 'inspect', SF_SYMBOLS_ICP]);
    const groupNames = json.data.groups.map((g: any) => g.name);
    expect(groupNames).toContain('Accessibility');
    expect(groupNames).toContain('arrows');
    expect(groupNames).toContain('communication');
    expect(groupNames).toContain('objectsAndTools');
    expect(groupNames).toContain('weather');
    expect(groupNames.length).toBe(28);
  });

  it('group icon counts sum to total', async () => {
    const { json } = await runJson(['project', 'inspect', SF_SYMBOLS_ICP]);
    const sum = json.data.groups.reduce((s: number, g: any) => s + g.count, 0);
    expect(sum).toBe(json.data.iconCount);
  });
});

describe('sf-symbols: icon list', () => {
  it('lists all 7007 icons', async () => {
    const { json, raw } = await runJson(['icon', 'list', SF_SYMBOLS_ICP]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.length).toBe(7007);
  });

  it('each icon has required fields', async () => {
    const { json } = await runJson(['icon', 'list', SF_SYMBOLS_ICP]);
    const first = json.data[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('iconName');
    expect(first).toHaveProperty('iconCode');
    expect(first).toHaveProperty('iconGroup');
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('filters by group name', async () => {
    const { json, raw } = await runJson(['icon', 'list', SF_SYMBOLS_ICP, '--group', 'Accessibility']);
    expect(raw.exitCode).toBe(0);
    expect(json.data.length).toBe(125);
    expect(json.data[0].iconName).toBe('accessibility');
  });

  it('returns empty for nonexistent group', async () => {
    const { json, raw } = await runJson(['icon', 'list', SF_SYMBOLS_ICP, '--group', 'nonexistent-group-xyz']);
    expect(raw.exitCode).toBe(0);
    expect(json.data).toEqual([]);
  });

  it('contains known icons with correct codes', async () => {
    const { json } = await runJson(['icon', 'list', SF_SYMBOLS_ICP, '--group', 'Accessibility']);
    const accessibility = json.data.find((i: any) => i.iconName === 'accessibility');
    expect(accessibility).toBeDefined();
    expect(accessibility.iconCode).toBe('E000');
  });
});

describe('sf-symbols: group list', () => {
  it('lists all 28 groups', async () => {
    const { json, raw } = await runJson(['group', 'list', SF_SYMBOLS_ICP]);
    expect(raw.exitCode).toBe(0);
    expect(json.data.length).toBe(28);
  });

  it('groups are ordered by groupOrder', async () => {
    const { json } = await runJson(['group', 'list', SF_SYMBOLS_ICP]);
    const orders = json.data.map((g: any) => g.groupOrder);
    expect(orders).toEqual([...orders].sort((a: number, b: number) => a - b));
  });

  it('first group is Accessibility', async () => {
    const { json } = await runJson(['group', 'list', SF_SYMBOLS_ICP]);
    expect(json.data[0].groupName).toBe('Accessibility');
  });
});
