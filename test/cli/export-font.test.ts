/**
 * CLI export font + export svg tests.
 *
 * Uses the sf-symbols fixture (7007 icons, 28 groups).
 * All tests use temp directories for output.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { run, runJson, tmpProject, copyFixture } from './helpers';
import { join } from 'node:path';
import { readFile, readdir, access } from 'node:fs/promises';

const SF_SYMBOLS_ICP = join(__dirname, '..', 'fixtures', 'sf-symbols', 'sf-symbols.icp');

// ---------------------------------------------------------------------------
// export font
// ---------------------------------------------------------------------------
describe('export font', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('generates all font formats + CSS + JS from sf-symbols', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const outDir = join(tmp.dir, 'font-out');

    const { json, raw } = await runJson(
      ['export', 'font', SF_SYMBOLS_ICP, '--out', outDir],
      { cwd: tmp.dir }
    );
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);

    const data = json.data;
    expect(data.iconCount).toBe(7007);
    expect(data.fontName).toBe('sf-symbols');
    expect(data.duration_ms).toBeGreaterThan(0);
    expect(data.files.length).toBeGreaterThanOrEqual(7); // svg,ttf,woff2,woff,eot,css,js

    // Check all expected formats present
    const formats = new Set(data.files.map((f: any) => f.format));
    expect(formats.has('svg')).toBe(true);
    expect(formats.has('ttf')).toBe(true);
    expect(formats.has('woff2')).toBe(true);
    expect(formats.has('woff')).toBe(true);
    expect(formats.has('eot')).toBe(true);
    expect(formats.has('css')).toBe(true);
    expect(formats.has('js')).toBe(true);

    // All files have non-zero sizes
    for (const f of data.files) {
      expect(f.size).toBeGreaterThan(0);
    }

    // Verify files exist on disk
    const dirFiles = await readdir(outDir);
    expect(dirFiles).toContain('sf-symbols.svg');
    expect(dirFiles).toContain('sf-symbols.ttf');
    expect(dirFiles).toContain('sf-symbols.woff2');
    expect(dirFiles).toContain('sf-symbols.css');
    expect(dirFiles).toContain('sf-symbols.js');
  }, 120_000);

  it('CSS file contains @font-face and icon class names', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const outDir = join(tmp.dir, 'font-css-check');

    await runJson(['export', 'font', SF_SYMBOLS_ICP, '--out', outDir, '--formats', 'svg,ttf,woff2']);

    const cssContent = await readFile(join(outDir, 'sf-symbols.css'), 'utf-8');
    // Check @font-face declaration
    expect(cssContent).toContain('@font-face');
    expect(cssContent).toContain('font-family: "sf-symbols"');

    // Check icon class names (use lowercase codes — CSS uses lowercase)
    expect(cssContent).toContain('.sf-symbols-e000:before');
    expect(cssContent).toContain('.sf-symbols {');
  }, 120_000);

  it('respects --formats flag to generate subset', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const outDir = join(tmp.dir, 'font-subset');

    const { json, raw } = await runJson([
      'export',
      'font',
      SF_SYMBOLS_ICP,
      '--out',
      outDir,
      '--formats',
      'svg,ttf,woff2',
      '--no-js',
    ]);
    expect(raw.exitCode).toBe(0);

    const formats = new Set(json.data.files.map((f: any) => f.format));
    expect(formats.has('svg')).toBe(true);
    expect(formats.has('ttf')).toBe(true);
    expect(formats.has('woff2')).toBe(true);
    // Should NOT have woff, eot
    expect(formats.has('woff')).toBe(false);
    expect(formats.has('eot')).toBe(false);
    // Should have CSS (default on), but NOT JS
    expect(formats.has('css')).toBe(true);
    expect(formats.has('js')).toBe(false);
  }, 120_000);

  it('respects --font-name override', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const outDir = join(tmp.dir, 'font-rename');

    const { json, raw } = await runJson([
      'export',
      'font',
      SF_SYMBOLS_ICP,
      '--out',
      outDir,
      '--font-name',
      'my-icons',
      '--formats',
      'svg,ttf',
      '--no-js',
    ]);
    expect(raw.exitCode).toBe(0);
    expect(json.data.fontName).toBe('my-icons');

    const dirFiles = await readdir(outDir);
    expect(dirFiles).toContain('my-icons.svg');
    expect(dirFiles).toContain('my-icons.ttf');
    expect(dirFiles).toContain('my-icons.css');
  }, 120_000);

  it('fails for nonexistent project file', async () => {
    const { json, raw } = await runJson(['export', 'font', 'nonexistent.icp', '--out', '.']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('FILE_NOT_FOUND');
  });

  it('--preview flag returns NOT_IMPLEMENTED', async () => {
    const result = await run([
      'export',
      'font',
      SF_SYMBOLS_ICP,
      '--out',
      '.',
      '--preview',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('not available in CLI');
  });
});

// ---------------------------------------------------------------------------
// export svg
// ---------------------------------------------------------------------------
describe('export svg', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('exports all 7007 icons as individual SVG files', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const outDir = join(tmp.dir, 'svg-all');

    const { json, raw } = await runJson(
      ['export', 'svg', SF_SYMBOLS_ICP, '--out', outDir],
      { cwd: tmp.dir }
    );
    expect(raw.exitCode).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.data.exported).toBe(7007);
    expect(json.data.files.length).toBe(7007);

    // Verify files on disk
    const dirFiles = await readdir(outDir);
    expect(dirFiles.length).toBe(7007);
  }, 120_000);

  it('filters by group name — weather has 9 icons', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const outDir = join(tmp.dir, 'svg-weather');

    const { json, raw } = await runJson([
      'export',
      'svg',
      SF_SYMBOLS_ICP,
      '--out',
      outDir,
      '--group',
      'weather',
    ]);
    expect(raw.exitCode).toBe(0);
    expect(json.data.exported).toBe(9);
    expect(json.data.files.length).toBe(9);

    // Verify each file starts with <svg
    const dirFiles = await readdir(outDir);
    expect(dirFiles.length).toBe(9);
    for (const f of dirFiles) {
      expect(f.endsWith('.svg')).toBe(true);
      const content = await readFile(join(outDir, f), 'utf-8');
      expect(content.trimStart().startsWith('<svg')).toBe(true);
    }
  }, 60_000);

  it('fails for nonexistent group', async () => {
    const tmp = await tmpProject();
    cleanup = tmp.cleanup;
    const outDir = join(tmp.dir, 'svg-nogroup');

    const { json, raw } = await runJson([
      'export',
      'svg',
      SF_SYMBOLS_ICP,
      '--out',
      outDir,
      '--group',
      'nonexistent-group',
    ]);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('GROUP_NOT_FOUND');
  });

  it('fails for nonexistent project file', async () => {
    const { json, raw } = await runJson(['export', 'svg', 'nonexistent.icp', '--out', '.']);
    expect(raw.exitCode).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('FILE_NOT_FOUND');
  });
});
