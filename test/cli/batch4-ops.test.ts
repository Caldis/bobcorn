/**
 * CLI batch 4 operation tests — variant list/delete, project save-as,
 * icon set-color, variant generate stub.
 *
 * All write tests use temp copies of the sf-symbols fixture to avoid mutation.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { run, runJson, tmpProject, copyFixture, SF_SYMBOLS_ICP, HAS_SF_FIXTURE } from './helpers';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// variant list
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_SF_FIXTURE)('variant list', () => {
  it('returns empty variants for icon with no variants', async () => {
    // sf-symbols icons should not have variants
    const { json: listJson } = await runJson([
      'icon',
      'list',
      SF_SYMBOLS_ICP,
      '--group',
      'Accessibility',
    ]);
    expect(listJson.data.length).toBeGreaterThan(0);
    const icon = listJson.data[0];

    const { json, raw } = await runJson(['variant', 'list', SF_SYMBOLS_ICP, icon.id]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.parentId).toBe(icon.id);
    expect(json.data.parentName).toBe(icon.iconName);
    expect(json.data.variants).toHaveLength(0);
  });

  it('fails for nonexistent icon id', async () => {
    const { json, raw } = await runJson([
      'variant',
      'list',
      SF_SYMBOLS_ICP,
      'nonexistent-uuid-000',
    ]);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('ICON_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// variant delete
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_SF_FIXTURE)('variant delete', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('succeeds with 0 deleted for icon with no variants', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json: listJson } = await runJson([
      'icon',
      'list',
      fixture.icp,
      '--group',
      'Accessibility',
    ]);
    const icon = listJson.data[0];

    const { json, raw } = await runJson(['variant', 'delete', fixture.icp, icon.id]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.parentId).toBe(icon.id);
    expect(json.data.deleted).toBe(0);
  });

  it('fails for nonexistent icon id', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json, raw } = await runJson([
      'variant',
      'delete',
      fixture.icp,
      'nonexistent-uuid-000',
    ]);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('ICON_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// variant generate (stub — should fail with NOT_AVAILABLE_HEADLESS)
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_SF_FIXTURE)('variant generate', () => {
  it('returns NOT_AVAILABLE_HEADLESS error', async () => {
    const { json, raw } = await runJson([
      'variant',
      'generate',
      SF_SYMBOLS_ICP,
      'any-id',
    ]);
    expect(raw.exitCode).not.toBe(0);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('NOT_AVAILABLE_HEADLESS');
  });
});

// ---------------------------------------------------------------------------
// project save-as
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_SF_FIXTURE)('project save-as', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('copies project to a new path with same content', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const outputPath = join(tmp.dir, 'backup.icp');

    const { json, raw } = await runJson([
      'project',
      'save-as',
      SF_SYMBOLS_ICP,
      outputPath,
    ]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.iconCount).toBeGreaterThan(0);
    expect(json.data.groupCount).toBeGreaterThan(0);

    // Verify the copy is a valid project with the same icon count
    const { json: inspectOriginal } = await runJson(['project', 'inspect', SF_SYMBOLS_ICP]);
    const { json: inspectCopy } = await runJson(['project', 'inspect', outputPath]);
    expect(inspectCopy.data.iconCount).toBe(inspectOriginal.data.iconCount);
    expect(inspectCopy.data.groupCount).toBe(inspectOriginal.data.groupCount);
    expect(inspectCopy.data.name).toBe(inspectOriginal.data.name);
  });

  it('creates parent directories if needed', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const nestedPath = join(tmp.dir, 'deep', 'nested', 'backup.icp');

    const { json, raw } = await runJson([
      'project',
      'save-as',
      SF_SYMBOLS_ICP,
      nestedPath,
    ]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);

    // Verify the copy works
    const { json: inspectJson } = await runJson(['project', 'inspect', nestedPath]);
    expect(inspectJson.ok).toBe(true);
    expect(inspectJson.data.iconCount).toBeGreaterThan(0);
  });

  it('fails for nonexistent source file', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const { json, raw } = await runJson([
      'project',
      'save-as',
      join(tmp.dir, 'nonexistent.icp'),
      join(tmp.dir, 'output.icp'),
    ]);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('FILE_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// icon set-color
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_SF_FIXTURE)('icon set-color', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('replaces color in icon SVG content', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    // Find an icon
    const { json: listJson } = await runJson([
      'icon',
      'list',
      fixture.icp,
      '--group',
      'Accessibility',
    ]);
    const icon = listJson.data[0];

    // Get original content
    const { json: origContent } = await runJson(['icon', 'get-content', fixture.icp, icon.id]);
    const origSvg = origContent.data.content;

    // Replace black with red (most SF Symbols icons use implicit black or #000)
    const { json, raw } = await runJson([
      'icon',
      'set-color',
      fixture.icp,
      icon.id,
      '--from',
      '#000000',
      '--to',
      '#FF0000',
    ]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.oldColor).toBe('#000000');
    expect(json.data.newColor).toBe('#FF0000');

    // If content was updated, verify it changed
    if (json.data.updated > 0) {
      const { json: newContent } = await runJson(['icon', 'get-content', fixture.icp, icon.id]);
      expect(newContent.data.content).not.toBe(origSvg);
      expect(newContent.data.content).toContain('#FF0000');
    }
  });

  it('reports 0 updated when color not found', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json: listJson } = await runJson([
      'icon',
      'list',
      fixture.icp,
      '--group',
      'Accessibility',
    ]);
    const icon = listJson.data[0];

    // Use a color that's unlikely to be in any icon
    const { json, raw } = await runJson([
      'icon',
      'set-color',
      fixture.icp,
      icon.id,
      '--from',
      '#ABCDEF',
      '--to',
      '#123456',
    ]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.updated).toBe(0);
  });

  it('fails for nonexistent icon id', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json, raw } = await runJson([
      'icon',
      'set-color',
      fixture.icp,
      'nonexistent-uuid-000',
      '--from',
      '#000000',
      '--to',
      '#FF0000',
    ]);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('ICON_NOT_FOUND');
  });
});
