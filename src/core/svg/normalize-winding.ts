/**
 * normalize-winding — evenodd → nonzero winding normalization.
 *
 * Font glyphs rasterize with the nonzero winding rule only; the SVG
 * `fill-rule` attribute does not exist in font formats and is silently
 * dropped by the svgicons2svgfont → svg2ttf pipeline. Design-tool boolean
 * ops (MasterGo/Figma "减去顶层" subtract) export a single <path> whose
 * subpaths all share one winding direction and rely on
 * `fill-rule: evenodd` to punch holes — under nonzero those holes fill
 * solid (GitHub issue #2).
 *
 * This transform rewrites the geometry of evenodd-declared <path> elements
 * so hole subpaths (odd containment depth) wind opposite to their outer
 * boundary. After normalization, evenodd and nonzero produce identical
 * rendering, so the fill-rule loss downstream no longer matters.
 *
 * Safety contract:
 * - Paths with effective fill-rule nonzero (the SVG default) are NEVER
 *   modified — same-direction nesting can be an intentional union there.
 * - Any parse failure or unexpected geometry leaves that path untouched.
 * - If no subpath needs flipping, the input string is returned unchanged
 *   (byte-identical), which also makes the transform idempotent.
 *
 * Known limitation: assumes subpaths are disjoint or strictly nested
 * (always true for boolean-op exports). Self-intersecting single subpaths
 * and partially overlapping siblings cannot be fixed by reversal and are
 * left as-is.
 */
import svgpath from 'svgpath';

type Pt = [number, number];

interface Seg {
  cmd: 'L' | 'C' | 'Q';
  /** absolute coordinates; the endpoint is always the last two values */
  args: number[];
}

interface SubPath {
  start: Pt;
  segs: Seg[];
  closed: boolean;
  poly: Pt[];
  area: number;
}

