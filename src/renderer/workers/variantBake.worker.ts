/**
 * Variant Bake Web Worker
 *
 * Receives BakeRequest messages, runs the bake pipeline, posts BakeResponse.
 * Supports cancellation via BakeCancel messages.
 */

// In Worker context, we need to handle Canvas differently
// Workers don't have DOM access, so we use OffscreenCanvas
// If OffscreenCanvas is unavailable, post error back

interface BakeRequest {
  type: 'bake';
  id: string;
  svgContent: string;
  weight: { name: string; key: string; operator: 'dilate' | 'erode' | null; baseRadius: number };
  scale: { name: string; key: string; factor: number };
  canvasSize: number;
  viewBoxSize: number;
}

interface BakeResponse {
  type: 'result';
  id: string;
  svgResult: string;
  success: boolean;
  error?: string;
}

interface BakeCancel {
  type: 'cancel';
  id: string; // or 'all'
}

const cancelled = new Set<string>();

self.onmessage = async (e: MessageEvent<BakeRequest | BakeCancel>) => {
  const msg = e.data;

  if (msg.type === 'cancel') {
    if (msg.id === 'all') cancelled.add('__all__');
    else cancelled.add(msg.id);
    return;
  }

  if (msg.type === 'bake') {
    const { id, svgContent, weight, scale, canvasSize, viewBoxSize } = msg;

    if (cancelled.has(id) || cancelled.has('__all__')) {
      return; // silently skip
    }

    try {
      // Step 1: Inject weight filter (string manipulation, no DOM needed)
      let svg = svgContent;
      if (weight.operator) {
        const radius = weight.baseRadius * (viewBoxSize / 24);
        // Simple string-based filter injection for Worker (no DOMParser in Worker)
        const filterDef = `<defs><filter id="bw"><feMorphology operator="${weight.operator}" radius="${radius}"/></filter></defs>`;
        svg = svg.replace(/(<svg[^>]*>)/, `$1${filterDef}<g filter="url(#bw)">`);
        svg = svg.replace('</svg>', '</g></svg>');
      }

      // Step 2: Rasterize with OffscreenCanvas
      if (typeof OffscreenCanvas === 'undefined') {
        throw new Error('OffscreenCanvas not available in this Worker context');
      }

      const canvas = new OffscreenCanvas(canvasSize, canvasSize);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      // Add width/height for rendering
      let renderSvg = svg;
      if (!renderSvg.includes('width=')) {
        renderSvg = renderSvg.replace('<svg', `<svg width="${canvasSize}" height="${canvasSize}"`);
      }

      const blob = new Blob([renderSvg], { type: 'image/svg+xml' });
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: canvasSize,
        resizeHeight: canvasSize,
      });
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);

      if (cancelled.has(id) || cancelled.has('__all__')) return;

      // Step 3: Vectorize with imagetracerjs
      // @ts-expect-error — imagetracerjs has no TS types
      const ImageTracer = require('imagetracerjs');
      const options = {
        ltres: 1,
        qtres: 1,
        pathomit: 8,
        colorsampling: 0,
        numberofcolors: 2,
        mincolorratio: 0,
        colorquantcycles: 1,
        scale: viewBoxSize / canvasSize,
        roundcoords: 2,
        desc: false,
        viewbox: true,
      };
      const traceData = ImageTracer.imagedataToTracedata(imageData, options);
      let result = ImageTracer.getsvgstring(traceData, options);

      // Step 4: Apply scale
      if (scale.factor !== 1.0) {
        const match = result.match(/viewBox\s*=\s*"([^"]+)"/);
        if (match) {
          const [x, y, w, h] = match[1].split(/\s+/).map(Number);
          const nw = w * scale.factor;
          const nh = h * scale.factor;
          const nx = x - (nw - w) / 2;
          const ny = y - (nh - h) / 2;
          result = result.replace(/viewBox\s*=\s*"[^"]*"/, `viewBox="${nx} ${ny} ${nw} ${nh}"`);
        }
      }

      const response: BakeResponse = { type: 'result', id, svgResult: result, success: true };
      self.postMessage(response);
    } catch (err: any) {
      const response: BakeResponse = {
        type: 'result',
        id,
        svgResult: '',
        success: false,
        error: err?.message || String(err),
      };
      self.postMessage(response);
    }
  }
};
