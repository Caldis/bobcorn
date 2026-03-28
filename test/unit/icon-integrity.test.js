import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * macOS icon background integrity test.
 *
 * The app icon PNGs must have an opaque (white) background — no alpha channel.
 * PNG color type is stored at byte offset 25:
 *   2 = RGB (truecolor, no alpha)  ← required
 *   6 = RGBA (truecolor + alpha)   ← rejected
 *
 * Without this guard, semi-transparent source PNGs produce a gray icon
 * on macOS Dock/Finder where the system renders transparency against
 * its own backdrop.
 */
describe('icon-integrity', () => {
  const iconsDir = join(__dirname, '../../resources/icons');
  const resourcesDir = join(__dirname, '../../resources');

  const pngFiles = [
    'icons/1024x1024.png',
    'icons/512x512.png',
    'icons/256x256.png',
    'icons/128x128.png',
    'icons/96x96.png',
    'icons/64x64.png',
    'icons/48x48.png',
    'icons/32x32.png',
    'icons/16x16.png',
    'icons/icons.png',
    'icon.png',
  ];

  for (const file of pngFiles) {
    it(`${file} must be RGB (no alpha channel)`, () => {
      const buf = readFileSync(join(resourcesDir, file));
      // PNG signature check
      expect(buf[0]).toBe(0x89);
      expect(buf.toString('ascii', 1, 4)).toBe('PNG');
      // Color type at offset 25: 2 = RGB, 6 = RGBA
      const colorType = buf[25];
      expect(colorType).toBe(2); // RGB, no alpha
    });
  }
});
