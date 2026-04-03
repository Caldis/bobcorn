/**
 * @vitest-environment jsdom
 */
import { describe, test, expect } from 'vitest';
import {
  WEIGHT_LEVELS,
  SCALE_LEVELS,
  REGULAR_INDEX,
  MEDIUM_SCALE_INDEX,
  TOTAL_VARIANTS,
  buildVariantName,
  allVariantCombinations,
  getViewBoxSize,
  injectWeightFilter,
  applyScaleTransform,
} from '../../src/renderer/utils/svg/variants';

describe('variant constants', () => {
  test('9 weight levels', () => {
    expect(WEIGHT_LEVELS).toHaveLength(9);
  });

  test('3 scale levels', () => {
    expect(SCALE_LEVELS).toHaveLength(3);
  });

  test('Regular is index 3', () => {
    expect(WEIGHT_LEVELS[REGULAR_INDEX].key).toBe('regular');
    expect(WEIGHT_LEVELS[REGULAR_INDEX].operator).toBeNull();
  });

  test('Medium scale is index 1', () => {
    expect(SCALE_LEVELS[MEDIUM_SCALE_INDEX].key).toBe('medium');
    expect(SCALE_LEVELS[MEDIUM_SCALE_INDEX].factor).toBe(1.0);
  });

  test('total variants = 26', () => {
    expect(TOTAL_VARIANTS).toBe(26);
  });

  test('allVariantCombinations returns 26 entries', () => {
    const combos = allVariantCombinations();
    expect(combos).toHaveLength(26);
  });

  test('allVariantCombinations excludes Regular+Medium', () => {
    const combos = allVariantCombinations();
    const hasOriginal = combos.some(
      (c) => c.weight.key === 'regular' && c.scale.key === 'medium'
    );
    expect(hasOriginal).toBe(false);
  });
});

describe('buildVariantName', () => {
  const regular = WEIGHT_LEVELS[REGULAR_INDEX];
  const bold = WEIGHT_LEVELS.find((w) => w.key === 'bold');
  const thin = WEIGHT_LEVELS.find((w) => w.key === 'thin');
  const medium = SCALE_LEVELS[MEDIUM_SCALE_INDEX];
  const small = SCALE_LEVELS.find((s) => s.key === 'small');
  const large = SCALE_LEVELS.find((s) => s.key === 'large');

  test('bold + medium = home.bold', () => {
    expect(buildVariantName('home', bold, medium)).toBe('home.bold');
  });

  test('thin + small = home.thin.small', () => {
    expect(buildVariantName('home', thin, small)).toBe('home.thin.small');
  });

  test('regular + small = home.small', () => {
    expect(buildVariantName('home', regular, small)).toBe('home.small');
  });

  test('regular + large = home.large', () => {
    expect(buildVariantName('home', regular, large)).toBe('home.large');
  });
});

describe('getViewBoxSize', () => {
  test('extracts from standard viewBox', () => {
    expect(getViewBoxSize('<svg viewBox="0 0 24 24"></svg>')).toBe(24);
  });

  test('returns max of width/height', () => {
    expect(getViewBoxSize('<svg viewBox="0 0 48 32"></svg>')).toBe(48);
  });

  test('defaults to 24 if no viewBox', () => {
    expect(getViewBoxSize('<svg></svg>')).toBe(24);
  });
});

describe('injectWeightFilter', () => {
  const svg24 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 20v-6h4v6z"/></svg>';
  const bold = WEIGHT_LEVELS.find((w) => w.key === 'bold');
  const regular = WEIGHT_LEVELS[REGULAR_INDEX];

  test('Regular returns SVG unchanged', () => {
    expect(injectWeightFilter(svg24, regular)).toBe(svg24);
  });

  test('Bold injects feMorphology dilate filter', () => {
    const result = injectWeightFilter(svg24, bold);
    expect(result).toContain('feMorphology');
    expect(result).toContain('operator="dilate"');
    expect(result).toContain('radius="0.5"');
    expect(result).toContain('filter="url(#bobcorn-weight)"');
  });

  test('scales radius for larger viewBox', () => {
    const svg100 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 20z"/></svg>';
    const result = injectWeightFilter(svg100, bold);
    // 0.5 * (100/24) ≈ 2.083
    const radiusMatch = result.match(/radius="([^"]+)"/);
    expect(Number(radiusMatch[1])).toBeCloseTo(2.083, 1);
  });
});

describe('applyScaleTransform', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0z"/></svg>';
  const medium = SCALE_LEVELS[MEDIUM_SCALE_INDEX];
  const small = SCALE_LEVELS.find((s) => s.key === 'small');
  const large = SCALE_LEVELS.find((s) => s.key === 'large');

  test('Medium returns SVG unchanged', () => {
    expect(applyScaleTransform(svg, medium)).toBe(svg);
  });

  test('Small expands viewBox by 20%', () => {
    const result = applyScaleTransform(svg, small);
    // 24 * 1.2 = 28.8, offset = -(28.8-24)/2 = -2.4
    expect(result).toContain('viewBox="-2.4 -2.4 28.8 28.8"');
  });

  test('Large shrinks viewBox by 15%', () => {
    const result = applyScaleTransform(svg, large);
    // 24 * 0.85 = 20.4, offset = (24-20.4)/2 = 1.8
    expect(result).toContain('viewBox="1.8 1.8 20.4 20.4"');
  });
});
