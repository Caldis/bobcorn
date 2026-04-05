/**
 * ICO binary encoder and PDF generator.
 *
 * Moved from src/renderer/utils/export/formats.ts to src/core/operations/
 * as part of the CLI + AI-Ready Architecture migration. This module is pure
 * logic — ICO is hand-written binary math, PDF uses pdf-lib (pure JS).
 */

import { PDFDocument } from 'pdf-lib';

// ── ICO Encoder ──────────────────────────────────────────

export const ICO_HEADER_SIZE = 6;
export const ICO_DIRENTRY_SIZE = 16;

export interface IcoEntry {
  pngData: ArrayBuffer;
  width: number;
  height: number;
}

export function buildIcoBuffer(entries: IcoEntry[]): ArrayBuffer {
  const count = entries.length;
  const headerSize = ICO_HEADER_SIZE + count * ICO_DIRENTRY_SIZE;
  const totalSize = headerSize + entries.reduce((sum, e) => sum + e.pngData.byteLength, 0);

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Header
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type = 1 (ICO)
  view.setUint16(4, count, true); // entry count

  // Directory entries + image data
  let dataOffset = headerSize;
  for (let i = 0; i < count; i++) {
    const entry = entries[i];
    const dirOffset = ICO_HEADER_SIZE + i * ICO_DIRENTRY_SIZE;
    const pngBytes = new Uint8Array(entry.pngData);

    bytes[dirOffset + 0] = entry.width >= 256 ? 0 : entry.width;
    bytes[dirOffset + 1] = entry.height >= 256 ? 0 : entry.height;
    bytes[dirOffset + 2] = 0; // color palette
    bytes[dirOffset + 3] = 0; // reserved
    view.setUint16(dirOffset + 4, 1, true); // color planes
    view.setUint16(dirOffset + 6, 32, true); // bits per pixel
    view.setUint32(dirOffset + 8, pngBytes.byteLength, true);
    view.setUint32(dirOffset + 12, dataOffset, true);

    bytes.set(pngBytes, dataOffset);
    dataOffset += pngBytes.byteLength;
  }

  return buffer;
}

// ── PDF Generator ────────────────────────────────────────

export async function buildPdfBuffer(
  pngData: ArrayBuffer,
  width: number,
  height: number
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(pngData);
  const page = doc.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  return doc.save();
}
