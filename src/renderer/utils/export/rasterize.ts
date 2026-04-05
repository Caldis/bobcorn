import { sanitizeSVG } from '../sanitize';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function parseViewBox(svgContent: string | undefined | null): ViewBox {
  if (!svgContent) return { x: 0, y: 0, w: 24, h: 24 };
  const match = svgContent.match(/viewBox\s*=\s*["']([^"']+)["']/);
  if (!match) return { x: 0, y: 0, w: 24, h: 24 };
  const [x, y, w, h] = match[1].split(/\s+/).map(Number);
  return { x: x || 0, y: y || 0, w: w || 24, h: h || 24 };
}

export function prepareSvgForRender(svgContent: string, targetSize: number): string {
  const vb = parseViewBox(svgContent);
  const aspect = vb.w / vb.h;
  const w = aspect >= 1 ? targetSize : Math.round(targetSize * aspect);
  const h = aspect >= 1 ? Math.round(targetSize / aspect) : targetSize;

  let svg = svgContent;
  // Remove existing width/height to avoid conflicts
  svg = svg.replace(/<svg([^>]*)\s+width="[^"]*"/, '<svg$1');
  svg = svg.replace(/<svg([^>]*)\s+height="[^"]*"/, '<svg$1');
  // Inject target dimensions
  svg = svg.replace('<svg', `<svg width="${w}" height="${h}"`);
  return svg;
}

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

export type RasterFormat = 'svg' | 'png' | 'jpg' | 'webp' | 'pdf' | 'ico';

export interface RasterizeOptions {
  svgContent: string;
  targetSize: number;
  format: RasterFormat;
  quality: number;
  bgColor?: string;
}

export async function rasterizeSvgToBlob(opts: RasterizeOptions): Promise<Blob> {
  const { svgContent, targetSize, format, quality, bgColor } = opts;

  if (format === 'svg') {
    return new Blob([svgContent], { type: 'image/svg+xml' });
  }

  const sanitized = sanitizeSVG(svgContent);
  const prepared = prepareSvgForRender(sanitized, targetSize);
  const vb = parseViewBox(svgContent);
  const aspect = vb.w / vb.h;
  const canvasW = aspect >= 1 ? targetSize : Math.round(targetSize * aspect);
  const canvasH = aspect >= 1 ? Math.round(targetSize / aspect) : targetSize;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d')!;

  if (format === 'jpg' || bgColor) {
    ctx.fillStyle = bgColor || '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  const blob = new Blob([prepared], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url);
    ctx.drawImage(img, 0, 0, canvasW, canvasH);
  } finally {
    URL.revokeObjectURL(url);
  }

  const mimeType = MIME_MAP[format] || 'image/png';
  const q = format === 'jpg' || format === 'webp' ? quality / 100 : undefined;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Canvas toBlob returned null'))),
      mimeType,
      q
    );
  });
}

export async function rasterizeSvgToArrayBuffer(opts: RasterizeOptions): Promise<ArrayBuffer> {
  const blob = await rasterizeSvgToBlob({ ...opts, format: 'png' });
  return blob.arrayBuffer();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`Image load failed: ${err}`));
    img.src = src;
  });
}