const CURVE_SAMPLES = 16;
/** subpaths with |signed area| below this are degenerate — never flipped */
const DEGENERATE_AREA = 1e-6;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function sampleCubic(from: Pt, a: number[], out: Pt[]): void {
  const [c1x, c1y, c2x, c2y, ex, ey] = a;
  for (let i = 1; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES;
    const u = 1 - t;
    out.push([
      u * u * u * from[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
      u * u * u * from[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey,
    ]);
  }
}

function sampleQuad(from: Pt, a: number[], out: Pt[]): void {
  const [cx, cy, ex, ey] = a;
  for (let i = 1; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES;
    const u = 1 - t;
    out.push([
      u * u * from[0] + 2 * u * t * cx + t * t * ex,
      u * u * from[1] + 2 * u * t * cy + t * t * ey,
    ]);
  }
}

/** Shoelace formula. SVG y-axis points down, so area > 0 = clockwise on screen. */
function signedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Ray-casting point-in-polygon test. */
function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Does `outer` contain `inner`? Majority vote over 3 spread-out sample
 * points of `inner`, so a single vertex landing exactly on `outer`'s
 * boundary cannot flip the verdict.
 */
function contains(outer: SubPath, inner: SubPath): boolean {
  const n = inner.poly.length;
  const picks = [0, Math.floor(n / 3), Math.floor((2 * n) / 3)];
  let votes = 0;
  for (const i of picks) {
    if (pointInPoly(inner.poly[i], outer.poly)) votes++;
  }
  return votes >= 2;
}

// ---------------------------------------------------------------------------
// Path parsing / serialization
// ---------------------------------------------------------------------------

/**
 * Parse a `d` attribute into absolute L/C/Q subpaths with flattened
 * polygons. Returns null when the data cannot be handled safely.
 */
function parseSubpaths(d: string): SubPath[] | null {
  let path;
  try {
    path = svgpath(d).abs().unshort().unarc();
  } catch {
    return null;
  }
  if ((path as unknown as { err?: string }).err) return null;

  const subs: SubPath[] = [];
  let cur: SubPath | null = null;
  let bail = false;

  const push = () => {
    if (cur && cur.segs.length > 0) subs.push(cur);
    cur = null;
  };

  path.iterate((seg, _idx, x, y) => {
    if (bail) return;
    const cmd = seg[0];

    // Per SVG spec, a drawing command right after Z starts a new subpath at
    // the previous subpath's initial point.
    if (cur && cur.closed && cmd !== 'M' && cmd !== 'Z' && cmd !== 'z') {
      const restart: Pt = cur.start;
      push();
      cur = { start: restart, segs: [], closed: false, poly: [], area: 0 };
    }

    switch (cmd) {
      case 'M':
        push();
        cur = {
          start: [seg[1] as number, seg[2] as number],
          segs: [],
          closed: false,
          poly: [],
          area: 0,
        };
        break;
      case 'L':
        cur?.segs.push({ cmd: 'L', args: [seg[1] as number, seg[2] as number] });
        break;
      case 'H':
        cur?.segs.push({ cmd: 'L', args: [seg[1] as number, y] });
        break;
      case 'V':
        cur?.segs.push({ cmd: 'L', args: [x, seg[1] as number] });
        break;
      case 'C':
        cur?.segs.push({ cmd: 'C', args: seg.slice(1) as number[] });
        break;
      case 'Q':
        cur?.segs.push({ cmd: 'Q', args: seg.slice(1) as number[] });
        break;
      case 'Z':
      case 'z':
        if (cur) cur.closed = true;
        break;
      default:
        // S/T are removed by unshort(), A by unarc() — anything else is
        // unexpected, refuse to touch this path.
        bail = true;
    }
  });
  push();

  if (bail || subs.length === 0) return null;

  for (const sub of subs) {
    const poly: Pt[] = [sub.start];
    let from: Pt = sub.start;
    for (const s of sub.segs) {
      if (s.cmd === 'L') poly.push([s.args[0], s.args[1]]);
      else if (s.cmd === 'C') sampleCubic(from, s.args, poly);
      else sampleQuad(from, s.args, poly);
      from = [s.args[s.args.length - 2], s.args[s.args.length - 1]];
    }
    sub.poly = poly;
    sub.area = signedArea(poly);
  }

  return subs;
}

/** Reverse a subpath's direction (segment order + control point swap). */
function reverseSubpath(sub: SubPath): SubPath {
  // endpoints[k] = point before segs[k]; last entry = final point
  const endpoints: Pt[] = [sub.start];
  for (const s of sub.segs) {
    endpoints.push([s.args[s.args.length - 2], s.args[s.args.length - 1]]);
  }

  const segs: Seg[] = [];
  for (let k = sub.segs.length - 1; k >= 0; k--) {
    const s = sub.segs[k];
    const from = endpoints[k];
    if (s.cmd === 'L') {
      segs.push({ cmd: 'L', args: [from[0], from[1]] });
    } else if (s.cmd === 'C') {
      segs.push({ cmd: 'C', args: [s.args[2], s.args[3], s.args[0], s.args[1], from[0], from[1]] });
    } else {
      segs.push({ cmd: 'Q', args: [s.args[0], s.args[1], from[0], from[1]] });
    }
  }

  return {
    ...sub,
    start: endpoints[endpoints.length - 1],
    segs,
    area: -sub.area,
  };
}

function fmt(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

function serializeSubpaths(subs: SubPath[]): string {
  const parts: string[] = [];
  for (const sub of subs) {
    parts.push(`M${fmt(sub.start[0])} ${fmt(sub.start[1])}`);
    for (const s of sub.segs) {
      parts.push(s.cmd + s.args.map(fmt).join(' '));
    }
    if (sub.closed) parts.push('Z');
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Winding analysis
// ---------------------------------------------------------------------------

/**
 * Normalize one evenodd `d` string. Returns the rewritten `d`, or null when
 * nothing needs to change (or the path cannot be handled safely).
 */
export function normalizePathWinding(d: string): string | null {
  const subs = parseSubpaths(d);
  if (!subs || subs.length < 2) return null;

  const solid = subs.filter((s) => Math.abs(s.area) > DEGENERATE_AREA);
  if (solid.length < 2) return null;

  // containers[i] = indices of subpaths that contain subs[i]
  const containers = subs.map((sub, i) =>
    subs
      .map((_, j) => j)
      .filter((j) => j !== i && Math.abs(subs[j].area) > DEGENERATE_AREA && contains(subs[j], sub))
  );
  const depth = containers.map((c) => c.length);

  const toFlip: number[] = [];
  for (let i = 0; i < subs.length; i++) {
    if (Math.abs(subs[i].area) <= DEGENERATE_AREA) continue;
    const dpt = depth[i];
    if (dpt === 0) continue; // top-level boundaries keep their direction

    // The unique depth-0 ancestor anchors the target direction for its tree.
    const rootIdx = containers[i].find((j) => depth[j] === 0);
    if (rootIdx === undefined) continue;

    const base = Math.sign(subs[rootIdx].area);
    const desired = dpt % 2 === 0 ? base : -base;
    if (Math.sign(subs[i].area) !== desired) toFlip.push(i);
  }

  if (toFlip.length === 0) return null;

  for (const i of toFlip) {
    subs[i] = reverseSubpath(subs[i]);
  }
  return serializeSubpaths(subs);
}

// ---------------------------------------------------------------------------
// SVG document walk — find <path> elements whose effective fill-rule is
// evenodd (own attribute/style, else nearest ancestor) and rewrite their `d`.
// Lightweight tag scanner, no DOM.
// ---------------------------------------------------------------------------

// `d` flag (hasIndices) gives exact spans for in-place replacement
const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/dg;
const D_ATTR_RE = /\bd\s*=\s*(?:"([^"]*)"|'([^']*)')/d;
const FILL_RULE_ATTR_RE = /\bfill-rule\s*=\s*["']\s*(evenodd|nonzero)/i;
const FILL_RULE_STYLE_RE = /\bstyle\s*=\s*["'][^"']*fill-rule\s*:\s*(evenodd|nonzero)/i;

type FillRule = 'evenodd' | 'nonzero' | null;

function getDeclaredFillRule(attrs: string): FillRule {
  const m = FILL_RULE_ATTR_RE.exec(attrs) || FILL_RULE_STYLE_RE.exec(attrs);
  return m ? (m[1].toLowerCase() as FillRule) : null;
}

export function normalizeWinding(svg: string): string {
  if (!/evenodd/i.test(svg)) return svg; // fast path: nothing to normalize

  interface Edit {
    start: number;
    end: number;
    text: string;
  }
  const edits: Edit[] = [];
  const stack: Array<{ tag: string; rule: FillRule }> = [];

  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(svg)) !== null) {
    const [, closing, tag, attrs, selfClose] = m;

    if (closing) {
      // tolerant pop: unwind to the matching open tag
      while (stack.length > 0) {
        const top = stack.pop();
        if (top && top.tag === tag) break;
      }
      continue;
    }

    const ownRule = getDeclaredFillRule(attrs);

    if (tag === 'path') {
      const inherited = [...stack].reverse().find((e) => e.rule !== null)?.rule ?? null;
      const effective = ownRule ?? inherited ?? 'nonzero';

      if (effective === 'evenodd') {
        const dMatch = D_ATTR_RE.exec(attrs);
        const dValue = dMatch ? (dMatch[1] ?? dMatch[2]) : undefined;
        if (dMatch && dValue) {
          const newD = normalizePathWinding(dValue);
          if (newD !== null) {
            // absolute span of the d value = tag start + attrs offset + value offset
            const attrsStart = (m as RegExpExecArray & { indices: number[][] }).indices[3][0];
            const valueGroup = dMatch[1] !== undefined ? 1 : 2;
            const valueSpan = (dMatch as RegExpExecArray & { indices: number[][] }).indices[
              valueGroup
            ];
            edits.push({
              start: attrsStart + valueSpan[0],
              end: attrsStart + valueSpan[1],
              text: newD,
            });
          }
        }
      }
    }

    if (!selfClose) {
      stack.push({ tag, rule: ownRule });
    }
  }

  if (edits.length === 0) return svg;

  let out = svg;
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i];
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}
