import { describe, it, expect } from 'vitest';
import { PRESETS, buildFilename, computeOutputSize } from '../../src/renderer/utils/export/presets';

const KNOWN_FORMATS = ['svg', 'png', 'jpg', 'webp', 'pdf', 'ico'];

describe('cross-module: preset rows produce expected filenames', () => {
  it('iOS @2x preset row with viewBox 24 produces home@2x.png at 48px', () => {
    const ios = PRESETS.find((p) => p.key === 'ios');
    const row2x = ios.rows.find((r) => r.scale === 2);
    const size = computeOutputSize(row2x, 24);
    const filename = buildFilename('home', row2x);
    expect(size).toBe(48);
    expect(filename).toBe('home@2x.png');
  });

  it('Android 96px preset row produces home-96px.png at 96px', () => {
    const android = PRESETS.find((p) => p.key === 'android');
    const row96 = android.rows.find((r) => r.pixelSize === 96);
    const size = computeOutputSize(row96, 24);
    const filename = buildFilename('home', row96);
    expect(size).toBe(96);
    expect(filename).toBe('home-96px.png');
  });

  it('Favicon 32px ICO row produces home-32px.ico at 32px', () => {
    const fav = PRESETS.find((p) => p.key === 'favicon');
    const row32 = fav.rows.find((r) => r.pixelSize === 32 && r.format === 'ico');
    const size = computeOutputSize(row32, 24);
    const filename = buildFilename('home', row32);
    expect(size).toBe(32);
    expect(filename).toBe('home-32px.ico');
  });
});

describe('all presets have valid rows', () => {
  PRESETS.forEach((preset) => {
    it(`preset "${preset.key}" has at least one row`, () => {
      expect(preset.rows.length).toBeGreaterThan(0);
    });

    preset.rows.forEach((row, i) => {
      it(`preset "${preset.key}" row ${i}: format "${row.format}" is a known format`, () => {
        expect(KNOWN_FORMATS).toContain(row.format);
      });

      it(`preset "${preset.key}" row ${i}: scale is positive`, () => {
        expect(row.scale).toBeGreaterThan(0);
      });

      it(`preset "${preset.key}" row ${i}: sizeMode is "scale" or "pixel"`, () => {
        expect(['scale', 'pixel']).toContain(row.sizeMode);
      });

      if (row.sizeMode === 'pixel') {
        it(`preset "${preset.key}" row ${i}: pixelSize > 0 in pixel mode`, () => {
          expect(row.pixelSize).toBeGreaterThan(0);
        });
      }
    });
  });
});

describe('scale <-> pixel conversion round-trip', () => {
  it('scale * viewBoxSize produces correct pixel size (scale 2, viewBox 24 -> 48)', () => {
    const viewBoxSize = 24;
    const scale = 2;
    const pixels = computeOutputSize({ sizeMode: 'scale', scale, pixelSize: 0 }, viewBoxSize);
    expect(pixels).toBe(scale * viewBoxSize);
  });

  it('scale * viewBoxSize produces correct pixel size (scale 3, viewBox 16 -> 48)', () => {
    const viewBoxSize = 16;
    const scale = 3;
    const pixels = computeOutputSize({ sizeMode: 'scale', scale, pixelSize: 0 }, viewBoxSize);
    expect(pixels).toBe(scale * viewBoxSize);
  });

  it('pixel mode ignores viewBox entirely', () => {
    const pixels = computeOutputSize({ sizeMode: 'pixel', scale: 1, pixelSize: 192 }, 24);
    expect(pixels).toBe(192);
    // Same pixel size regardless of viewBox
    const pixels2 = computeOutputSize({ sizeMode: 'pixel', scale: 1, pixelSize: 192 }, 48);
    expect(pixels2).toBe(192);
  });

  it('fractional scale rounds correctly (scale 1.5, viewBox 24 -> 36)', () => {
    const pixels = computeOutputSize({ sizeMode: 'scale', scale: 1.5, pixelSize: 0 }, 24);
    expect(pixels).toBe(36);
  });
});
