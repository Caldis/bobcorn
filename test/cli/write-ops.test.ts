/**
 * CLI write operation tests — icon import/delete/rename/move/get-content
 * and group add/rename/delete.
 *
 * Write tests use temp copies of the sf-symbols fixture to avoid mutation.
 * Read-only tests (get-content) use the fixture directly.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { run, runJson, tmpProject, writeSvg, copyFixture } from './helpers';
import { join } from 'node:path';

const SF_SYMBOLS_ICP = join(__dirname, '..', 'fixtures', 'sf-symbols', 'sf-symbols.icp');

// ---------------------------------------------------------------------------
// icon import
// ---------------------------------------------------------------------------
describe('icon import', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('imports a single SVG into a new project', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const svgPath = await writeSvg(tmp.dir, 'triangle.svg');

    const { json, raw } = await runJson(['icon', 'import', icpPath, svgPath]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.imported).toBe(1);
    expect(json.data.icons).toHaveLength(1);
    expect(json.data.icons[0].name).toBe('triangle');
    expect(json.data.icons[0].code).toBe('E000');

    // Verify icon is now in the project
    const { json: listJson } = await runJson(['icon', 'list', icpPath]);
    expect(listJson.data).toHaveLength(1);
    expect(listJson.data[0].iconName).toBe('triangle');
  });

  it('imports multiple SVGs', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const svg1 = await writeSvg(tmp.dir, 'icon-a.svg');
    const svg2 = await writeSvg(tmp.dir, 'icon-b.svg');
    const svg3 = await writeSvg(tmp.dir, 'icon-c.svg');

    const { json, raw } = await runJson(['icon', 'import', icpPath, svg1, svg2, svg3]);
    expect(raw.exitCode).toBe(0);
    expect(json.data.imported).toBe(3);

    // Codes should be sequential
    const codes = json.data.icons.map((i: any) => i.code);
    expect(codes).toContain('E000');
    expect(codes).toContain('E001');
    expect(codes).toContain('E002');
  });

  it('imports SVG into a specific group', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    // Create group first
    await run(['group', 'add', icpPath, 'my-group']);

    const svgPath = await writeSvg(tmp.dir, 'star.svg');
    const { json, raw } = await runJson(['icon', 'import', icpPath, svgPath, '--group', 'my-group']);
    expect(raw.exitCode).toBe(0);
    expect(json.data.imported).toBe(1);

    // Verify icon is in the correct group
    const { json: listJson } = await runJson(['icon', 'list', icpPath, '--group', 'my-group']);
    expect(listJson.data).toHaveLength(1);
    expect(listJson.data[0].iconName).toBe('star');
  });

  it('fails for nonexistent project', async () => {
    const { json, raw } = await runJson(['icon', 'import', 'nonexistent.icp', 'test.svg']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('FILE_NOT_FOUND');
  });

  it('fails for nonexistent SVG file', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const { json, raw } = await runJson(['icon', 'import', icpPath, 'nonexistent.svg']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('FILE_NOT_FOUND');
  });

  it('sanitizes script tags from SVG', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const maliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert('xss')</script><path d="M0 0"/></svg>`;
    const svgPath = await writeSvg(tmp.dir, 'evil.svg', maliciousSvg);

    await run(['icon', 'import', icpPath, svgPath]);

    // Get the icon content and verify no script
    const { json: listJson } = await runJson(['icon', 'list', icpPath]);
    const iconId = listJson.data[0].id;

    const { json: contentJson } = await runJson(['icon', 'get-content', icpPath, iconId]);
    expect(contentJson.data.content).not.toContain('<script');
    expect(contentJson.data.content).toContain('<svg');
  });
});

// ---------------------------------------------------------------------------
// icon delete
// ---------------------------------------------------------------------------
describe('icon delete', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('deletes an icon from a copy of the fixture', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    // Get the first icon
    const { json: listJson } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    const iconId = listJson.data[0].id;
    const originalCount = listJson.data.length;

    // Delete it
    const { json, raw } = await runJson(['icon', 'delete', fixture.icp, iconId]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.deleted).toBe(1);

    // Verify count decreased
    const { json: newListJson } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    expect(newListJson.data.length).toBe(originalCount - 1);
  });

  it('deletes multiple icons', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    // Import 3 icons
    const svg1 = await writeSvg(tmp.dir, 'a.svg');
    const svg2 = await writeSvg(tmp.dir, 'b.svg');
    const svg3 = await writeSvg(tmp.dir, 'c.svg');
    await run(['icon', 'import', icpPath, svg1, svg2, svg3]);

    const { json: listJson } = await runJson(['icon', 'list', icpPath]);
    expect(listJson.data.length).toBe(3);

    const ids = listJson.data.map((i: any) => i.id);
    const { json, raw } = await runJson(['icon', 'delete', icpPath, ids[0], ids[1]]);
    expect(raw.exitCode).toBe(0);
    expect(json.data.deleted).toBe(2);

    // Only 1 should remain
    const { json: finalList } = await runJson(['icon', 'list', icpPath]);
    expect(finalList.data.length).toBe(1);
  });

  it('returns FILE_NOT_FOUND for missing project', async () => {
    const { json, raw } = await runJson(['icon', 'delete', 'nonexistent.icp', 'some-id']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('FILE_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// icon rename
// ---------------------------------------------------------------------------
describe('icon rename', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('renames an icon in the fixture copy', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    // Find the 'accessibility' icon
    const { json: listJson } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    const icon = listJson.data.find((i: any) => i.iconName === 'accessibility');
    expect(icon).toBeDefined();

    // Rename it
    const { json, raw } = await runJson(['icon', 'rename', fixture.icp, icon.id, 'a11y']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.oldName).toBe('accessibility');
    expect(json.data.newName).toBe('a11y');

    // Verify the rename persisted
    const { json: verifyJson } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    const renamed = verifyJson.data.find((i: any) => i.id === icon.id);
    expect(renamed.iconName).toBe('a11y');
  });

  it('fails for nonexistent icon ID', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const { json, raw } = await runJson(['icon', 'rename', icpPath, 'nonexistent-uuid', 'new-name']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('ICON_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// icon move
// ---------------------------------------------------------------------------
describe('icon move', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('moves an icon to a different group', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    // Create two groups
    await run(['group', 'add', icpPath, 'group-a']);
    await run(['group', 'add', icpPath, 'group-b']);

    // Import icon into group-a
    const svgPath = await writeSvg(tmp.dir, 'star.svg');
    await run(['icon', 'import', icpPath, svgPath, '--group', 'group-a']);

    // Verify it's in group-a
    const { json: listA } = await runJson(['icon', 'list', icpPath, '--group', 'group-a']);
    expect(listA.data).toHaveLength(1);
    const iconId = listA.data[0].id;

    // Move to group-b
    const { json, raw } = await runJson(['icon', 'move', icpPath, iconId, '--to', 'group-b']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.moved).toBe(1);

    // Verify it's now in group-b
    const { json: listB } = await runJson(['icon', 'list', icpPath, '--group', 'group-b']);
    expect(listB.data).toHaveLength(1);
    expect(listB.data[0].id).toBe(iconId);

    // Verify it's no longer in group-a
    const { json: listA2 } = await runJson(['icon', 'list', icpPath, '--group', 'group-a']);
    expect(listA2.data).toHaveLength(0);
  });

  it('fails without --to flag', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const { json, raw } = await runJson(['icon', 'move', icpPath, 'some-id']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('MISSING_OPTION');
  });

  it('fails for nonexistent group', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const svgPath = await writeSvg(tmp.dir, 'icon.svg');
    await run(['icon', 'import', icpPath, svgPath]);

    const { json: listJson } = await runJson(['icon', 'list', icpPath]);
    const iconId = listJson.data[0].id;

    const { json, raw } = await runJson(['icon', 'move', icpPath, iconId, '--to', 'nonexistent-group']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('GROUP_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// icon get-content
// ---------------------------------------------------------------------------
describe('icon get-content', () => {
  it('returns SVG content from fixture', async () => {
    // Find the 'accessibility' icon
    const { json: listJson } = await runJson(['icon', 'list', SF_SYMBOLS_ICP, '--group', 'Accessibility']);
    const icon = listJson.data.find((i: any) => i.iconName === 'accessibility');
    expect(icon).toBeDefined();

    const { json, raw } = await runJson(['icon', 'get-content', SF_SYMBOLS_ICP, icon.id]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.content).toContain('<svg');
  });

  it('outputs raw SVG in human mode', async () => {
    const { json: listJson } = await runJson(['icon', 'list', SF_SYMBOLS_ICP, '--group', 'Accessibility']);
    const icon = listJson.data.find((i: any) => i.iconName === 'accessibility');

    const result = await run(['icon', 'get-content', SF_SYMBOLS_ICP, icon.id]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('<svg');
    // Should NOT be wrapped in JSON
    expect(result.stdout).not.toContain('"ok"');
  });

  it('fails for nonexistent icon', async () => {
    const { json, raw } = await runJson(['icon', 'get-content', SF_SYMBOLS_ICP, 'nonexistent-uuid']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('ICON_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// group add
// ---------------------------------------------------------------------------
describe('group add', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('creates a new group', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const { json, raw } = await runJson(['group', 'add', icpPath, 'test-group']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.groupName).toBe('test-group');
    expect(json.data.groupOrder).toBe(0);

    // Verify group is in the list
    const { json: listJson } = await runJson(['group', 'list', icpPath]);
    expect(listJson.data).toHaveLength(1);
    expect(listJson.data[0].groupName).toBe('test-group');
  });

  it('assigns sequential group order', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const { json: first } = await runJson(['group', 'add', icpPath, 'alpha']);
    expect(first.data.groupOrder).toBe(0);

    const { json: second } = await runJson(['group', 'add', icpPath, 'beta']);
    expect(second.data.groupOrder).toBe(1);

    const { json: third } = await runJson(['group', 'add', icpPath, 'gamma']);
    expect(third.data.groupOrder).toBe(2);
  });

  it('fails for duplicate group name', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    await run(['group', 'add', icpPath, 'my-group']);
    const { json, raw } = await runJson(['group', 'add', icpPath, 'my-group']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('GROUP_EXISTS');
  });
});

// ---------------------------------------------------------------------------
// group rename
// ---------------------------------------------------------------------------
describe('group rename', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('renames a group', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);
    await run(['group', 'add', icpPath, 'old-name']);

    const { json, raw } = await runJson(['group', 'rename', icpPath, 'old-name', 'new-name']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.oldName).toBe('old-name');
    expect(json.data.newName).toBe('new-name');

    // Verify rename persisted
    const { json: listJson } = await runJson(['group', 'list', icpPath]);
    expect(listJson.data[0].groupName).toBe('new-name');
  });

  it('fails for nonexistent group', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const { json, raw } = await runJson(['group', 'rename', icpPath, 'nonexistent', 'new-name']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('GROUP_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// group delete
// ---------------------------------------------------------------------------
describe('group delete', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('deletes a group and moves icons to uncategorized', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    // Create group and import icon into it
    await run(['group', 'add', icpPath, 'doomed-group']);
    const svgPath = await writeSvg(tmp.dir, 'orphan.svg');
    await run(['icon', 'import', icpPath, svgPath, '--group', 'doomed-group']);

    // Verify icon is in the group
    const { json: beforeList } = await runJson(['icon', 'list', icpPath, '--group', 'doomed-group']);
    expect(beforeList.data).toHaveLength(1);

    // Delete the group
    const { json, raw } = await runJson(['group', 'delete', icpPath, 'doomed-group']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe('doomed-group');
    expect(json.data.iconsMovedToUncategorized).toBe(1);

    // Group should be gone
    const { json: groupList } = await runJson(['group', 'list', icpPath]);
    const names = groupList.data.map((g: any) => g.groupName);
    expect(names).not.toContain('doomed-group');

    // Icon should still exist (in uncategorized = total icon list)
    const { json: iconList } = await runJson(['icon', 'list', icpPath]);
    expect(iconList.data).toHaveLength(1);
    expect(iconList.data[0].iconName).toBe('orphan');
  });

  it('deletes a group from fixture copy', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    // Get weather group info before delete
    const { json: beforeInspect } = await runJson(['project', 'inspect', fixture.icp]);
    const weatherGroup = beforeInspect.data.groups.find((g: any) => g.name === 'weather');
    expect(weatherGroup).toBeDefined();
    const weatherIconCount = weatherGroup.count;
    const totalBefore = beforeInspect.data.iconCount;

    // Delete weather group
    const { json, raw } = await runJson(['group', 'delete', fixture.icp, 'weather']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.iconsMovedToUncategorized).toBe(weatherIconCount);

    // Verify group count decreased by 1
    const { json: afterInspect } = await runJson(['project', 'inspect', fixture.icp]);
    expect(afterInspect.data.groupCount).toBe(beforeInspect.data.groupCount - 1);

    // Total icons should be the same (they moved, not deleted)
    expect(afterInspect.data.iconCount).toBe(totalBefore);
  });

  it('fails for nonexistent group', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const icpPath = join(tmp.dir, 'test.icp');
    await run(['project', 'create', icpPath]);

    const { json, raw } = await runJson(['group', 'delete', icpPath, 'nonexistent']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('GROUP_NOT_FOUND');
  });
});
