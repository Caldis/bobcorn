import { describe, it, expect } from 'vitest';
import { buildIcoBuffer, ICO_HEADER_SIZE, ICO_DIRENTRY_SIZE } from '../../src/renderer/utils/export/formats';

// Minimal valid PNG for testing
function make1x1Png() {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const binary = atob(base64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}

describe('buildIcoBuffer', () => {
  it('produces valid ICO header for single entry', () => {
    const png = make1x1Png();
    const result = buildIcoBuffer([{ pngData: png, width: 16, height: 16 }]);
    const view = new DataView(result);
    expect(view.getUint16(0, true)).toBe(0);  // reserved
    expect(view.getUint16(2, true)).toBe(1);  // type = ICO
    expect(view.getUint16(4, true)).toBe(1);  // 1 entry
  });

  it('produces valid ICO with multiple entries', () => {
    const png = make1x1Png();
    const result = buildIcoBuffer([
      { pngData: png, width: 16, height: 16 },
      { pngData: png, width: 32, height: 32 },
      { pngData: png, width: 256, height: 256 },
    ]);
    const view = new DataView(result);
    expect(view.getUint16(4, true)).toBe(3);
    const expectedSize = ICO_HEADER_SIZE + 3 * ICO_DIRENTRY_SIZE + 3 * png.byteLength;
    expect(result.byteLength).toBe(expectedSize);
  });

  it('encodes 256px as 0 in directory entry (ICO spec)', () => {
    const png = make1x1Png();
    const result = buildIcoBuffer([{ pngData: png, width: 256, height: 256 }]);
    const view = new Uint8Array(result);
    expect(view[ICO_HEADER_SIZE]).toBe(0);
    expect(view[ICO_HEADER_SIZE + 1]).toBe(0);
  });
});
