/**
 * CanvasAdapter — rasterization abstraction for dependency injection.
 *
 * Core operations that need SVG-to-bitmap conversion receive a
 * CanvasAdapter instance. CLI provides @napi-rs/canvas, GUI provides
 * browser HTMLCanvasElement + Image.
 */

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasContext2D;
  toBuffer(mime: string, opts?: { quality?: number }): Promise<Uint8Array>;
}

export interface CanvasContext2D {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(img: ImageLike, x: number, y: number, w: number, h: number): void;
}

export interface ImageLike {
  width: number;
  height: number;
}

export interface CanvasAdapter {
  createCanvas(width: number, height: number): CanvasLike;
  loadImage(data: Uint8Array): Promise<ImageLike>;
}
