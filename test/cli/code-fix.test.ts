/**
 * CLI code fix tests — repair duplicate/invalid icon unicode codes.
 *
 * Self-contained: builds tiny projects via "project create" + "icon import"
 * instead of the (gitignored) sf-symbols fixture. Duplicate codes are created
 * with "icon set-code" (which validates format but not uniqueness); invalid
 * codes are injected with raw SQL, mirroring what corrupt .cp/.icp imports
 * can bring in.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { runJson, tmpProject, writeSvg } from './helpers';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import initSqlJs from 'sql.js/dist/sql-asm.js';

let SQL: any = null;

/** Run a raw SQL statement against an .icp file (bypasses CLI validation). */
async function rawSql(icp: string, sql: string): Promise<void> {
  if (!SQL) SQL = await initSqlJs();
  const data = await readFile(icp);
  const db = new SQL.Database(data);
  db.run(sql);
  const out = db.export();
  db.close();
  await writeFile(icp, Buffer.from(out));
}

/** Create an empty project and import icons named a, b, c... (codes E000, E001, ...). */
async function createProjectWithIcons(
  dir: string,
  names: string[]
): Promise<{ icp: string; ids: Record<string, string> }> {
  const icp = join(dir, 'code-fix-test.icp');
  const { json: createJson } = await runJson(['project', 'create', icp]);
  expect(createJson.ok).toBe(true);

  const svgPaths: string[] = [];
  for (const name of names) {
    svgPaths.push(await writeSvg(dir, `${name}.svg`));
  }
  const { json: importJson } = await runJson(['icon', 'import', icp, ...svgPaths]);
  expect(importJson.ok).toBe(true);
  expect(importJson.data.imported).toBe(names.length);

  const ids: Record<string, string> = {};
  for (const icon of importJson.data.icons) {
    ids[icon.name] = icon.id;
  }
  return { icp, ids };
}

describe('code fix', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('dry-run lists duplicate and invalid fixes without modifying the file', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    // a=E000, b=E001, c=E002
    const { icp, ids } = await createProjectWithIcons(tmp.dir, ['a', 'b', 'c']);
    // Duplicate: b joins a on E000 (E001 becomes free)
    const { json: setCodeJson } = await runJson(['icon', 'set-code', icp, ids.b, 'E000']);
    expect(setCodeJson.ok).toBe(true);
    // Invalid: c gets a code outside the PUA range (E002 becomes free)
    await rawSql(icp, `UPDATE iconData SET iconCode = '0041' WHERE id = '${ids.c}'`);

    const bytesBefore = await readFile(icp);

    const { json, raw } = await runJson(['code', 'fix', icp, '--dry-run']);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.applied).toBe(false);
    expect(json.data.fixes).toHaveLength(2);

    // Duplicate group E000: keeper is a (first non-recycled row), b is reassigned
    // to the first free code point E001.
    const dupFix = json.data.fixes[0];
    expect(dupFix.reason).toBe('duplicate');
    expect(dupFix.id).toBe(ids.b);
    expect(dupFix.iconName).toBe('b');
    expect(dupFix.oldCode).toBe('E000');
    expect(dupFix.newCode).toBe('E001');

    // Invalid row c is reassigned after duplicates -> next free code point E002.
    const invalidFix = json.data.fixes[1];
    expect(invalidFix.reason).toBe('invalid');
    expect(invalidFix.id).toBe(ids.c);
    expect(invalidFix.iconName).toBe('c');
    expect(invalidFix.oldCode).toBe('0041');
    expect(invalidFix.newCode).toBe('E002');

    // Dry-run must not touch the project file
    const bytesAfter = await readFile(icp);
    expect(bytesAfter.equals(bytesBefore)).toBe(true);

    // Codes are unchanged in the database
    const { json: listJson } = await runJson(['icon', 'list', icp]);
    const codesById = new Map(listJson.data.map((i: any) => [i.id, i.iconCode]));
    expect(codesById.get(ids.a)).toBe('E000');
    expect(codesById.get(ids.b)).toBe('E000');
    expect(codesById.get(ids.c)).toBe('0041');
  });

  it('applies fixes: duplicates eliminated, invalid codes replaced, then idempotent', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const { icp, ids } = await createProjectWithIcons(tmp.dir, ['a', 'b', 'c']);
    await runJson(['icon', 'set-code', icp, ids.b, 'E000']);
    await rawSql(icp, `UPDATE iconData SET iconCode = '0041' WHERE id = '${ids.c}'`);

    const { json, raw } = await runJson(['code', 'fix', icp]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.applied).toBe(true);
    expect(json.data.fixes).toHaveLength(2);

    // Verify persisted state: unique, valid PUA codes
    const { json: listJson } = await runJson(['icon', 'list', icp]);
    const codesById = new Map(listJson.data.map((i: any) => [i.id, i.iconCode]));
    expect(codesById.get(ids.a)).toBe('E000');
    expect(codesById.get(ids.b)).toBe('E001');
    expect(codesById.get(ids.c)).toBe('E002');
    const codes = listJson.data.map((i: any) => i.iconCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{4}$/);
      const dec = parseInt(code, 16);
      expect(dec).toBeGreaterThanOrEqual(0xe000);
      expect(dec).toBeLessThanOrEqual(0xf8ff);
    }

    // Second run finds nothing to fix
    const { json: secondJson } = await runJson(['code', 'fix', icp]);
    expect(secondJson.ok).toBe(true);
    expect(secondJson.data.applied).toBe(false);
    expect(secondJson.data.fixes).toHaveLength(0);
  });

  it('keeps the first non-recycled occupant in a duplicate group', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    // a=E000, b=E001
    const { icp, ids } = await createProjectWithIcons(tmp.dir, ['a', 'b']);
    // Soft-delete a (moves it to resource-deleted), then point b at a's code
    const { json: deleteJson } = await runJson(['icon', 'delete', icp, ids.a]);
    expect(deleteJson.ok).toBe(true);
    await runJson(['icon', 'set-code', icp, ids.b, 'E000']);

    const { json, raw } = await runJson(['code', 'fix', icp]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.applied).toBe(true);
    // Even though the deleted row a comes first in table order, the live row b
    // keeps E000 — the recycled row a is the one reassigned.
    expect(json.data.fixes).toHaveLength(1);
    expect(json.data.fixes[0].id).toBe(ids.a);
    expect(json.data.fixes[0].reason).toBe('duplicate');

    const { json: listJson } = await runJson(['icon', 'list', icp]);
    const b = listJson.data.find((i: any) => i.id === ids.b);
    expect(b.iconCode).toBe('E000');
  });

  it('returns an empty plan for a healthy project', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;

    const { icp } = await createProjectWithIcons(tmp.dir, ['a', 'b']);
    const bytesBefore = await readFile(icp);

    const { json, raw } = await runJson(['code', 'fix', icp]);
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.applied).toBe(false);
    expect(json.data.fixes).toHaveLength(0);

    // Nothing to fix -> file untouched even without --dry-run
    const bytesAfter = await readFile(icp);
    expect(bytesAfter.equals(bytesBefore)).toBe(true);
  });
});
