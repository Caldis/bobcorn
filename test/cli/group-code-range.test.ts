/**
 * CLI group code-range tests — set-code-range / --clear / inspect / check
 * and icon move --reassign|--keep-codes.
 *
 * Self-contained: builds tiny projects via "project create" + "icon import"
 * so they run on CI (no gitignored fixture needed).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { run, runJson, tmpProject, writeSvg } from './helpers';
import { join } from 'node:path';

async function makeProject(
  dir: string,
  groups: string[],
  icons: { name: string; group?: string }[]
): Promise<{ icp: string; ids: Record<string, string> }> {
  const icp = join(dir, 'range-test.icp');
  const { json: created } = await runJson(['project', 'create', icp]);
  expect(created.ok).toBe(true);
  for (const g of groups) {
    const { json } = await runJson(['group', 'add', icp, g]);
    expect(json.ok).toBe(true);
  }
  const ids: Record<string, string> = {};
  for (const icon of icons) {
    const svg = await writeSvg(dir, `${icon.name}.svg`);
    const args = ['icon', 'import', icp, svg];
    if (icon.group) args.push('--group', icon.group);
    const { json } = await runJson(args);
    expect(json.ok).toBe(true);
    ids[icon.name] = json.data.icons[0].id;
  }
  return { icp, ids };
}

describe('group set-code-range', () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('sets a code range and reports it in group list --json', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp } = await makeProject(tmp.dir, ['Nav'], []);

    const { json, raw } = await runJson(['group', 'set-code-range', icp, 'Nav', 'E100-E1FF']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.codeRangeStart).toBe(0xe100);
    expect(json.data.codeRangeEnd).toBe(0xe1ff);
    expect(json.data.cleared).toBe(false);

    const { json: listJson } = await runJson(['group', 'list', icp]);
    const nav = listJson.data.find((g: any) => g.groupName === 'Nav');
    expect(nav.codeRangeStart).toBe(0xe100);
    expect(nav.codeRangeEnd).toBe(0xe1ff);
  });

  it('is case-insensitive on the hex range', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp } = await makeProject(tmp.dir, ['Nav'], []);
    const { json } = await runJson(['group', 'set-code-range', icp, 'Nav', 'e100-e1ff']);
    expect(json.ok).toBe(true);
    expect(json.data.codeRangeStart).toBe(0xe100);
    expect(json.data.codeRangeEnd).toBe(0xe1ff);
  });

  it('--clear removes the range', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp } = await makeProject(tmp.dir, ['Nav'], []);
    await run(['group', 'set-code-range', icp, 'Nav', 'E100-E1FF']);

    const { json, raw } = await runJson(['group', 'set-code-range', icp, 'Nav', '--clear']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.cleared).toBe(true);
    expect(json.data.codeRangeStart).toBeNull();

    const { json: listJson } = await runJson(['group', 'list', icp]);
    const nav = listJson.data.find((g: any) => g.groupName === 'Nav');
    expect(nav.codeRangeStart).toBeNull();
  });

  it('rejects a malformed range with INVALID_CODE_RANGE', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp } = await makeProject(tmp.dir, ['Nav'], []);
    const { json, raw } = await runJson(['group', 'set-code-range', icp, 'Nav', 'nope']);
    expect(raw.exitCode).toBe(2);
    expect(json.code).toBe('INVALID_CODE_RANGE');
  });

  it('rejects a range outside the PUA with INVALID_CODE_RANGE', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp } = await makeProject(tmp.dir, ['Nav'], []);
    // D000 is below E000.
    const { json, raw } = await runJson(['group', 'set-code-range', icp, 'Nav', 'D000-E100']);
    expect(raw.exitCode).toBe(2);
    expect(json.code).toBe('INVALID_CODE_RANGE');
  });

  it('rejects start > end with INVALID_CODE_RANGE', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp } = await makeProject(tmp.dir, ['Nav'], []);
    const { json, raw } = await runJson(['group', 'set-code-range', icp, 'Nav', 'E200-E100']);
    expect(raw.exitCode).toBe(2);
    expect(json.code).toBe('INVALID_CODE_RANGE');
  });

  it('rejects an overlapping range with CODE_RANGE_OVERLAP', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp } = await makeProject(tmp.dir, ['Nav', 'Media'], []);
    await run(['group', 'set-code-range', icp, 'Nav', 'E100-E1FF']);
    const { json, raw } = await runJson(['group', 'set-code-range', icp, 'Media', 'E1F0-E2FF']);
    expect(raw.exitCode).toBe(2);
    expect(json.code).toBe('CODE_RANGE_OVERLAP');
  });

  it('allows an adjacent (non-overlapping) range', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp } = await makeProject(tmp.dir, ['Nav', 'Media'], []);
    await run(['group', 'set-code-range', icp, 'Nav', 'E100-E1FF']);
    const { json } = await runJson(['group', 'set-code-range', icp, 'Media', 'E200-E2FF']);
    expect(json.ok).toBe(true);
  });
});

describe('import into a ranged group', () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('allocates codes inside the group range', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp } = await makeProject(tmp.dir, ['Nav'], []);
    await run(['group', 'set-code-range', icp, 'Nav', 'E300-E3FF']);

    const svg = await writeSvg(tmp.dir, 'first.svg');
    const { json } = await runJson(['icon', 'import', icp, svg, '--group', 'Nav']);
    expect(json.ok).toBe(true);
    expect(json.data.icons[0].code).toBe('E300');
  });

  it('unassigned imports skip the reserved range', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    // One icon already at E000 in uncategorized; Nav reserves E001-E1FF.
    const { icp } = await makeProject(tmp.dir, ['Nav'], [{ name: 'base' }]);
    await run(['group', 'set-code-range', icp, 'Nav', 'E001-E1FF']);

    const svg = await writeSvg(tmp.dir, 'free.svg');
    const { json } = await runJson(['icon', 'import', icp, svg]); // uncategorized
    expect(json.ok).toBe(true);
    // E000 used, E001-E1FF reserved → next global code is E200.
    expect(json.data.icons[0].code).toBe('E200');
  });
});

describe('group inspect', () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('reports the range and occupancy stats', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp } = await makeProject(tmp.dir, ['Nav'], []);
    await run(['group', 'set-code-range', icp, 'Nav', 'E100-E1FF']); // capacity 256
    // Import 2 icons into Nav → E100, E101 used.
    const s1 = await writeSvg(tmp.dir, 'a.svg');
    const s2 = await writeSvg(tmp.dir, 'b.svg');
    await run(['icon', 'import', icp, s1, s2, '--group', 'Nav']);

    const { json } = await runJson(['group', 'inspect', icp, 'Nav']);
    expect(json.ok).toBe(true);
    expect(json.data.codeRangeStartHex).toBe('E100');
    expect(json.data.codeRangeEndHex).toBe('E1FF');
    expect(json.data.rangeCapacity).toBe(256);
    expect(json.data.rangeUsed).toBe(2);
    expect(json.data.rangeFree).toBe(254);
    expect(json.data.outOfRangeCount).toBe(0);
    expect(json.data.iconCount).toBe(2);
  });

  it('reports (no range) for a group without one', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp } = await makeProject(tmp.dir, ['Nav'], []);
    const { json } = await runJson(['group', 'inspect', icp, 'Nav']);
    expect(json.ok).toBe(true);
    expect(json.data.codeRangeStart).toBeNull();
    expect(json.data.rangeCapacity).toBeNull();
  });
});

describe('group check (range violations)', () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('flags an icon whose code is outside its group range', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    // Import icon into Nav BEFORE the range exists → it gets E000 (out of range).
    const { icp, ids } = await makeProject(tmp.dir, ['Nav'], [{ name: 'stray', group: 'Nav' }]);
    await run(['group', 'set-code-range', icp, 'Nav', 'E100-E1FF']);

    const { json } = await runJson(['group', 'check', icp]);
    expect(json.ok).toBe(true);
    expect(json.data.checkedGroups).toBe(1);
    expect(json.data.violations).toHaveLength(1);
    expect(json.data.violations[0].id).toBe(ids.stray);
    expect(json.data.violations[0].groupName).toBe('Nav');
  });

  it('reports no violations when every code is in range', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp } = await makeProject(tmp.dir, ['Nav'], []);
    await run(['group', 'set-code-range', icp, 'Nav', 'E100-E1FF']);
    const svg = await writeSvg(tmp.dir, 'ok.svg');
    await run(['icon', 'import', icp, svg, '--group', 'Nav']); // E100

    const { json } = await runJson(['group', 'check', icp]);
    expect(json.ok).toBe(true);
    expect(json.data.violations).toHaveLength(0);
  });
});

describe('icon move --reassign / --keep-codes', () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('--reassign reallocates out-of-range codes into the target range', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    // Icon lives in uncategorized at E000; Nav reserves E100-E1FF.
    const { icp, ids } = await makeProject(tmp.dir, ['Nav'], [{ name: 'x' }]);
    await run(['group', 'set-code-range', icp, 'Nav', 'E100-E1FF']);

    const { json, raw } = await runJson([
      'icon',
      'move',
      icp,
      ids.x,
      '--to',
      'Nav',
      '--reassign',
    ]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.reassigned).toHaveLength(1);
    expect(json.data.reassigned[0].oldCode).toBe('E000');
    expect(json.data.reassigned[0].newCode).toBe('E100');

    const { json: listJson } = await runJson(['icon', 'list', icp, '--group', 'Nav']);
    expect(listJson.data.find((i: any) => i.id === ids.x).iconCode).toBe('E100');
  });

  it('default (keep codes) leaves the code unchanged', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp, ids } = await makeProject(tmp.dir, ['Nav'], [{ name: 'x' }]);
    await run(['group', 'set-code-range', icp, 'Nav', 'E100-E1FF']);

    const { json } = await runJson(['icon', 'move', icp, ids.x, '--to', 'Nav']);
    expect(json.ok).toBe(true);
    expect(json.data.reassigned).toHaveLength(0);

    const { json: listJson } = await runJson(['icon', 'list', icp, '--group', 'Nav']);
    expect(listJson.data.find((i: any) => i.id === ids.x).iconCode).toBe('E000');
  });

  it('--keep-codes is an explicit no-op reassignment', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const { icp, ids } = await makeProject(tmp.dir, ['Nav'], [{ name: 'x' }]);
    await run(['group', 'set-code-range', icp, 'Nav', 'E100-E1FF']);

    const { json } = await runJson(['icon', 'move', icp, ids.x, '--to', 'Nav', '--keep-codes']);
    expect(json.ok).toBe(true);
    expect(json.data.reassigned).toHaveLength(0);
    const { json: listJson } = await runJson(['icon', 'list', icp, '--group', 'Nav']);
    expect(listJson.data.find((i: any) => i.id === ids.x).iconCode).toBe('E000');
  });
});
