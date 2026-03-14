/**
 * Unit tests for src/renderer/utils/svg/index.js
 *
 * @vitest-environment jsdom
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'icons');

// The SVG class uses String.prototype.replaceAll from tools, but we need the
// custom implementation that accepts regex patterns.  Import tools first so the
// prototype extension is applied before SVG is loaded.
import '../../src/renderer/utils/tools/index.js';
import SVG from '../../src/renderer/utils/svg/index.js';

// ── Load real fixture SVGs ──────────────────────────────────────
const fixtures = {};

beforeAll(() => {
  const files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.svg'));
  for (const file of files) {
    const name = path.basename(file, '.svg');
    fixtures[name] = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8');
  }
});

// ── Constructor & basic accessors ───────────────────────────────
describe('SVG constructor', () => {
  test('parses an SVG string into a DOM element', () => {
    const svg = new SVG(fixtures.heart);
    expect(svg.getSVG()).toBeTruthy();
    expect(svg.getSVG().tagName).toBe('svg');
  });

  test('works with every fixture file', () => {
    for (const [name, content] of Object.entries(fixtures)) {
      const svg = new SVG(content);
      expect(svg.getSVG(), `fixture "${name}" failed to parse`).toBeTruthy();
    }
  });
});

// ── getInnerHTML / getOuterHTML ──────────────────────────────────
describe('getInnerHTML / getOuterHTML', () => {
  test('getOuterHTML wraps content with <svg> tag', () => {
    const svg = new SVG(fixtures.star);
    const outer = svg.getOuterHTML();
    expect(outer).toMatch(/^<svg[\s>]/);
    expect(outer).toMatch(/<\/svg>$/);
  });

  test('getInnerHTML returns content without outer <svg> tag', () => {
    const svg = new SVG(fixtures.star);
    const inner = svg.getInnerHTML();
    expect(inner).not.toMatch(/^<svg/);
    expect(inner).toContain('<path');
  });

  test('getOuterHTML includes the inner path content', () => {
    const svg = new SVG(fixtures.home);
    const outer = svg.getOuterHTML();
    const inner = svg.getInnerHTML();
    // Both should contain the same path data
    expect(outer).toContain('M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z');
    expect(inner).toContain('M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z');
    // outerHTML should be longer (wraps with <svg>)
    expect(outer.length).toBeGreaterThan(inner.length);
  });
});

// ── viewBox operations ──────────────────────────────────────────
describe('viewBox operations', () => {
  test('getViewBox reads the viewBox attribute', () => {
    const svg = new SVG(fixtures.search);
    expect(svg.getViewBox()).toBe('0 0 24 24');
  });

  test('setViewBox updates the viewBox attribute', () => {
    const svg = new SVG(fixtures.search);
    svg.setViewBox('0 0 1024 1024');
    expect(svg.getViewBox()).toBe('0 0 1024 1024');
  });

  test('setViewBox is chainable', () => {
    const svg = new SVG(fixtures.heart);
    const result = svg.setViewBox('0 0 512 512');
    expect(result).toBe(svg);
  });
});

// ── formatSVG ───────────────────────────────────────────────────
describe('formatSVG', () => {
  test('removes width and height attributes', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><path d="M10 20v-6h4v6"/></svg>';
    const svg = new SVG(input);
    svg.formatSVG();
    expect(svg.getWidth()).toBeNull();
    expect(svg.getHeight()).toBeNull();
  });

  test('sets x="0px" and y="0px"', () => {
    const svg = new SVG(fixtures.settings);
    svg.formatSVG();
    expect(svg.getX()).toBe('0px');
    expect(svg.getY()).toBe('0px');
  });

  test('makes viewBox square using the larger dimension', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200"><rect width="100" height="200"/></svg>';
    const svg = new SVG(input);
    svg.formatSVG();
    expect(svg.getViewBox()).toBe('0 0 200 200');
  });

  test('keeps viewBox square when already square', () => {
    const svg = new SVG(fixtures.heart);
    svg.formatSVG();
    expect(svg.getViewBox()).toBe('0 0 24 24');
  });

  test('removes inline style element', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<style>.cls-1{fill:#000;}</style>' +
      '<path class="cls-1" d="M10 10"/>' +
      '</svg>';
    const svg = new SVG(input);
    svg.formatSVG();
    expect(svg.getOuterHTML()).not.toContain('<style');
  });

  test('handles SVG without style element gracefully', () => {
    const svg = new SVG(fixtures.star);
    // Should not throw
    expect(() => svg.formatSVG()).not.toThrow();
  });

  test('is chainable', () => {
    const svg = new SVG(fixtures.home);
    const result = svg.formatSVG();
    expect(result).toBe(svg);
  });

  test('works on all fixture files', () => {
    for (const [name, content] of Object.entries(fixtures)) {
      const svg = new SVG(content);
      expect(() => svg.formatSVG(), `formatSVG threw for "${name}"`).not.toThrow();
      const vb = svg.getViewBox().split(' ');
      expect(Number(vb[2]), `viewBox not square for "${name}"`).toBe(Number(vb[3]));
    }
  });
});

// ── width / height / x / y ──────────────────────────────────────
describe('dimension accessors', () => {
  test('setWidth / getWidth', () => {
    const svg = new SVG(fixtures.heart);
    svg.setWidth('100px');
    expect(svg.getWidth()).toBe('100px');
  });

  test('delWidth removes width', () => {
    const svg = new SVG(fixtures.heart);
    svg.setWidth('100px');
    svg.delWidth();
    expect(svg.getWidth()).toBeNull();
  });

  test('setHeight / getHeight', () => {
    const svg = new SVG(fixtures.heart);
    svg.setHeight('50px');
    expect(svg.getHeight()).toBe('50px');
  });

  test('delHeight removes height', () => {
    const svg = new SVG(fixtures.heart);
    svg.setHeight('50px');
    svg.delHeight();
    expect(svg.getHeight()).toBeNull();
  });

  test('setX / getX / delX', () => {
    const svg = new SVG(fixtures.heart);
    svg.setX('5px');
    expect(svg.getX()).toBe('5px');
    svg.delX();
    expect(svg.getX()).toBeNull();
  });

  test('setY / getY / delY', () => {
    const svg = new SVG(fixtures.heart);
    svg.setY('10px');
    expect(svg.getY()).toBe('10px');
    svg.delY();
    expect(svg.getY()).toBeNull();
  });
});

// ── setSVG replaces content ─────────────────────────────────────
describe('setSVG', () => {
  test('replaces SVG content entirely', () => {
    const svg = new SVG(fixtures.heart);
    expect(svg.getInnerHTML()).toContain('21.35');

    svg.setSVG(fixtures.star);
    expect(svg.getInnerHTML()).not.toContain('21.35');
    expect(svg.getInnerHTML()).toContain('L12 2');
  });

  test('handles single-quoted attributes by converting to double quotes', () => {
    const input = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M10 10'/></svg>";
    const svg = new SVG(input);
    expect(svg.getSVG()).toBeTruthy();
    expect(svg.getViewBox()).toBe('0 0 24 24');
  });
});
