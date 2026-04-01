/**
 * Unit tests for src/renderer/utils/svg/index.js
 *
 * @vitest-environment jsdom
 */
import { describe, test, expect } from 'vitest';

// The SVG class uses String.prototype.replaceAll from tools, but we need the
// custom implementation that accepts regex patterns.  Import tools first so the
// prototype extension is applied before SVG is loaded.
import '../../src/renderer/utils/tools/index.ts';
import SVG from '../../src/renderer/utils/svg/index.ts';

// ── Inline fixture SVGs (no external file dependency) ──────────
const fixtures = {
  heart: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  home: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
  search: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
  settings: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z"/></svg>',
  star: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
};

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
