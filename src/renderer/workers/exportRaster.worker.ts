/**
 * Export Rasterization Worker
 *
 * Handles batch export by rendering SVGs to PNG/JPG/WebP blobs
 * via OffscreenCanvas. Returns ArrayBuffer results to main thread.
 */

interface RasterRequest {
  type: 'rasterize';
  id: string;
  svgContent: string;
  targetSize: number;
  format: 'png' | 'jpg' | 'webp';
  quality: number;
  bgColor?: string;
}

interface RasterResponse {
  type: 'result';
  id: string;
  data: ArrayBuffer;
  success: boolean;
  error?: string;
}

interface CancelMessage {
  type: 'cancel';
}

let cancelled = false;

self.onmessage = async (e: MessageEvent<RasterRequest | CancelMessage>) => {
  const msg = e.data;

  if (msg.type === 'cancel') {
    cancelled = true;
    return;
  }

  if (msg.type === 'rasterize') {
    if (cancelled) return;

    const { id, svgContent, targetSize, format, quality, bgColor } = msg;

    try {
      if (typeof OffscreenCanvas === 'undefined') {
        throw new Error('OffscreenCanvas not available');
      }

      let svg = svgContent;
      if (!svg.includes('width=')) {
        svg = svg.replace('<svg', `<svg width="${targetSize}" height="${targetSize}"`);
      }

      const canvas = new OffscreenCanvas(targetSize, targetSize);
      const ctx = canvas.getContext('2d')!;

      if (format === 'jpg' || bgColor) {
        ctx.fillStyle = bgColor || '#ffffff';
        ctx.fillRect(0, 0, targetSize, targetSize);
      }

      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: targetSize,
        resizeHeight: targetSize,
      });
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      if (cancelled) return;

      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        webp: 'image/webp',
      };

      const outBlob = await canvas.convertToBlob({
        type: mimeMap[format] || 'image/png',
        quality: format === 'jpg' || format === 'webp' ? quality / 100 : undefined,
      });

      const arrayBuf = await outBlob.arrayBuffer();

      const response: RasterResponse = {
        type: 'result',
        id,
        data: arrayBuf,
        success: true,
      };
      self.postMessage(response, [arrayBuf]);
    } catch (err: any) {
      const response: RasterResponse = {
        type: 'result',
        id,
        data: new ArrayBuffer(0),
        success: false,
        error: err?.message || String(err),
      };
      self.postMessage(response);
    }
  }
};
