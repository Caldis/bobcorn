import { describe, it, expect } from 'vitest';
import { PRESETS, buildFilename, computeOutputSize } from '../../src/renderer/utils/export/presets';

describe('presets', () => {
  it('iOS preset has 3 rows: @1x/@2x/@3x PNG', () => {
    const ios = PRESETS.find((p) => p.key === 'ios');
    expect(ios).toBeDefined();
    expect(ios.rows).toHaveLength(3);
    expect(ios.rows.map((r) => r.scale)).toEqual([1, 2, 3]);
    expect(ios.rows.every((r) => r.format === 'png')).toBe(true);
    expect(ios.rows.every((r) => r.sizeMode === 'scale')).toBe(true);
  });

  it('Android preset has 5 rows: 48/72/96/144/192 px PNG', () => {
    const android = PRESETS.find((p) => p.key === 'android');
    expect(android).toBeDefined();
    expect(android.rows).toHaveLength(5);
    expect(android.rows.map((r) => r.pixelSize)).toEqual([48, 72, 96, 144, 192]);
    expect(android.rows.every((r) => r.sizeMode === 'pixel')).toBe(true);
  });

  it('Web preset has 2 rows: @1x/@2x PNG', () => {
    const web = PRESETS.find((p) => p.key === 'web');
    expect(web.rows).toHaveLength(2);
  });

  it('Favicon preset has 6 rows: 3 ICO + 3 PNG', () => {
    const fav = PRESETS.find((p) => p.key === 'favicon');
    expect(fav.rows).toHaveLength(6);
    expect(fav.rows.filter((r) => r.format === 'ico')).toHaveLength(3);
    expect(fav.rows.filter((r) => r.format === 'png')).toHaveLength(3);
    expect(fav.icoMerge).toBe(true);
  });

  it('React Native preset exists with 3 scale rows', () => {
    const rn = PRESETS.find((p) => p.key === 'rn');
    expect(rn).toBeDefined();
    expect(rn.rows).toHaveLength(3);
    expect(rn.rows.map((r) => r.scale)).toEqual([1, 2, 3]);
    expect(rn.rows.every((r) => r.format === 'png')).toBe(true);
    expect(rn.rows.every((r) => r.sizeMode === 'scale')).toBe(true);
  });
});

describe('buildFilename', () => {
  it('scale mode: home @2x png -> home@2x.png', () => {
    expect(buildFilename('home', { sizeMode: 'scale', scale: 2, format: 'png' })).toBe('home@2x.png');
  });

  it('pixel mode: home 48px png -> home-48px.png', () => {
    expect(buildFilename('home', { sizeMode: 'pixel', pixelSize: 48, format: 'png' })).toBe('home-48px.png');
  });

  it('SVG always: home.svg (no size suffix)', () => {
    expect(buildFilename('home', { sizeMode: 'scale', scale: 2, format: 'svg' })).toBe('home.svg');
  });

  it('scale 1x omits suffix: home.png', () => {
    expect(buildFilename('home', { sizeMode: 'scale', scale: 1, format: 'png' })).toBe('home.png');
  });

  it('fractional scale: home@1.5x.png', () => {
    expect(buildFilename('home', { sizeMode: 'scale', scale: 1.5, format: 'png' })).toBe('home@1.5x.png');
  });

  it('ICO format pixel mode: home-16px.ico', () => {
    expect(buildFilename('home', { sizeMode: 'pixel', pixelSize: 16, format: 'ico' })).toBe('home-16px.ico');
  });

  it('SVG format ignores pixel mode too: home.svg', () => {
    expect(buildFilename('home', { sizeMode: 'pixel', pixelSize: 48, format: 'svg' })).toBe('home.svg');
  });

  it('PDF format with scale: home@2x.pdf', () => {
    expect(buildFilename('home', { sizeMode: 'scale', scale: 2, format: 'pdf' })).toBe('home@2x.pdf');
  });
});

describe('computeOutputSize', () => {
  it('scale mode: viewBox 24, @2x -> 48', () => {
    expect(computeOutputSize({ sizeMode: 'scale', scale: 2, pixelSize: 0 }, 24)).toBe(48);
  });

  it('pixel mode: returns pixelSize directly', () => {
    expect(computeOutputSize({ sizeMode: 'pixel', pixelSize: 64, scale: 1 }, 24)).toBe(64);
  });

  it('non-square viewBox: uses longest side', () => {
    expect(computeOutputSize({ sizeMode: 'scale', scale: 2, pixelSize: 0 }, 24, 16)).toBe(48);
  });

  it('scale 0.5: viewBox 24 -> 12', () => {
    expect(computeOutputSize({ sizeMode: 'scale', scale: 0.5, pixelSize: 0 }, 24)).toBe(12);
  });

  it('scale 1: returns viewBox size directly', () => {
    expect(computeOutputSize({ sizeMode: 'scale', scale: 1, pixelSize: 0 }, 24)).toBe(24);
  });
});
