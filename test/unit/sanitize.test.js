/**
 * Unit tests for app/utils/sanitize.js
 *
 * @vitest-environment jsdom
 */
import { describe, test, expect } from 'vitest';
import { sanitizeSVG } from '../../app/utils/sanitize.js';

describe('sanitizeSVG', () => {
  // ── Preserve legitimate SVG elements ──────────────────────────
  test('preserves circle element', () => {
    const input = '<svg><circle cx="50" cy="50" r="40"/></svg>';
    const result = sanitizeSVG(input);
    expect(result).toContain('<circle');
    expect(result).toContain('cx="50"');
  });

  test('preserves path element', () => {
    const input = '<svg><path d="M10 10 L90 90"/></svg>';
    const result = sanitizeSVG(input);
    expect(result).toContain('<path');
    expect(result).toContain('d="M10 10 L90 90"');
  });

  test('preserves rect element', () => {
    const input = '<svg><rect x="10" y="10" width="80" height="80"/></svg>';
    const result = sanitizeSVG(input);
    expect(result).toContain('<rect');
  });

  test('preserves g, line, polygon, polyline, ellipse elements', () => {
    const input =
      '<svg>' +
      '<g><line x1="0" y1="0" x2="100" y2="100"/></g>' +
      '<polygon points="50,0 100,100 0,100"/>' +
      '<polyline points="0,0 50,50 100,0"/>' +
      '<ellipse cx="50" cy="50" rx="40" ry="20"/>' +
      '</svg>';
    const result = sanitizeSVG(input);
    expect(result).toContain('<g>');
    expect(result).toContain('<line');
    expect(result).toContain('<polygon');
    expect(result).toContain('<polyline');
    expect(result).toContain('<ellipse');
  });

  // ── Remove dangerous content ──────────────────────────────────
  test('removes script tags', () => {
    const input = '<svg><script>alert("xss")</script><circle r="5"/></svg>';
    const result = sanitizeSVG(input);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<circle');
  });

  test('removes onclick handler', () => {
    const input = '<svg><rect onclick="alert(1)" width="10" height="10"/></svg>';
    const result = sanitizeSVG(input);
    expect(result).not.toContain('onclick');
    expect(result).toContain('<rect');
  });

  test('removes onerror handler', () => {
    const input = '<svg><image onerror="alert(1)" href="x.png"/></svg>';
    const result = sanitizeSVG(input);
    expect(result).not.toContain('onerror');
  });

  test('removes onload handler', () => {
    const input = '<svg onload="alert(1)"><rect width="10" height="10"/></svg>';
    const result = sanitizeSVG(input);
    expect(result).not.toContain('onload');
  });

  // ── Handle null / undefined / empty ───────────────────────────
  test('returns empty string for null', () => {
    expect(sanitizeSVG(null)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(sanitizeSVG(undefined)).toBe('');
  });

  test('returns empty string for empty string', () => {
    expect(sanitizeSVG('')).toBe('');
  });

  // ── Preserve special SVG attributes ───────────────────────────
  test('preserves xlink:href attribute', () => {
    const input = '<svg><use xlink:href="#icon-star"/></svg>';
    const result = sanitizeSVG(input);
    expect(result).toContain('xlink:href');
    expect(result).toContain('#icon-star');
  });

  test('preserves xml:space attribute', () => {
    const input = '<svg xml:space="preserve"><text>Hello</text></svg>';
    const result = sanitizeSVG(input);
    expect(result).toContain('xml:space');
    expect(result).toContain('preserve');
  });

  test('preserves use element (added via ADD_TAGS)', () => {
    const input = '<svg><use href="#my-symbol"/></svg>';
    const result = sanitizeSVG(input);
    expect(result).toContain('<use');
  });
});
