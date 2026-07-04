/**
 * CLI --code-mode tests — new icon code allocation mode (append/fill).
 *
 * Self-contained: builds tiny projects via "project create" + "icon import"
 * instead of the (gitignored) sf-symbols fixture, so these run on CI too.
 * Holes are created with "icon set-code" (moves an icon's code elsewhere,
 * freeing its old code point) — soft-delete does NOT free a code point since
 * deleted rows stay in iconData (see code-fix.test.ts for the same pattern).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { run, runJson, tmpProject, writeSvg } from './helpers';
import { join } from 'node:path';

async function createProjectWithIcons(
  dir: string,
  names: string[]
): Promise<{ icp: string; ids: Record<string, string> }> {
  const icp = join(dir, 'code-mode-test.icp');
  const { json: createJson } = await runJson(['project', 'create', icp]);
  expect(createJson.ok).toBe(true);

  const svgPaths: string[] = [];
  for (const name of names) {
    svgPaths.push(await writeSvg(dir, `${name}.svg`));
  }
  const { json: importJson } = await runJson(['icon', 'import', icp, ...svgPaths]);
  expect(importJson.ok).toBe(true);

  const ids: Record<string, string> = {};
  for (const icon of importJson.data.icons) {
    ids[icon.name] = icon.id;
  }
  return { icp, ids };
}

describe('icon import --code-mode', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('defaults to append: skips holes and allocates past the highest used code', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    // a=E000, b=E001, c=E002
    const { icp, ids } = await createProjectWithIcons(tmp.dir, ['a', 'b', 'c']);
    // Move c's code to F000, freeing a hole at E002. Highest used is now F000.
    await runJson(['icon', 'set-code', icp, ids.c, 'F000']);

    const dSvg = await writeSvg(tmp.dir, 'd.svg');
    const { json, raw } = await runJson(['icon', 'import', icp, dSvg]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    // Default (no --code-mode) must NOT reuse the E002 hole.
    expect(json.data.icons[0].code).toBe('F001');
  });

  it('explicit --code-mode append behaves the same as the default', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const { icp, ids } = await createProjectWithIcons(tmp.dir, ['a', 'b', 'c']);
    await runJson(['icon', 'set-code', icp, ids.c, 'F000']);

    const dSvg = await writeSvg(tmp.dir, 'd.svg');
    const { json, raw } = await runJson(['icon', 'import', icp, dSvg, '--code-mode', 'append']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.icons[0].code).toBe('F001');
  });

  it('--code-mode fill reuses the first free (lowest) hole', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    // a=E000, b=E001, c=E002
    const { icp, ids } = await createProjectWithIcons(tmp.dir, ['a', 'b', 'c']);
    // Move c's code to F000, freeing a hole at E002.
    await runJson(['icon', 'set-code', icp, ids.c, 'F000']);

    const dSvg = await writeSvg(tmp.dir, 'd.svg');
    const { json, raw } = await runJson(['icon', 'import', icp, dSvg, '--code-mode', 'fill']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    // Fill mode reuses the lowest free code point (the E002 hole), not F001.
    expect(json.data.icons[0].code).toBe('E002');
  });

  it('rejects an invalid --code-mode value with INVALID_CODE_MODE and exit code 2', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const icpPath = join(tmp.dir, 'invalid-mode.icp');
    await run(['project', 'create', icpPath]);
    const svgPath = await writeSvg(tmp.dir, 'a.svg');

    const { json, raw } = await runJson([
      'icon',
      'import',
      icpPath,
      svgPath,
      '--code-mode',
      'bogus',
    ]);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('INVALID_CODE_MODE');

    // Nothing should have been imported.
    const { json: listJson } = await runJson(['icon', 'list', icpPath]);
    expect(listJson.data).toHaveLength(0);
  });
});

describe('icon copy --code-mode', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('defaults to append for the new copy, skipping holes', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    // a=E000, b=E001
    const { icp, ids } = await createProjectWithIcons(tmp.dir, ['a', 'b']);
    await run(['group', 'add', icp, 'Target']);
    // Move b's code to F000, freeing a hole at E001. Highest used is now F000.
    await runJson(['icon', 'set-code', icp, ids.b, 'F000']);

    const { json, raw } = await runJson(['icon', 'copy', icp, ids.a, '--to', 'Target']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.icons[0].code).toBe('F001');
  });

  it('--code-mode fill reuses the first free hole for the new copy', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const { icp, ids } = await createProjectWithIcons(tmp.dir, ['a', 'b']);
    await run(['group', 'add', icp, 'Target']);
    await runJson(['icon', 'set-code', icp, ids.b, 'F000']);

    const { json, raw } = await runJson([
      'icon',
      'copy',
      icp,
      ids.a,
      '--to',
      'Target',
      '--code-mode',
      'fill',
    ]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.icons[0].code).toBe('E001');
  });

  it('rejects an invalid --code-mode value with INVALID_CODE_MODE and exit code 2', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const { icp, ids } = await createProjectWithIcons(tmp.dir, ['a']);
    await run(['group', 'add', icp, 'Target']);

    const { json, raw } = await runJson([
      'icon',
      'copy',
      icp,
      ids.a,
      '--to',
      'Target',
      '--code-mode',
      'nope',
    ]);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('INVALID_CODE_MODE');

    // Nothing should have been copied.
    const { json: listJson } = await runJson(['icon', 'list', icp, '--group', 'Target']);
    expect(listJson.data).toHaveLength(0);
  });
});
