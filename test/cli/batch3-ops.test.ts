/**
 * CLI batch 3 operation tests — icon copy/set-code/replace/export-svg/set-favorite,
 * search, favorite list, group reorder/set-description/move-icons,
 * project set-name/set-prefix.
 *
 * All write tests use temp copies of the sf-symbols fixture to avoid mutation.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { run, runJson, tmpProject, writeSvg, copyFixture } from './helpers';
import { join } from 'node:path';
import { readFile, access } from 'node:fs/promises';

const SF_SYMBOLS_ICP = join(__dirname, '..', 'fixtures', 'sf-symbols', 'sf-symbols.icp');

// ---------------------------------------------------------------------------
// icon copy
// ---------------------------------------------------------------------------
describe('icon copy', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('copies an icon from one group to another', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    // Find an icon in Accessibility
    const { json: listJson } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    expect(listJson.data.length).toBeGreaterThan(0);
    const icon = listJson.data.find((i: any) => i.iconName === 'accessibility');
    expect(icon).toBeDefined();

    // Copy it to weather group
    const { json, raw } = await runJson(['icon', 'copy', fixture.icp, icon.id, '--to', 'weather']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.copied).toBe(1);
    expect(json.data.targetGroup).toBe('weather');
    expect(json.data.icons[0].name).toBe('accessibility');

    // Verify original still exists in Accessibility
    const { json: origList } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    const origIcon = origList.data.find((i: any) => i.id === icon.id);
    expect(origIcon).toBeDefined();

    // Verify copy exists in weather
    const { json: weatherList } = await runJson(['icon', 'list', fixture.icp, '--group', 'weather']);
    const copiedIcon = weatherList.data.find((i: any) => i.iconName === 'accessibility');
    expect(copiedIcon).toBeDefined();
    // Copy should have a different ID
    expect(copiedIcon.id).not.toBe(icon.id);
  });

  it('fails without --to flag', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json, raw } = await runJson(['icon', 'copy', fixture.icp, 'some-id']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('MISSING_OPTION');
  });
});

// ---------------------------------------------------------------------------
// icon set-code
// ---------------------------------------------------------------------------
describe('icon set-code', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('sets unicode code for an icon', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json: listJson } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    const icon = listJson.data[0];

    const { json, raw } = await runJson(['icon', 'set-code', fixture.icp, icon.id, 'F000']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.newCode).toBe('F000');

    // Verify the change persisted
    const { json: verifyList } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    const updated = verifyList.data.find((i: any) => i.id === icon.id);
    expect(updated.iconCode).toBe('F000');
  });

  it('rejects invalid hex code', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json: listJson } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    const icon = listJson.data[0];

    const { json, raw } = await runJson(['icon', 'set-code', fixture.icp, icon.id, 'ZZZZ']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('INVALID_CODE');
  });

  it('rejects code outside PUA range', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json: listJson } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    const icon = listJson.data[0];

    const { json, raw } = await runJson(['icon', 'set-code', fixture.icp, icon.id, '0041']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('INVALID_CODE');
  });
});

// ---------------------------------------------------------------------------
// icon replace
// ---------------------------------------------------------------------------
describe('icon replace', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('replaces icon SVG content', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json: listJson } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    const icon = listJson.data[0];

    // Get original content
    const { json: origContent } = await runJson(['icon', 'get-content', fixture.icp, icon.id]);

    // Write a new SVG
    const newSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24"/></svg>`;
    const svgPath = await writeSvg(fixture.dir, 'replacement.svg', newSvg);

    // Replace
    const { json, raw } = await runJson(['icon', 'replace', fixture.icp, icon.id, svgPath]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.id).toBe(icon.id);

    // Verify content changed
    const { json: newContent } = await runJson(['icon', 'get-content', fixture.icp, icon.id]);
    expect(newContent.data.content).toContain('<rect');
    expect(newContent.data.content).not.toBe(origContent.data.content);
  });
});

// ---------------------------------------------------------------------------
// icon export-svg
// ---------------------------------------------------------------------------
describe('icon export-svg', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('exports an icon as an SVG file', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    // Find an icon in the fixture
    const { json: listJson } = await runJson(['icon', 'list', SF_SYMBOLS_ICP, '--group', 'Accessibility']);
    const icon = listJson.data.find((i: any) => i.iconName === 'accessibility');
    expect(icon).toBeDefined();

    const outDir = join(tmp.dir, 'exported');

    const { json, raw } = await runJson(['icon', 'export-svg', SF_SYMBOLS_ICP, icon.id, '--out', outDir]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.exported).toBe(1);
    expect(json.data.files[0].name).toBe('accessibility');

    // Verify file was written
    const svgContent = await readFile(join(outDir, 'accessibility.svg'), 'utf-8');
    expect(svgContent).toContain('<svg');
  });
});

// ---------------------------------------------------------------------------
// icon set-favorite + favorite list
// ---------------------------------------------------------------------------
describe('icon set-favorite', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('marks an icon as favorite and lists it', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json: listJson } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    const icon = listJson.data[0];

    // Mark as favorite
    const { json, raw } = await runJson(['icon', 'set-favorite', fixture.icp, icon.id]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.isFavorite).toBe(true);

    // Verify via favorite list
    const { json: favList } = await runJson(['favorite', 'list', fixture.icp]);
    expect(favList.ok).toBe(true);
    expect(favList.data.length).toBeGreaterThanOrEqual(1);
    const fav = favList.data.find((i: any) => i.id === icon.id);
    expect(fav).toBeDefined();
  });

  it('unmarks an icon as favorite with --off', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json: listJson } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    const icon = listJson.data[0];

    // Mark as favorite first
    await run(['--json', 'icon', 'set-favorite', fixture.icp, icon.id]);

    // Unmark
    const { json, raw } = await runJson(['icon', 'set-favorite', fixture.icp, icon.id, '--off']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.isFavorite).toBe(false);

    // Verify not in favorites anymore
    const { json: favList } = await runJson(['favorite', 'list', fixture.icp]);
    const fav = favList.data.find((i: any) => i.id === icon.id);
    expect(fav).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------
describe('search', () => {
  it('finds icons matching a query', async () => {
    const { json, raw } = await runJson(['search', SF_SYMBOLS_ICP, 'arrow']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    // All results should contain 'arrow' in the name
    for (const icon of json.data) {
      expect(icon.iconName.toLowerCase()).toContain('arrow');
    }
  });

  it('respects --limit option', async () => {
    const { json: unlimitedJson } = await runJson(['search', SF_SYMBOLS_ICP, 'arrow']);
    expect(unlimitedJson.data.length).toBeGreaterThan(3);

    const { json: limitedJson } = await runJson(['search', SF_SYMBOLS_ICP, 'arrow', '--limit', '3']);
    expect(limitedJson.data.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array for non-matching query', async () => {
    const { json, raw } = await runJson(['search', SF_SYMBOLS_ICP, 'zzz_nonexistent_zzz']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// favorite list (empty)
// ---------------------------------------------------------------------------
describe('favorite list', () => {
  it('returns empty list when no favorites set', async () => {
    const { json, raw } = await runJson(['favorite', 'list', SF_SYMBOLS_ICP]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// group reorder
// ---------------------------------------------------------------------------
describe('group reorder', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('reorders groups', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    // Get current groups
    const { json: beforeList } = await runJson(['group', 'list', fixture.icp]);
    const names = beforeList.data.map((g: any) => g.groupName);
    expect(names.length).toBeGreaterThanOrEqual(2);

    // Reverse the order
    const reversed = [...names].reverse();
    const { json, raw } = await runJson(['group', 'reorder', fixture.icp, ...reversed]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.reordered).toBe(reversed.length);

    // Verify new order
    const { json: afterList } = await runJson(['group', 'list', fixture.icp]);
    const newNames = afterList.data.map((g: any) => g.groupName);
    expect(newNames).toEqual(reversed);
  });

  it('fails for nonexistent group name', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json, raw } = await runJson(['group', 'reorder', fixture.icp, 'nonexistent-group']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('GROUP_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// group set-description
// ---------------------------------------------------------------------------
describe('group set-description', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('sets a description for a group', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json, raw } = await runJson([
      'group',
      'set-description',
      fixture.icp,
      'Accessibility',
      'Icons for accessibility features',
    ]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.groupName).toBe('Accessibility');
    expect(json.data.description).toBe('Icons for accessibility features');
  });

  it('fails for nonexistent group', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json, raw } = await runJson([
      'group',
      'set-description',
      fixture.icp,
      'nonexistent',
      'Some description',
    ]);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('GROUP_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// group move-icons
// ---------------------------------------------------------------------------
describe('group move-icons', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('moves icons to a target group', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    // Get an icon from Accessibility
    const { json: listJson } = await runJson(['icon', 'list', fixture.icp, '--group', 'Accessibility']);
    const icon = listJson.data[0];

    // Move using group move-icons
    const { json, raw } = await runJson([
      'group',
      'move-icons',
      fixture.icp,
      'weather',
      icon.id,
    ]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.moved).toBe(1);
    expect(json.data.targetGroup).toBe('weather');

    // Verify icon is now in weather
    const { json: weatherList } = await runJson(['icon', 'list', fixture.icp, '--group', 'weather']);
    const moved = weatherList.data.find((i: any) => i.id === icon.id);
    expect(moved).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// project set-name
// ---------------------------------------------------------------------------
describe('project set-name', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('changes the project name', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json, raw } = await runJson(['project', 'set-name', fixture.icp, 'my-new-font']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.newName).toBe('my-new-font');

    // Verify via inspect
    const { json: inspectJson } = await runJson(['project', 'inspect', fixture.icp]);
    expect(inspectJson.data.name).toBe('my-new-font');
    expect(inspectJson.data.prefix).toBe('my-new-font');
  });
});

// ---------------------------------------------------------------------------
// project set-prefix
// ---------------------------------------------------------------------------
describe('project set-prefix', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('changes the font prefix', async () => {
    const fixture = await copyFixture(SF_SYMBOLS_ICP);
    cleanup = fixture.cleanup;

    const { json, raw } = await runJson(['project', 'set-prefix', fixture.icp, 'my-prefix']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.newName).toBe('my-prefix');

    // Verify via inspect
    const { json: inspectJson } = await runJson(['project', 'inspect', fixture.icp]);
    expect(inspectJson.data.prefix).toBe('my-prefix');
  });
});
