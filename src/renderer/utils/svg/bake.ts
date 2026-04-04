/**
 * Variant Bake Pipeline
 *
 * Converts an SVG with feMorphology filter into a clean vectorized SVG.
 * Pipeline: SVG → Canvas rasterization → ImageData → imagetracerjs → clean SVG path
 */

import type { WeightLevel, ScaleLevel, VariantMeta } from './variants';
import { injectWeightFilter, applyScaleTransform, getViewBoxSize } from './variants';
// @ts-expect-error — imagetracerjs is CJS with no TS types
import ImageTracer from 'imagetracerjs';

// Canvas size for rasterization (balance between quality and speed)
const DEFAULT_CANVAS_SIZE = 256;

/**
 * Async version: rasterize SVG to ImageData.
 */
export async function rasterizeSvgAsync(
  svgContent: string,
  canvasSize: number = DEFAULT_CANVAS_SIZE
): Promise<ImageData> {
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d')!;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  // Ensure SVG has width/height for correct rendering
  let renderSvg = svgContent;
  if (!renderSvg.includes('width=') || !renderSvg.includes('height=')) {
    renderSvg = renderSvg.replace('<svg', `<svg width="${canvasSize}" height="${canvasSize}"`);
  }

  // Create image from SVG blob
  const blob = new Blob([renderSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvasSize, canvasSize);
      URL.revokeObjectURL(url);
      resolve(ctx.getImageData(0, 0, canvasSize, canvasSize));
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error(`SVG rasterization failed: ${err}`));
    };
    img.src = url;
  });
}

/**
 * Vectorize ImageData to SVG path string using imagetracerjs.
 * Returns a clean SVG with a single <path> element.
 */
export function vectorizeImageData(imageData: ImageData, viewBoxSize: number = 24): string {
  // Configure for clean icon output
  const options = {
    // Tracing options
    ltres: 1, // Line threshold
    qtres: 1, // Quadratic spline threshold
    pathomit: 8, // Minimum path size (skip tiny noise)
    colorsampling: 0, // Disable color sampling (we want B&W)
    numberofcolors: 2, // Black and white only
    mincolorratio: 0, // Include all colors
    colorquantcycles: 1,
    // SVG output
    scale: viewBoxSize / imageData.width,
    roundcoords: 2, // Round to 2 decimal places
    desc: false, // No description
    viewbox: true, // Include viewBox
  };

  // imagetracerjs expects a canvas-like ImageData object
  const traceData = ImageTracer.imagedataToTracedata(imageData, options);
  const svgString = ImageTracer.getsvgstring(traceData, options);

  return svgString;
}

/**
 * Full bake pipeline: SVG + weight/scale params → clean vectorized SVG.
 */
export async function bakeSvgVariant(
  svgContent: string,
  weight: WeightLevel,
  scale: ScaleLevel,
  canvasSize: number = DEFAULT_CANVAS_SIZE
): Promise<string> {
  // 1. Apply weight filter
  const filtered = injectWeightFilter(svgContent, weight);

  // 2. Rasterize to Canvas
  const imageData = await rasterizeSvgAsync(filtered, canvasSize);

  // 3. Vectorize
  const viewBoxSize = getViewBoxSize(svgContent);
  let result = vectorizeImageData(imageData, viewBoxSize);

  // 4. Apply scale transform (pure viewBox manipulation, after bake)
  result = applyScaleTransform(result, scale);

  return result;
}

/**
 * Build VariantMeta object for database storage.
 */
export function buildVariantMeta(weight: WeightLevel, scale: ScaleLevel): VariantMeta {
  return {
    weight: weight.key,
    weightRadius: weight.baseRadius,
    scale: scale.key,
    scaleFactor: scale.factor,
    renderingMode: null,
    layers: null,
  };
}
