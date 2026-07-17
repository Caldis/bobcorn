/**
 * Regression tests for evenodd → nonzero winding normalization.
 *
 * Fixtures are the exact SVGs from GitHub issue #2 (MasterGo "减去顶层"
 * boolean-op exports): a single <path> with fill-rule: evenodd whose
 * subpaths all wind the same direction. Font formats only support the
 * nonzero rule, so without normalization the holes fill solid.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { normalizeWinding } from '../../src/core/svg/normalize-winding';
import { extractPathDs, subpathAreas } from '../helpers/winding-analysis';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(__dirname, '..', 'fixtures', 'issue2-evenodd');

const readFixture = (name) => readFileSync(join(FIXTURES, name), 'utf-8');

const sign = Math.sign;

describe('normalizeWinding — issue #2 MasterGo subtract fixtures', () => {
  test('subtract-02: hole flips opposite to outer ring, figure matches outer', () => {
    const result = normalizeWinding(readFixture('subtract-02.svg'));
    const areas = subpathAreas(extractPathDs(result)[0]);

    // source order: outer circle, inner circle (hole), figure head, figure body
    expect(areas).toHaveLength(4);
    expect(sign(areas[1])).toBe(-sign(areas[0])); // hole must oppose outer
    expect(sign(areas[2])).toBe(sign(areas[0])); // depth-2 islands match outer
    expect(sign(areas[3])).toBe(sign(areas[0]));
  });

  test('subtract-03: hole flips, depth-2 arrow keeps fill under nonzero', () => {
    const result = normalizeWinding(readFixture('subtract-03.svg'));
    const areas = subpathAreas(extractPathDs(result)[0]);

    expect(areas).toHaveLength(3);
    expect(sign(areas[1])).toBe(-sign(areas[0]));
    expect(sign(areas[2])).toBe(sign(areas[0]));
  });

  test('alternating-06: already nonzero-safe evenodd → byte-identical output', () => {
    const svg = readFixture('alternating-06.svg');
    expect(normalizeWinding(svg)).toBe(svg);
  });

  test('is idempotent on rewritten output', () => {
    const once = normalizeWinding(readFixture('subtract-02.svg'));
    expect(normalizeWinding(once)).toBe(once);
  });
});

describe('normalizeWinding — safety contract', () => {
  // same-winding nested squares: solid under nonzero, ring under evenodd
  const NESTED_D = 'M0 0H10V10H0Z M2 2H8V8H2Z';

  test('nonzero (default) paths are never modified', () => {
    const svg = `<svg viewBox="0 0 10 10"><path d="${NESTED_D}"/></svg>`;
    expect(normalizeWinding(svg)).toBe(svg);
  });

  test('explicit fill-rule="nonzero" paths are never modified', () => {
    const svg = `<svg viewBox="0 0 10 10"><path fill-rule="nonzero" d="${NESTED_D}"/></svg>`;
    expect(normalizeWinding(svg)).toBe(svg);
  });

  test('fill-rule="evenodd" attribute form is normalized', () => {
    const svg = `<svg viewBox="0 0 10 10"><path fill-rule="evenodd" d="${NESTED_D}"/></svg>`;
    const areas = subpathAreas(extractPathDs(normalizeWinding(svg))[0]);
    expect(sign(areas[1])).toBe(-sign(areas[0]));
  });

  test('fill-rule inherited from ancestor <g> style is honored', () => {
    const svg = `<svg viewBox="0 0 10 10"><g style="fill-rule: evenodd;"><path d="${NESTED_D}"/></g></svg>`;
    const areas = subpathAreas(extractPathDs(normalizeWinding(svg))[0]);
    expect(sign(areas[1])).toBe(-sign(areas[0]));
  });

  test('own fill-rule wins over ancestor', () => {
    const svg = `<svg viewBox="0 0 10 10"><g style="fill-rule: evenodd;"><path fill-rule="nonzero" d="${NESTED_D}"/></g></svg>`;
    expect(normalizeWinding(svg)).toBe(svg);
  });

  test('malformed path data is left untouched and does not throw', () => {
    const svg = `<svg><path style="fill-rule:evenodd" d="M banana"/></svg>`;
    expect(normalizeWinding(svg)).toBe(svg);
  });

  test('single-subpath evenodd is left untouched', () => {
    const svg = `<svg><path fill-rule="evenodd" d="M0 0H10V10H0Z"/></svg>`;
    expect(normalizeWinding(svg)).toBe(svg);
  });

  test('svg without evenodd takes the fast path unchanged', () => {
    const svg = `<svg><path d="M0 0L5 5"/></svg>`;
    expect(normalizeWinding(svg)).toBe(svg);
  });

  test('geometry is preserved: flipped subpath keeps identical |area|', () => {
    const svg = `<svg><path fill-rule="evenodd" d="${NESTED_D}"/></svg>`;
    const before = subpathAreas(NESTED_D);
    const after = subpathAreas(extractPathDs(normalizeWinding(svg))[0]);
    expect(after.map((a) => Math.abs(a))).toEqual(before.map((a) => Math.abs(a)));
  });
});
