/**
 * Glyph pipeline guard — protects the preprocessing funnel between icon
 * SVGs and font conversion (svgicons2svgfont → svg2ttf).
 *
 * 1. Frozen manifest: transform names + order are locked. Changing the
 *    pipeline requires a conscious edit here too — order bugs (e.g. winding
 *    analysis running before defs are stripped) are silent otherwise.
 * 2. Idempotence: every transform must satisfy f(f(x)) === f(x), so re-runs
 *    and future re-entrant callers can never corrupt geometry.
 * 3. Error isolation: a throwing transform degrades to a no-op for that
 *    step; the export must survive.
 * 4. Source guard: any file that feeds svgicons2svgfont must go through
 *    prepareSvgForFont, and no file may re-grow a private copy of the
 *    shared transforms (the pre-refactor duplication).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import {
  GLYPH_TRANSFORMS,
  runGlyphTransforms,
  prepareSvgForFont,
} from '../../src/core/svg/glyph-pipeline';
import { extractPathDs, subpathAreas } from '../helpers/winding-analysis';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FIXTURES = join(ROOT, 'test', 'fixtures', 'issue2-evenodd');

const readFixture = (name) => readFileSync(join(FIXTURES, name), 'utf-8');

// ---------------------------------------------------------------------------
// 1. Frozen manifest
// ---------------------------------------------------------------------------

describe('pipeline manifest', () => {
  test('transform names and order are frozen (update consciously)', () => {
    expect(GLYPH_TRANSFORMS.map((t) => t.name)).toEqual([
      'flatten-use-refs',
      'fix-degenerate-arcs',
      'strip-non-renderable',
      'normalize-winding',
    ]);
  });

  test('every transform has a description and a pure apply function', () => {
    for (const t of GLYPH_TRANSFORMS) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(typeof t.apply).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Idempotence
// ---------------------------------------------------------------------------

describe('pipeline idempotence', () => {
  const fixtures = ['alternating-06.svg', 'subtract-02.svg', 'subtract-03.svg'];

  for (const fixture of fixtures) {
    for (const t of GLYPH_TRANSFORMS) {
      test(`${t.name} is idempotent on ${fixture}`, () => {
        const once = t.apply(readFixture(fixture));
        expect(t.apply(once)).toBe(once);
      });
    }

    test(`full pipeline is idempotent on ${fixture}`, () => {
      const once = prepareSvgForFont(readFixture(fixture));
      expect(prepareSvgForFont(once)).toBe(once);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Error isolation
// ---------------------------------------------------------------------------

describe('pipeline error isolation', () => {
  test('a throwing transform is skipped, later steps still run', () => {
    const errors = [];
    const result = runGlyphTransforms(
      '<svg/>',
      [
        { name: 'boom', description: 'always throws', apply: () => { throw new Error('kaput'); } },
        { name: 'ok', description: 'appends marker', apply: (s) => `${s}<!--ok-->` },
      ],
      (step, err) => errors.push([step, err.message])
    );
    expect(result).toBe('<svg/><!--ok-->');
    expect(errors).toEqual([['boom', 'kaput']]);
  });

  test('a transform returning non-string is ignored', () => {
    const result = runGlyphTransforms('<svg/>', [
      { name: 'bad', description: 'returns undefined', apply: () => undefined },
    ]);
    expect(result).toBe('<svg/>');
  });
});

// ---------------------------------------------------------------------------
// End-to-end: issue #2 fixtures through the full pipeline
// ---------------------------------------------------------------------------

describe('prepareSvgForFont — issue #2 end-to-end', () => {
  test.each(['subtract-02.svg', 'subtract-03.svg'])(
    '%s leaves the pipeline with nonzero-safe winding',
    (fixture) => {
      const prepared = prepareSvgForFont(readFixture(fixture));
      const areas = subpathAreas(extractPathDs(prepared)[0]);
      // outer ring and its hole must wind in opposite directions
      expect(Math.sign(areas[1])).toBe(-Math.sign(areas[0]));
    }
  );
});

// ---------------------------------------------------------------------------
// 4. Source guard — the funnel cannot be bypassed or duplicated
// ---------------------------------------------------------------------------

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

describe('glyph pipeline source guard', () => {
  const srcFiles = walk(join(ROOT, 'src'));

  test('every svgicons2svgfont consumer routes glyphs through prepareSvgForFont', () => {
    const offenders = [];
    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf-8');
      if (!/from ['"]svgicons2svgfont['"]/.test(content)) continue;
      if (!content.includes('prepareSvgForFont')) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  test('shared transforms are not duplicated outside core/svg', () => {
    const offenders = [];
    for (const file of srcFiles) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (rel.startsWith('src/core/svg/')) continue;
      const content = readFileSync(file, 'utf-8');
      // implementation markers of the previously-duplicated helpers
      if (
        /function\s+cleanSVGForFont|const\s+cleanSVGForFont\s*=/.test(content) ||
        /function\s+flattenSvgUseRefs|const\s+flattenSvgUseRefs\s*=\s*\(/.test(content) ||
        content.includes('a0,0,0,0,1,0,0')
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
