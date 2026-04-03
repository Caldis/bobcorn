/**
 * Icon Variant Engine — Constants & SVG Manipulation
 *
 * Weight: 9 levels via feMorphology (erode/dilate)
 * Scale: 3 levels via viewBox manipulation
 */

// ── Weight definitions (SF Symbols-aligned) ─────────────────────────
export interface WeightLevel {
  name: string;
  /** i18n key suffix, e.g. 'ultralight' → t('variant.weight.ultralight') */
  key: string;
  operator: 'erode' | 'dilate' | null;
  /** Base radius for 24px viewBox. Scales proportionally for other sizes. */
  baseRadius: number;
}

export const WEIGHT_LEVELS: WeightLevel[] = [
  { name: 'Ultralight', key: 'ultralight', operator: 'erode', baseRadius: 0.8 },
  { name: 'Thin', key: 'thin', operator: 'erode', baseRadius: 0.5 },
  { name: 'Light', key: 'light', operator: 'erode', baseRadius: 0.25 },
  { name: 'Regular', key: 'regular', operator: null, baseRadius: 0 },
  { name: 'Medium', key: 'medium', operator: 'dilate', baseRadius: 0.15 },
  { name: 'Semibold', key: 'semibold', operator: 'dilate', baseRadius: 0.3 },
  { name: 'Bold', key: 'bold', operator: 'dilate', baseRadius: 0.5 },
  { name: 'Heavy', key: 'heavy', operator: 'dilate', baseRadius: 0.7 },
  { name: 'Black', key: 'black', operator: 'dilate', baseRadius: 0.9 },
];

/** Index of Regular (original, no variant generated) */
export const REGULAR_INDEX = 3;

// ── Scale definitions ───────────────────────────────────────────────
export interface ScaleLevel {
  name: string;
  key: string;
  /** Multiplier applied to viewBox. >1 = icon shrinks, <1 = icon grows */
  factor: number;
}

export const SCALE_LEVELS: ScaleLevel[] = [
  { name: 'Small', key: 'small', factor: 1.2 },
  { name: 'Medium', key: 'medium', factor: 1.0 },
  { name: 'Large', key: 'large', factor: 0.85 },
];

/** Index of Medium scale (original, no variant generated) */
export const MEDIUM_SCALE_INDEX = 1;

// ── VariantMeta JSON shape ──────────────────────────────────────────
export interface VariantMeta {
  weight: string;
  weightRadius: number;
  scale: string;
  scaleFactor: number;
  renderingMode: null; // Phase 2
  layers: null; // Phase 2
}

// ── Variant naming ──────────────────────────────────────────────────
/**
 * Build variant icon name from parent name + weight + scale.
 * Regular weight omits weight suffix. Medium scale omits scale suffix.
 * Examples: home.bold, home.thin.small, home.large
 */
export function buildVariantName(
  parentName: string,
  weight: WeightLevel,
  scale: ScaleLevel
): string {
  const parts = [parentName];
  if (weight.key !== 'regular') parts.push(weight.key);
  if (scale.key !== 'medium') parts.push(scale.key);
  return parts.join('.');
}

// ── Total variant count ─────────────────────────────────────────────
/** 9 weights × 3 scales - 1 (Regular+Medium = original) */
export const TOTAL_VARIANTS = WEIGHT_LEVELS.length * SCALE_LEVELS.length - 1; // 26

/**
 * Generate all weight×scale combinations excluding Regular+Medium (original).
 */
export function allVariantCombinations(): Array<{ weight: WeightLevel; scale: ScaleLevel }> {
  const combos: Array<{ weight: WeightLevel; scale: ScaleLevel }> = [];
  for (const weight of WEIGHT_LEVELS) {
    for (const scale of SCALE_LEVELS) {
      if (weight.key === 'regular' && scale.key === 'medium') continue;
      combos.push({ weight, scale });
    }
  }
  return combos;
}

// ── feMorphology filter injection ───────────────────────────────────
/**
 * Parse viewBox size from SVG string. Returns the max of width/height.
 */
export function getViewBoxSize(svgContent: string): number {
  const match = svgContent.match(/viewBox\s*=\s*"([^"]+)"/);
  if (!match) return 24; // default
  const parts = match[1].split(/\s+/).map(Number);
  return Math.max(parts[2] || 24, parts[3] || 24);
}

/**
 * Inject feMorphology filter into SVG for weight preview.
 * Returns modified SVG string with <defs><filter> and filter= on root <g>.
 */
export function injectWeightFilter(svgContent: string, weight: WeightLevel): string {
  if (!weight.operator) return svgContent; // Regular = no filter

  const viewBoxSize = getViewBoxSize(svgContent);
  const radius = weight.baseRadius * (viewBoxSize / 24);

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return svgContent;

  // Create filter
  const filterId = 'bobcorn-weight';
  const defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const filter = doc.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', filterId);
  const morph = doc.createElementNS('http://www.w3.org/2000/svg', 'feMorphology');
  morph.setAttribute('operator', weight.operator);
  morph.setAttribute('radius', String(radius));
  filter.appendChild(morph);
  defs.appendChild(filter);

  // Wrap existing content in a <g> with filter
  const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('filter', `url(#${filterId})`);
  while (svg.firstChild) {
    g.appendChild(svg.firstChild);
  }
  svg.appendChild(defs);
  svg.appendChild(g);

  return svg.outerHTML;
}

// ── Scale viewBox transform ─────────────────────────────────────────
/**
 * Apply scale transform by adjusting viewBox.
 * factor > 1: expand viewBox (icon shrinks)
 * factor < 1: shrink viewBox (icon grows)
 */
export function applyScaleTransform(svgContent: string, scale: ScaleLevel): string {
  if (scale.factor === 1.0) return svgContent; // Medium = no change

  const match = svgContent.match(/viewBox\s*=\s*"([^"]+)"/);
  if (!match) return svgContent;

  const [x, y, w, h] = match[1].split(/\s+/).map(Number);
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const newW = round(w * scale.factor);
  const newH = round(h * scale.factor);
  const newX = round(x - (newW - w) / 2);
  const newY = round(y - (newH - h) / 2);
  const newViewBox = `${newX} ${newY} ${newW} ${newH}`;

  return svgContent.replace(/viewBox\s*=\s*"[^"]*"/, `viewBox="${newViewBox}"`);
}
