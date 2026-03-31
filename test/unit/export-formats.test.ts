import { describe, it, expect } from 'vitest';

describe('format-aware @font-face generation', () => {
  function buildFontFaceSrc(
    name: string,
    formats: { woff2?: boolean; ttf?: boolean; woff?: boolean; eot?: boolean }
  ): string {
    const srcParts: string[] = [];
    if (formats.eot) srcParts.push(`url('${name}.eot?#iefix') format('embedded-opentype')`);
    srcParts.push(`url('${name}.woff2') format('woff2')`);
    if (formats.woff) srcParts.push(`url('${name}.woff') format('woff')`);
    srcParts.push(`url('${name}.ttf') format('truetype')`);
    return srcParts.join(',\n       ');
  }

  it('includes only required formats when optional are disabled', () => {
    const src = buildFontFaceSrc('testfont', { woff2: true, ttf: true, woff: false, eot: false });
    expect(src).toContain("url('testfont.woff2') format('woff2')");
    expect(src).toContain("url('testfont.ttf') format('truetype')");
    expect(src).not.toContain('.eot');
    expect(src).not.toContain("format('woff')");
  });

  it('includes all formats when all selected', () => {
    const src = buildFontFaceSrc('testfont', { woff2: true, ttf: true, woff: true, eot: true });
    expect(src).toContain('.eot');
    expect(src).toContain('.woff2');
    expect(src).toContain("format('woff')");
    expect(src).toContain('.ttf');
  });

  it('orders formats correctly: eot first, then woff2, woff, ttf', () => {
    const src = buildFontFaceSrc('test', { woff2: true, ttf: true, woff: true, eot: true });
    const eotIdx = src.indexOf('.eot');
    const woff2Idx = src.indexOf('.woff2');
    const woffIdx = src.indexOf("format('woff')");
    const ttfIdx = src.indexOf('.ttf');
    expect(eotIdx).toBeLessThan(woff2Idx);
    expect(woff2Idx).toBeLessThan(woffIdx);
    expect(woffIdx).toBeLessThan(ttfIdx);
  });
});
