/**
 * Bake pipeline tests
 *
 * Tests vectorizeImageData and buildVariantMeta.
 * Note: rasterizeSvgAsync and bakeSvgVariant require DOM (Canvas/Image)
 * and are tested via E2E. Here we test the pure-logic parts.
 */
import { describe, test, expect } from 'vitest';
import { buildVariantMeta } from '../../src/renderer/utils/svg/bake';
import { WEIGHT_LEVELS, SCALE_LEVELS } from '../../src/renderer/utils/svg/variants';

describe('buildVariantMeta', () => {
  test('creates correct meta for bold + medium', () => {
    const bold = WEIGHT_LEVELS.find((w) => w.key === 'bold');
    const medium = SCALE_LEVELS.find((s) => s.key === 'medium');
    const meta = buildVariantMeta(bold, medium);
    expect(meta).toEqual({
      weight: 'bold',
      weightRadius: 0.5,
      scale: 'medium',
      scaleFactor: 1.0,
      renderingMode: null,
      layers: null,
    });
  });

  test('creates correct meta for thin + small', () => {
    const thin = WEIGHT_LEVELS.find((w) => w.key === 'thin');
    const small = SCALE_LEVELS.find((s) => s.key === 'small');
    const meta = buildVariantMeta(thin, small);
    expect(meta).toEqual({
      weight: 'thin',
      weightRadius: 0.5,
      scale: 'small',
      scaleFactor: 1.2,
      renderingMode: null,
      layers: null,
    });
  });

  test('Phase 2 fields are null', () => {
    const w = WEIGHT_LEVELS[0];
    const s = SCALE_LEVELS[0];
    const meta = buildVariantMeta(w, s);
    expect(meta.renderingMode).toBeNull();
    expect(meta.layers).toBeNull();
  });
});
