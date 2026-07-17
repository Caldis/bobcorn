/**
 * Shared SVG string transforms for the glyph pipeline.
 *
 * Pure regex, no DOM — must stay environment-agnostic (renderer / CLI / Node).
 * These were previously duplicated in core/operations/export-font.ts and
 * renderer/utils/generators/iconfontGenerator; this module is now the single
 * source of truth. Each function is a pure string → string step registered in
 * ./glyph-pipeline.ts.
 */

// ---------------------------------------------------------------------------
// flattenSvgUseRefs — resolve <use xlink:href="#id"/> by inlining the
// referenced element from <defs>.
//
// Many design tools (Sketch, Figma) export SVGs with path data in <defs>
// and render via <use>:
//   <defs><path id="path-1" d="M..."/></defs>
//   <use fill="#000" xlink:href="#path-1"/>
//
// This breaks both font generation (strip-non-renderable removes <defs>,
// losing the path data) and symbol sprites (all icons share id="path-1" →
// collision). After flattening: <path d="M..." fill="#000"/>
// ---------------------------------------------------------------------------

export function flattenSvgUseRefs(svg: string): string {
  // Step 1: Build ID -> element map from <defs> blocks
  const idMap: Record<string, { tag: string; attrs: string; inner?: string }> = {};

  const defsRe = /<defs[^>]*>([\s\S]*?)<\/defs>/gi;
  let dm;
  while ((dm = defsRe.exec(svg)) !== null) {
    const body = dm[1];
    const elemRe = /<(\w+)\s+([^>]*?\bid="([^"]+)"[^>]*?)(?:\s*\/>|>([\s\S]*?)<\/\1>)/g;
    let em;
    while ((em = elemRe.exec(body)) !== null) {
      const [, tag, allAttrs, id, inner] = em;
      idMap[id] = {
        tag,
        attrs: allAttrs.replace(/\s*\bid="[^"]*"/, '').trim(),
        inner,
      };
    }
  }

  if (Object.keys(idMap).length === 0) return svg;

  // Step 2: Replace <use href="#id"> with inlined element
  let result = svg.replace(
    /<use\s+([^>]*?(?:xlink:)?href="#([^"]+)"[^>]*?)(?:\s*\/>|\s*><\/use>)/gi,
    (match, allAttrs: string, refId: string) => {
      const ref = idMap[refId];
      if (!ref) return match;

      const useAttrs = allAttrs
        .replace(/\s*(?:xlink:)?href="[^"]*"/g, '')
        .replace(/\s*\bid="[^"]*"/g, '')
        .trim();

      const merged = [ref.attrs, useAttrs].filter(Boolean).join(' ');

      return ref.inner != null
        ? `<${ref.tag} ${merged}>${ref.inner}</${ref.tag}>`
        : `<${ref.tag} ${merged}/>`;
    }
  );

  // Step 3: Remove <defs> and <mask> blocks (referenced elements already
  // inlined; Sketch-pattern masks would otherwise leak child geometry into
  // glyph outlines).
  result = result.replace(/<defs[^>]*>[\s\S]*?<\/defs>/gi, '');
  result = result.replace(/<mask[^>]*>[\s\S]*?<\/mask>/gi, '');

  return result;
}

// ---------------------------------------------------------------------------
// fixDegenerateArcs — remove zero-radius arc segments that crash svg2ttf.
// ---------------------------------------------------------------------------

const ARC_FIX_RE = /a0,0,0,0,1,0,0/g;

export function fixDegenerateArcs(svg: string): string {
  return svg.replace(ARC_FIX_RE, '');
}

// ---------------------------------------------------------------------------
// stripNonRenderable — strip elements svgicons2svgfont incorrectly extracts
// as glyph shapes. <defs> may contain <clipPath>/<mask>/<filter> whose child
// shapes are NOT visible geometry, but svgicons2svgfont treats all
// <rect>/<path>/etc. as glyph outlines regardless of context.
// ---------------------------------------------------------------------------

const DEFS_RE = /<defs[\s\S]*?<\/defs>/gi;
const MASK_ELEM_RE = /<mask[\s\S]*?<\/mask>/gi;
const CLIP_PATH_ATTR_RE = /\s*clip-path="[^"]*"/gi;
const MASK_ATTR_RE = /\s*mask="[^"]*"/gi;

export function stripNonRenderable(svg: string): string {
  return svg
    .replace(DEFS_RE, '')
    .replace(MASK_ELEM_RE, '')
    .replace(CLIP_PATH_ATTR_RE, '')
    .replace(MASK_ATTR_RE, '');
}
