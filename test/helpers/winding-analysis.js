/**
 * Test helper — subpath winding analysis for SVG path data.
 * Mirrors the sampling + shoelace approach of core/svg/normalize-winding
 * but is intentionally an independent implementation, so tests do not
 * validate the transform against itself.
 */
import svgpath from 'svgpath';

const SAMPLES = 24;

/** Extract all d="..." attribute values from an SVG string, in order. */
export function extractPathDs(svg) {
  return [...svg.matchAll(/<path[^>]*\bd\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(
    (m) => m[1] ?? m[2]
  );
}

/**
 * Signed area per subpath (SVG y-down coordinates: positive = clockwise
 * on screen). Curves are flattened by fixed-step sampling.
 */
export function subpathAreas(d) {
  const path = svgpath(d).abs().unshort().unarc();
  const polys = [];
  let poly = null;
  let cx = 0;
  let cy = 0;

  const lineTo = (x, y) => {
    poly && poly.push([x, y]);
    cx = x;
    cy = y;
  };

  path.iterate((seg, _i, x, y) => {
    const cmd = seg[0];
    if (cmd === 'M') {
      if (poly && poly.length > 2) polys.push(poly);
      poly = [[seg[1], seg[2]]];
      cx = seg[1];
      cy = seg[2];
    } else if (cmd === 'L') {
      lineTo(seg[1], seg[2]);
    } else if (cmd === 'H') {
      lineTo(seg[1], y);
    } else if (cmd === 'V') {
      lineTo(x, seg[1]);
    } else if (cmd === 'C') {
      const [, c1x, c1y, c2x, c2y, ex, ey] = seg;
      for (let i = 1; i <= SAMPLES; i++) {
        const t = i / SAMPLES;
        const u = 1 - t;
        poly &&
          poly.push([
            u * u * u * cx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
            u * u * u * cy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey,
          ]);
      }
      cx = ex;
      cy = ey;
    } else if (cmd === 'Q') {
      const [, qx, qy, ex, ey] = seg;
      for (let i = 1; i <= SAMPLES; i++) {
        const t = i / SAMPLES;
        const u = 1 - t;
        poly && poly.push([u * u * cx + 2 * u * t * qx + t * t * ex, u * u * cy + 2 * u * t * qy + t * t * ey]);
      }
      cx = ex;
      cy = ey;
    }
    // Z: polygon closure is implicit in the shoelace formula
  });
  if (poly && poly.length > 2) polys.push(poly);

  return polys.map((p) => {
    let a = 0;
    for (let i = 0; i < p.length; i++) {
      const [x1, y1] = p[i];
      const [x2, y2] = p[(i + 1) % p.length];
      a += x1 * y2 - x2 * y1;
    }
    return a / 2;
  });
}
