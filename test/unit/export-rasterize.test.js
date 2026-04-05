import { describe, it, expect } from 'vitest';
import { parseViewBox, prepareSvgForRender } from '../../src/renderer/utils/export/rasterize';

const SIMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>';
const NO_VIEWBOX_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/></svg>';
const NONSQUARE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24"><rect width="48" height="24"/></svg>';

describe('parseViewBox', () => {
  it('parses standard viewBox', () => {
    expect(parseViewBox(SIMPLE_SVG)).toEqual({ x: 0, y: 0, w: 24, h: 24 });
  });

  it('returns default 24x24 when no viewBox', () => {
    expect(parseViewBox(NO_VIEWBOX_SVG)).toEqual({ x: 0, y: 0, w: 24, h: 24 });
  });

  it('parses non-square viewBox', () => {
    expect(parseViewBox(NONSQUARE_SVG)).toEqual({ x: 0, y: 0, w: 48, h: 24 });
  });

  it('returns default 24x24 for null input', () => {
    expect(parseViewBox(null)).toEqual({ x: 0, y: 0, w: 24, h: 24 });
  });

  it('returns default 24x24 for undefined input', () => {
    expect(parseViewBox(undefined)).toEqual({ x: 0, y: 0, w: 24, h: 24 });
  });

  it('returns default 24x24 for empty string', () => {
    expect(parseViewBox('')).toEqual({ x: 0, y: 0, w: 24, h: 24 });
  });

  it('parses viewBox with negative offset', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 28 28"><rect/></svg>';
    expect(parseViewBox(svg)).toEqual({ x: -2, y: -2, w: 28, h: 28 });
  });
});

describe('prepareSvgForRender', () => {
  it('injects width and height matching target size', () => {
    const result = prepareSvgForRender(SIMPLE_SVG, 64);
    expect(result).toContain('width="64"');
    expect(result).toContain('height="64"');
  });

  it('does not double-inject if width already present', () => {
    const svgWithSize = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M0 0"/></svg>';
    const result = prepareSvgForRender(svgWithSize, 64);
    const widthMatches = result.match(/width="/g);
    expect(widthMatches).toHaveLength(1);
  });

  it('handles non-square: scales to fit within target, centered', () => {
    const result = prepareSvgForRender(NONSQUARE_SVG, 64);
    expect(result).toContain('width="64"');
    expect(result).toContain('height="32"');
  });

  it('handles very small target (16px)', () => {
    const result = prepareSvgForRender(SIMPLE_SVG, 16);
    expect(result).toContain('width="16"');
    expect(result).toContain('height="16"');
  });
});
