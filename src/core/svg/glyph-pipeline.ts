/**
 * Glyph preprocessing pipeline — the single funnel every icon SVG passes
 * through before entering font conversion (svgicons2svgfont → svg2ttf →
 * woff/woff2/eot).
 *
 * Why this layer exists: the SVG world and the font world have different
 * semantics (fill-rule, <use>/<defs> indirection, arcs, masks...). Third-
 * party converters faithfully copy geometry but drop SVG-only semantics, so
 * every export/compatibility fix belongs HERE, as a transform — never as a
 * patch to the converter libraries and never inline at a call site.
 *
 * Design rules (enforced by test/unit/glyph-pipeline.test.js):
 * - Each transform is a named, pure string → string function with no
 *   environment dependencies (works in renderer, CLI and plain Node).
 * - Transforms run in registry order. ORDER MATTERS:
 *     1. flatten-use-refs first — later steps strip the <defs> it reads.
 *     2. fix-degenerate-arcs before normalize-winding — winding
 *        re-serializes evenodd paths and must see repaired arc data.
 *     3. strip-non-renderable before normalize-winding — hidden geometry
 *        must not participate in containment analysis.
 * - A throwing transform is skipped (its input passes through unchanged)
 *   so one bad icon or a buggy step degrades that step, never the export.
 * - Every transform must be idempotent: f(f(x)) === f(x).
 *
 * Adding a step: implement it as a pure function, register it here with a
 * name + description, and update the frozen manifest in
 * test/unit/glyph-pipeline.test.js. The two-file change is deliberate — it
 * forces order/idempotence review on every pipeline modification.
 */
import { flattenSvgUseRefs, fixDegenerateArcs, stripNonRenderable } from './transforms';
import { normalizeWinding } from './normalize-winding';

export interface GlyphTransform {
  /** unique kebab-case id, frozen by the pipeline guard test */
  name: string;
  /** the compatibility problem this step solves */
  description: string;
  apply: (svg: string) => string;
}

export const GLYPH_TRANSFORMS: readonly GlyphTransform[] = [
  {
    name: 'flatten-use-refs',
    description: 'Inline <use xlink:href="#id"> refs (Sketch/Figma defs indirection)',
    apply: flattenSvgUseRefs,
  },
  {
    name: 'fix-degenerate-arcs',
    description: 'Remove zero-radius arc segments that crash svg2ttf',
    apply: fixDegenerateArcs,
  },
  {
    name: 'strip-non-renderable',
    description: 'Strip defs/mask/clip-path so hidden geometry never becomes outlines',
    apply: stripNonRenderable,
  },
  {
    name: 'normalize-winding',
    description: 'evenodd → nonzero winding fix for boolean-op icons (issue #2)',
    apply: normalizeWinding,
  },
];

export type GlyphTransformErrorHandler = (step: string, err: unknown) => void;

/**
 * Run an explicit transform list. Exported separately from prepareSvgForFont
 * so tests can inject faulty transforms and verify error isolation.
 */
export function runGlyphTransforms(
  svg: string,
  transforms: readonly GlyphTransform[],
  onStepError?: GlyphTransformErrorHandler
): string {
  let out = svg;
  for (const t of transforms) {
    try {
      const next = t.apply(out);
      // defensive: a transform returning a non-string must not poison the chain
      if (typeof next === 'string') out = next;
    } catch (err) {
      onStepError?.(t.name, err);
    }
  }
  return out;
}

/** The one entry point font generation must use for every glyph. */
export function prepareSvgForFont(svg: string, onStepError?: GlyphTransformErrorHandler): string {
  return runGlyphTransforms(svg, GLYPH_TRANSFORMS, onStepError);
}
