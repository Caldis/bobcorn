# Icon Export Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Figma-style icon export dialog supporting multiple sizes (@1x–4x / fixed px) and formats (SVG/PNG/JPG/WebP/PDF/ICO) for single and batch icon export.

**Architecture:** Canvas-based rasterization in renderer process. New `IconExportDialog` component with Figma-style row model. Presets (iOS/Android/Web/Favicon) replace all rows on click. pdf-lib for PDF, hand-written ICO encoder. Web Worker for batch/multi-row export.

**Tech Stack:** React 18, Radix UI Dialog, Tailwind CSS, Canvas API, pdf-lib, Web Worker (OffscreenCanvas)

**Spec:** `docs/superpowers/specs/2026-04-05-icon-export-dialog-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/renderer/utils/export/rasterize.ts` | SVG → Canvas → Blob core pipeline |
| `src/renderer/utils/export/formats.ts` | ICO binary encoder + PDF generator (pdf-lib) |
| `src/renderer/utils/export/presets.ts` | Preset definitions (iOS/Android/Web/Favicon) + types |
| `src/renderer/components/IconExportDialog/index.tsx` | Dialog shell — preview, presets bar, row list, format settings, footer |
| `src/renderer/components/IconExportDialog/ExportRow.tsx` | Single row — @/px toggle, size input, format dropdown, filename preview |
| `src/renderer/workers/exportRaster.worker.ts` | Batch/multi-row export Worker |
| `test/unit/export-rasterize.test.js` | Rasterize pipeline unit tests |
| `test/unit/export-formats.test.js` | ICO encoder + PDF generator tests |
| `test/unit/export-presets.test.js` | Preset definitions + filename generation tests |

### Modified Files

| File | Change |
|------|--------|
| `src/renderer/components/SideEditor/index.tsx` | Replace `handleIconExport` → open IconExportDialog |
| `src/renderer/components/BatchPanel/index.tsx` | Replace `handleExport` → open IconExportDialog (batch) |
| `src/locales/en.json` | Add `iconExport.*` keys |
| `src/locales/zh-CN.json` | Add `iconExport.*` keys |
| `package.json` | Add `pdf-lib` dependency |

---

## Task 1: Types, Presets, and Filename Generation

**Files:**
- Create: `src/renderer/utils/export/presets.ts`
- Test: `test/unit/export-presets.test.js`

- [ ] **Step 1: Write the test file**

```js
// test/unit/export-presets.test.js
import { describe, it, expect } from 'vitest';
import {
  PRESETS,
  buildFilename,
  computeOutputSize,
} from '../../src/renderer/utils/export/presets';

describe('presets', () => {
  it('iOS preset has 3 rows: @1x/@2x/@3x PNG', () => {
    const ios = PRESETS.find((p) => p.key === 'ios');
    expect(ios).toBeDefined();
    expect(ios.rows).toHaveLength(3);
    expect(ios.rows.map((r) => r.scale)).toEqual([1, 2, 3]);
    expect(ios.rows.every((r) => r.format === 'png')).toBe(true);
    expect(ios.rows.every((r) => r.sizeMode === 'scale')).toBe(true);
  });

  it('Android preset has 5 rows: 48/72/96/144/192 px PNG', () => {
    const android = PRESETS.find((p) => p.key === 'android');
    expect(android).toBeDefined();
    expect(android.rows).toHaveLength(5);
    expect(android.rows.map((r) => r.pixelSize)).toEqual([48, 72, 96, 144, 192]);
    expect(android.rows.every((r) => r.sizeMode === 'pixel')).toBe(true);
  });

  it('Web preset has 2 rows: @1x/@2x PNG', () => {
    const web = PRESETS.find((p) => p.key === 'web');
    expect(web.rows).toHaveLength(2);
  });

  it('Favicon preset has 6 rows: 3 ICO + 3 PNG', () => {
    const fav = PRESETS.find((p) => p.key === 'favicon');
    expect(fav.rows).toHaveLength(6);
    expect(fav.rows.filter((r) => r.format === 'ico')).toHaveLength(3);
    expect(fav.rows.filter((r) => r.format === 'png')).toHaveLength(3);
    expect(fav.icoMerge).toBe(true);
  });
});

describe('buildFilename', () => {
  it('scale mode: home @2x png → home@2x.png', () => {
    expect(buildFilename('home', { sizeMode: 'scale', scale: 2, format: 'png' })).toBe('home@2x.png');
  });

  it('pixel mode: home 48px png → home-48px.png', () => {
    expect(buildFilename('home', { sizeMode: 'pixel', pixelSize: 48, format: 'png' })).toBe('home-48px.png');
  });

  it('SVG always: home.svg (no size suffix)', () => {
    expect(buildFilename('home', { sizeMode: 'scale', scale: 2, format: 'svg' })).toBe('home.svg');
  });

  it('scale 1x omits suffix: home.png', () => {
    expect(buildFilename('home', { sizeMode: 'scale', scale: 1, format: 'png' })).toBe('home.png');
  });

  it('fractional scale: home@1.5x.png', () => {
    expect(buildFilename('home', { sizeMode: 'scale', scale: 1.5, format: 'png' })).toBe('home@1.5x.png');
  });
});

describe('computeOutputSize', () => {
  it('scale mode: viewBox 24, @2x → 48', () => {
    expect(computeOutputSize({ sizeMode: 'scale', scale: 2 }, 24)).toBe(48);
  });

  it('pixel mode: returns pixelSize directly', () => {
    expect(computeOutputSize({ sizeMode: 'pixel', pixelSize: 64 }, 24)).toBe(64);
  });

  it('non-square viewBox: uses longest side', () => {
    expect(computeOutputSize({ sizeMode: 'scale', scale: 2 }, 24, 16)).toBe(48);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/export-presets.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/renderer/utils/export/presets.ts

// ── Types ────────────────────────────────────────────────

export type ExportFormat = 'svg' | 'png' | 'jpg' | 'webp' | 'pdf' | 'ico';

export type SizeMode = 'scale' | 'pixel';

export interface ExportRowConfig {
  id: string;           // unique row id (nanoid or counter)
  sizeMode: SizeMode;
  scale: number;        // used when sizeMode === 'scale'
  pixelSize: number;    // used when sizeMode === 'pixel'
  format: ExportFormat;
}

export interface PresetDef {
  key: string;
  labelKey: string;     // i18n key
  rows: Omit<ExportRowConfig, 'id'>[];
  icoMerge?: boolean;   // auto-enable ICO merge
}

// ── Presets ──────────────────────────────────────────────

export const PRESETS: PresetDef[] = [
  {
    key: 'ios',
    labelKey: 'iconExport.preset.ios',
    rows: [
      { sizeMode: 'scale', scale: 1, pixelSize: 0, format: 'png' },
      { sizeMode: 'scale', scale: 2, pixelSize: 0, format: 'png' },
      { sizeMode: 'scale', scale: 3, pixelSize: 0, format: 'png' },
    ],
  },
  {
    key: 'android',
    labelKey: 'iconExport.preset.android',
    rows: [
      { sizeMode: 'pixel', scale: 1, pixelSize: 48, format: 'png' },
      { sizeMode: 'pixel', scale: 1, pixelSize: 72, format: 'png' },
      { sizeMode: 'pixel', scale: 1, pixelSize: 96, format: 'png' },
      { sizeMode: 'pixel', scale: 1, pixelSize: 144, format: 'png' },
      { sizeMode: 'pixel', scale: 1, pixelSize: 192, format: 'png' },
    ],
  },
  {
    key: 'web',
    labelKey: 'iconExport.preset.web',
    rows: [
      { sizeMode: 'scale', scale: 1, pixelSize: 0, format: 'png' },
      { sizeMode: 'scale', scale: 2, pixelSize: 0, format: 'png' },
    ],
  },
  {
    key: 'favicon',
    labelKey: 'iconExport.preset.favicon',
    icoMerge: true,
    rows: [
      { sizeMode: 'pixel', scale: 1, pixelSize: 16, format: 'ico' },
      { sizeMode: 'pixel', scale: 1, pixelSize: 32, format: 'ico' },
      { sizeMode: 'pixel', scale: 1, pixelSize: 48, format: 'ico' },
      { sizeMode: 'pixel', scale: 1, pixelSize: 180, format: 'png' },
      { sizeMode: 'pixel', scale: 1, pixelSize: 192, format: 'png' },
      { sizeMode: 'pixel', scale: 1, pixelSize: 512, format: 'png' },
    ],
  },
];

// ── Filename builder ─────────────────────────────────────

export function buildFilename(
  iconName: string,
  row: Pick<ExportRowConfig, 'sizeMode' | 'scale' | 'format'> & { pixelSize?: number }
): string {
  if (row.format === 'svg') return `${iconName}.svg`;

  if (row.sizeMode === 'scale') {
    const suffix = row.scale === 1 ? '' : `@${row.scale}x`;
    return `${iconName}${suffix}.${row.format}`;
  }

  return `${iconName}-${row.pixelSize}px.${row.format}`;
}

// ── Output size calculator ───────────────────────────────

export function computeOutputSize(
  row: Pick<ExportRowConfig, 'sizeMode' | 'scale' | 'pixelSize'>,
  viewBoxW: number,
  viewBoxH?: number
): number {
  if (row.sizeMode === 'pixel') return row.pixelSize;
  const longest = Math.max(viewBoxW, viewBoxH ?? viewBoxW);
  return Math.round(longest * row.scale);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/export-presets.test.js`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/utils/export/presets.ts test/unit/export-presets.test.js
git commit -m "feat(export): add types, presets, and filename generation"
```

---

## Task 2: Canvas Rasterization Pipeline

**Files:**
- Create: `src/renderer/utils/export/rasterize.ts`
- Test: `test/unit/export-rasterize.test.js`

- [ ] **Step 1: Write the test file**

```js
// test/unit/export-rasterize.test.js
import { describe, it, expect } from 'vitest';
import { parseViewBox, prepareSvgForRender } from '../../src/renderer/utils/export/rasterize';

// Note: Canvas-based tests (rasterizeSvgToBlob) require DOM/canvas environment
// and are covered in E2E. Here we test the pure-function helpers.

const SIMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>';
const NO_VIEWBOX_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/></svg>';
const NONSQUARE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24"><rect width="48" height="24"/></svg>';

describe('parseViewBox', () => {
  it('parses standard viewBox', () => {
    expect(parseViewBox(SIMPLE_SVG)).toEqual({ x: 0, y: 0, w: 24, h: 24 });
  });

  it('returns default 24x24 when no viewBox', () => {
    expect(parseViewBox(NO_VIEWBOX_SVG)).toEqual({ x: 0, y: 0, w: 24, h: 24 });
  });

  it('parses non-square viewBox', () => {
    expect(parseViewBox(NONSQUARE_SVG)).toEqual({ x: 0, y: 0, w: 48, h: 24 });
  });
});

describe('prepareSvgForRender', () => {
  it('injects width and height matching target size', () => {
    const result = prepareSvgForRender(SIMPLE_SVG, 64);
    expect(result).toContain('width="64"');
    expect(result).toContain('height="64"');
  });

  it('does not double-inject if width already present', () => {
    const svgWithSize = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M0 0"/></svg>';
    const result = prepareSvgForRender(svgWithSize, 64);
    // Should replace existing, not add duplicate
    const widthMatches = result.match(/width="/g);
    expect(widthMatches).toHaveLength(1);
  });

  it('handles non-square: scales to fit within target, centered', () => {
    const result = prepareSvgForRender(NONSQUARE_SVG, 64);
    expect(result).toContain('width="64"');
    expect(result).toContain('height="32"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/export-rasterize.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/renderer/utils/export/rasterize.ts
import { sanitizeSVG } from '../sanitize';
import type { ExportFormat } from './presets';

// ── ViewBox parsing ──────────────────────────────────────

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function parseViewBox(svgContent: string): ViewBox {
  const match = svgContent.match(/viewBox\s*=\s*"([^"]+)"/);
  if (!match) return { x: 0, y: 0, w: 24, h: 24 };
  const [x, y, w, h] = match[1].split(/\s+/).map(Number);
  return { x: x || 0, y: y || 0, w: w || 24, h: h || 24 };
}

// ── SVG preparation ──────────────────────────────────────

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

// ── MIME type mapping ────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

// ── Canvas rasterization ─────────────────────────────────

export interface RasterizeOptions {
  svgContent: string;
  targetSize: number;
  format: ExportFormat;
  quality: number;       // 0–100, used for jpg/webp
  bgColor?: string;      // required for jpg, e.g. '#FFFFFF'
}

export async function rasterizeSvgToBlob(opts: RasterizeOptions): Promise<Blob> {
  const { svgContent, targetSize, format, quality, bgColor } = opts;

  // SVG: return as-is
  if (format === 'svg') {
    return new Blob([svgContent], { type: 'image/svg+xml' });
  }

  // Sanitize + prepare
  const sanitized = sanitizeSVG(svgContent);
  const prepared = prepareSvgForRender(sanitized, targetSize);
  const vb = parseViewBox(svgContent);
  const aspect = vb.w / vb.h;
  const canvasW = aspect >= 1 ? targetSize : Math.round(targetSize * aspect);
  const canvasH = aspect >= 1 ? Math.round(targetSize / aspect) : targetSize;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d')!;

  // Background fill for JPG (or any opaque format)
  if (format === 'jpg' || bgColor) {
    ctx.fillStyle = bgColor || '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // Render SVG to canvas via Image
  const blob = new Blob([prepared], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url);
    ctx.drawImage(img, 0, 0, canvasW, canvasH);
  } finally {
    URL.revokeObjectURL(url);
  }

  // For PDF/ICO, we produce PNG internally, the caller handles wrapping
  const mimeType = MIME_MAP[format] || 'image/png';
  const q = (format === 'jpg' || format === 'webp') ? quality / 100 : undefined;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Canvas toBlob returned null'))),
      mimeType,
      q
    );
  });
}

// ── Rasterize to ArrayBuffer (for ICO/PDF consumers) ────

export async function rasterizeSvgToArrayBuffer(opts: RasterizeOptions): Promise<ArrayBuffer> {
  const blob = await rasterizeSvgToBlob({ ...opts, format: 'png' });
  return blob.arrayBuffer();
}

// ── Helper ───────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`Image load failed: ${err}`));
    img.src = src;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/export-rasterize.test.js`
Expected: all PASS (pure function tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/utils/export/rasterize.ts test/unit/export-rasterize.test.js
git commit -m "feat(export): add Canvas rasterization pipeline"
```

---

## Task 3: ICO Encoder and PDF Generator

**Files:**
- Create: `src/renderer/utils/export/formats.ts`
- Modify: `package.json` (add pdf-lib)
- Test: `test/unit/export-formats.test.js`

- [ ] **Step 1: Install pdf-lib**

```bash
npm install pdf-lib
```

- [ ] **Step 2: Write the test file**

```js
// test/unit/export-formats.test.js
import { describe, it, expect } from 'vitest';
import { buildIcoBuffer, ICO_HEADER_SIZE, ICO_DIRENTRY_SIZE } from '../../src/renderer/utils/export/formats';

// Minimal 1x1 PNG for testing (hand-crafted valid PNG)
function make1x1Png() {
  // Smallest valid PNG: 1x1 transparent pixel
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==';
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

    // ICO magic: reserved=0, type=1 (ICO), count=1
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
    expect(view.getUint16(4, true)).toBe(3);  // 3 entries

    // Total size = header(6) + 3*direntry(16) + 3*pngSize
    const expectedSize = ICO_HEADER_SIZE + 3 * ICO_DIRENTRY_SIZE + 3 * png.byteLength;
    expect(result.byteLength).toBe(expectedSize);
  });

  it('encodes 256px as 0 in directory entry (ICO spec)', () => {
    const png = make1x1Png();
    const result = buildIcoBuffer([{ pngData: png, width: 256, height: 256 }]);
    const view = new Uint8Array(result);
    // Dir entry starts at offset 6, first byte is width (0 = 256)
    expect(view[ICO_HEADER_SIZE]).toBe(0);
    expect(view[ICO_HEADER_SIZE + 1]).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/unit/export-formats.test.js`
Expected: FAIL — module not found

- [ ] **Step 4: Write the implementation**

```ts
// src/renderer/utils/export/formats.ts
import { PDFDocument } from 'pdf-lib';

// ══════════════════════════════════════════════════════════
// ICO Encoder — PNG-compressed entries
// ══════════════════════════════════════════════════════════

export const ICO_HEADER_SIZE = 6;    // reserved(2) + type(2) + count(2)
export const ICO_DIRENTRY_SIZE = 16; // w(1)+h(1)+palette(1)+reserved(1)+planes(2)+bpp(2)+size(4)+offset(4)

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
  view.setUint16(0, 0, true);      // reserved
  view.setUint16(2, 1, true);      // type = 1 (ICO)
  view.setUint16(4, count, true);  // entry count

  // Directory entries + image data
  let dataOffset = headerSize;
  for (let i = 0; i < count; i++) {
    const entry = entries[i];
    const dirOffset = ICO_HEADER_SIZE + i * ICO_DIRENTRY_SIZE;
    const pngBytes = new Uint8Array(entry.pngData);

    // ICO spec: 256 is encoded as 0
    bytes[dirOffset + 0] = entry.width >= 256 ? 0 : entry.width;
    bytes[dirOffset + 1] = entry.height >= 256 ? 0 : entry.height;
    bytes[dirOffset + 2] = 0;  // color palette count
    bytes[dirOffset + 3] = 0;  // reserved
    view.setUint16(dirOffset + 4, 1, true);  // color planes
    view.setUint16(dirOffset + 6, 32, true); // bits per pixel
    view.setUint32(dirOffset + 8, pngBytes.byteLength, true);  // image data size
    view.setUint32(dirOffset + 12, dataOffset, true);           // image data offset

    // Copy PNG data
    bytes.set(pngBytes, dataOffset);
    dataOffset += pngBytes.byteLength;
  }

  return buffer;
}

// ══════════════════════════════════════════════════════════
// PDF Generator — single-page with embedded PNG
// ══════════════════════════════════════════════════════════

export async function buildPdfBuffer(pngData: ArrayBuffer, width: number, height: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(pngData);
  const page = doc.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  return doc.save();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/unit/export-formats.test.js`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/utils/export/formats.ts test/unit/export-formats.test.js package.json package-lock.json
git commit -m "feat(export): add ICO encoder and PDF generator"
```

---

## Task 4: i18n Keys

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh-CN.json`

- [ ] **Step 1: Add English keys**

Add the following block after the existing `editor.*` keys section in `src/locales/en.json`:

```json
"iconExport.title": "Export Icon",
"iconExport.titleBatch": "Export {{count}} Icons",
"iconExport.preset.ios": "iOS",
"iconExport.preset.android": "Android",
"iconExport.preset.web": "Web @1x–2x",
"iconExport.preset.favicon": "Favicon",
"iconExport.presets": "Presets",
"iconExport.exportSettings": "Export Settings",
"iconExport.addExport": "Add export",
"iconExport.formatSettings": "Format Settings",
"iconExport.jpgBackground": "JPG Background",
"iconExport.quality": "Quality",
"iconExport.icoMerge": "Merge ICO sizes into single .ico file",
"iconExport.fileSummary": "{{count}} files",
"iconExport.fileSummaryBatch": "{{icons}} icons × {{rows}} sizes = {{total}} files",
"iconExport.export": "Export",
"iconExport.exportAll": "Export All",
"iconExport.cancel": "Cancel",
"iconExport.exporting": "Exporting {{current}}/{{total}}...",
"iconExport.done": "Export complete",
"iconExport.error": "Export error: {{error}}",
"iconExport.sizeScale": "Scale",
"iconExport.sizePixel": "Pixel",
"iconExport.selectDir": "Select export directory",
```

- [ ] **Step 2: Add Chinese keys**

Add the corresponding block in `src/locales/zh-CN.json`:

```json
"iconExport.title": "导出图标",
"iconExport.titleBatch": "导出 {{count}} 个图标",
"iconExport.preset.ios": "iOS",
"iconExport.preset.android": "Android",
"iconExport.preset.web": "Web @1x–2x",
"iconExport.preset.favicon": "Favicon",
"iconExport.presets": "预设",
"iconExport.exportSettings": "导出设置",
"iconExport.addExport": "添加导出",
"iconExport.formatSettings": "格式设置",
"iconExport.jpgBackground": "JPG 背景色",
"iconExport.quality": "质量",
"iconExport.icoMerge": "将所有 ICO 尺寸合并为单个 .ico 文件",
"iconExport.fileSummary": "{{count}} 个文件",
"iconExport.fileSummaryBatch": "{{icons}} 个图标 × {{rows}} 个尺寸 = {{total}} 个文件",
"iconExport.export": "导出",
"iconExport.exportAll": "全部导出",
"iconExport.cancel": "取消",
"iconExport.exporting": "正在导出 {{current}}/{{total}}...",
"iconExport.done": "导出完成",
"iconExport.error": "导出失败: {{error}}",
"iconExport.sizeScale": "倍率",
"iconExport.sizePixel": "像素",
"iconExport.selectDir": "选择导出目录",
```

- [ ] **Step 3: Commit**

```bash
git add src/locales/en.json src/locales/zh-CN.json
git commit -m "feat(export): add i18n keys for icon export dialog"
```

---

## Task 5: ExportRow Component

**Files:**
- Create: `src/renderer/components/IconExportDialog/ExportRow.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/renderer/components/IconExportDialog/ExportRow.tsx
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { buildFilename } from '../../utils/export/presets';
import type { ExportRowConfig, ExportFormat, SizeMode } from '../../utils/export/presets';

const FORMATS: ExportFormat[] = ['svg', 'png', 'jpg', 'webp', 'pdf', 'ico'];

interface ExportRowProps {
  row: ExportRowConfig;
  iconName: string;
  onChange: (id: string, updates: Partial<ExportRowConfig>) => void;
  onDelete: (id: string) => void;
}

export function ExportRow({ row, iconName, onChange, onDelete }: ExportRowProps) {
  const { t } = useTranslation();
  const isSvg = row.format === 'svg';

  const filename = useMemo(() => buildFilename(iconName, row), [iconName, row]);

  const handleSizeModeToggle = (mode: SizeMode) => {
    onChange(row.id, { sizeMode: mode });
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0;
    if (row.sizeMode === 'scale') {
      onChange(row.id, { scale: Math.max(0.5, Math.min(4, val)) });
    } else {
      onChange(row.id, { pixelSize: Math.max(1, Math.min(4096, Math.round(val))) });
    }
  };

  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(row.id, { format: e.target.value as ExportFormat });
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2',
        'bg-surface-muted/30 rounded-lg border border-border/50'
      )}
    >
      {/* @/px toggle */}
      <div className="flex bg-surface-accent rounded overflow-hidden shrink-0">
        <button
          className={cn(
            'px-2 py-0.5 text-xs transition-colors',
            row.sizeMode === 'scale'
              ? 'bg-accent text-accent-foreground'
              : 'text-foreground-muted hover:text-foreground'
          )}
          onClick={() => handleSizeModeToggle('scale')}
          disabled={isSvg}
        >
          @
        </button>
        <button
          className={cn(
            'px-2 py-0.5 text-xs transition-colors',
            row.sizeMode === 'pixel'
              ? 'bg-accent text-accent-foreground'
              : 'text-foreground-muted hover:text-foreground'
          )}
          onClick={() => handleSizeModeToggle('pixel')}
          disabled={isSvg}
        >
          px
        </button>
      </div>

      {/* Size value */}
      <input
        type="number"
        step={row.sizeMode === 'scale' ? 0.5 : 1}
        min={row.sizeMode === 'scale' ? 0.5 : 1}
        max={row.sizeMode === 'scale' ? 4 : 4096}
        value={isSvg ? '' : (row.sizeMode === 'scale' ? row.scale : row.pixelSize)}
        onChange={handleSizeChange}
        disabled={isSvg}
        className={cn(
          'w-16 px-2 py-1 text-center text-sm rounded border border-border bg-surface',
          'focus:border-accent focus:ring-1 focus:ring-ring/30 outline-none',
          isSvg && 'opacity-40 cursor-not-allowed'
        )}
        placeholder={isSvg ? '—' : undefined}
      />

      {/* Format dropdown */}
      <select
        value={row.format}
        onChange={handleFormatChange}
        className={cn(
          'px-2 py-1 text-sm rounded border border-border bg-surface text-foreground',
          'focus:border-accent focus:ring-1 focus:ring-ring/30 outline-none',
          'min-w-[72px]'
        )}
      >
        {FORMATS.map((f) => (
          <option key={f} value={f}>{f.toUpperCase()}</option>
        ))}
      </select>

      {/* Filename preview */}
      <span
        className={cn(
          'flex-1 text-xs text-foreground-muted font-mono',
          'truncate'
        )}
        title={filename}
      >
        {filename}
      </span>

      {/* Delete */}
      <button
        onClick={() => onDelete(row.id)}
        className="shrink-0 text-foreground-muted hover:text-foreground transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/IconExportDialog/ExportRow.tsx
git commit -m "feat(export): add ExportRow component"
```

---

## Task 6: IconExportDialog Main Component

**Files:**
- Create: `src/renderer/components/IconExportDialog/index.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/renderer/components/IconExportDialog/index.tsx
import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Button } from '../ui';
import { Slider } from '../ui/slider';
import { Checkbox } from '../ui/checkbox';
import { message } from '../ui/toast';
import { cn } from '../../lib/utils';
import { sanitizeSVG } from '../../utils/sanitize';
import { ExportRow } from './ExportRow';
import {
  PRESETS,
  buildFilename,
  computeOutputSize,
} from '../../utils/export/presets';
import type { ExportRowConfig, PresetDef } from '../../utils/export/presets';
import { parseViewBox, rasterizeSvgToBlob, rasterizeSvgToArrayBuffer } from '../../utils/export/rasterize';
import { buildIcoBuffer, buildPdfBuffer } from '../../utils/export/formats';

const { electronAPI } = window as any;

// ── Types ────────────────────────────────────────────────

export interface IconExportTarget {
  id: string;
  iconName: string;
  iconContent: string;
}

interface IconExportDialogProps {
  visible: boolean;
  onClose: () => void;
  icons: IconExportTarget[];
}

// ── Helpers ──────────────────────────────────────────────

let rowCounter = 0;
function newRowId(): string {
  return `row-${++rowCounter}`;
}

function makeDefaultRow(): ExportRowConfig {
  return { id: newRowId(), sizeMode: 'scale', scale: 1, pixelSize: 24, format: 'png' };
}

function presetToRows(preset: PresetDef): ExportRowConfig[] {
  return preset.rows.map((r) => ({ ...r, id: newRowId() }));
}

// ── Component ────────────────────────────────────────────

export function IconExportDialog({ visible, onClose, icons }: IconExportDialogProps) {
  const { t } = useTranslation();
  const isBatch = icons.length > 1;
  const firstIcon = icons[0];

  // ── State ──────────────────────────────────────────────
  const [rows, setRows] = useState<ExportRowConfig[]>(() => [makeDefaultRow()]);
  const [quality, setQuality] = useState(92);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [icoMerge, setIcoMerge] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // ── Derived ────────────────────────────────────────────
  const hasJpgOrWebp = rows.some((r) => r.format === 'jpg' || r.format === 'webp');
  const icoRows = rows.filter((r) => r.format === 'ico');
  const showIcoMerge = icoRows.length >= 2;

  const viewBox = useMemo(
    () => (firstIcon ? parseViewBox(firstIcon.iconContent) : { x: 0, y: 0, w: 24, h: 24 }),
    [firstIcon]
  );

  const totalFiles = useMemo(() => {
    let count = rows.length * icons.length;
    // If ICO merge is on, multiple ICO rows per icon → 1 file per icon
    if (showIcoMerge && icoMerge) {
      const icoCount = icoRows.length;
      count -= (icoCount - 1) * icons.length;
    }
    return count;
  }, [rows, icons, showIcoMerge, icoMerge, icoRows]);

  // ── Row management ─────────────────────────────────────
  const handleRowChange = useCallback((id: string, updates: Partial<ExportRowConfig>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    setActivePreset(null);
  }, []);

  const handleRowDelete = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setActivePreset(null);
  }, []);

  const handleAddRow = useCallback(() => {
    setRows((prev) => [...prev, makeDefaultRow()]);
    setActivePreset(null);
  }, []);

  const handlePreset = useCallback((preset: PresetDef) => {
    setRows(presetToRows(preset));
    setActivePreset(preset.key);
    if (preset.icoMerge !== undefined) setIcoMerge(preset.icoMerge);
  }, []);

  // ── Export execution ───────────────────────────────────
  const handleExport = useCallback(async () => {
    if (rows.length === 0) return;

    const needsDir = rows.length > 1 || isBatch;
    let dirPath: string | null = null;
    let filePath: string | null = null;

    if (needsDir) {
      const result = await electronAPI.showSaveDialog({
        title: t('iconExport.selectDir'),
        properties: ['openDirectory'],
      });
      if (!result || result.canceled) return;
      dirPath = result.filePath || result.filePaths?.[0];
      if (!dirPath) return;
    } else {
      const fname = buildFilename(firstIcon.iconName, rows[0]);
      const result = await electronAPI.showSaveDialog({
        title: t('iconExport.title'),
        defaultPath: fname,
      });
      if (!result || result.canceled) return;
      filePath = result.filePath;
      if (!filePath) return;
    }

    setExporting(true);
    const total = totalFiles;
    let current = 0;
    setProgress({ current: 0, total });

    try {
      for (const icon of icons) {
        const iconVb = parseViewBox(icon.iconContent);
        const icoBuffers: { pngData: ArrayBuffer; width: number; height: number }[] = [];

        for (const row of rows) {
          const targetSize = computeOutputSize(row, iconVb.w, iconVb.h);
          const fname = buildFilename(icon.iconName, row);

          if (row.format === 'svg') {
            // SVG: write raw content
            const dest = dirPath ? `${dirPath}/${fname}` : filePath!;
            await electronAPI.writeFile(dest, icon.iconContent);
          } else if (row.format === 'pdf') {
            // PDF: rasterize → embed in PDF
            const pngBuf = await rasterizeSvgToArrayBuffer({
              svgContent: icon.iconContent,
              targetSize,
              format: 'png',
              quality: 100,
            });
            const pdfBuf = await buildPdfBuffer(pngBuf, targetSize, targetSize);
            const dest = dirPath ? `${dirPath}/${fname}` : filePath!;
            await electronAPI.writeFile(dest, new Uint8Array(pdfBuf));
          } else if (row.format === 'ico') {
            if (showIcoMerge && icoMerge) {
              // Collect PNG buffers for merging later
              const pngBuf = await rasterizeSvgToArrayBuffer({
                svgContent: icon.iconContent,
                targetSize,
                format: 'png',
                quality: 100,
              });
              icoBuffers.push({ pngData: pngBuf, width: targetSize, height: targetSize });
            } else {
              // Single-size ICO
              const pngBuf = await rasterizeSvgToArrayBuffer({
                svgContent: icon.iconContent,
                targetSize,
                format: 'png',
                quality: 100,
              });
              const icoBuf = buildIcoBuffer([{ pngData: pngBuf, width: targetSize, height: targetSize }]);
              const dest = dirPath ? `${dirPath}/${fname}` : filePath!;
              await electronAPI.writeFile(dest, new Uint8Array(icoBuf));
            }
          } else {
            // PNG, JPG, WebP
            const blob = await rasterizeSvgToBlob({
              svgContent: icon.iconContent,
              targetSize,
              format: row.format,
              quality,
              bgColor: row.format === 'jpg' ? bgColor : undefined,
            });
            const dest = dirPath ? `${dirPath}/${fname}` : filePath!;
            const arrayBuf = await blob.arrayBuffer();
            await electronAPI.writeFile(dest, new Uint8Array(arrayBuf));
          }

          if (!(row.format === 'ico' && showIcoMerge && icoMerge)) {
            current++;
            setProgress({ current, total });
          }
        }

        // Write merged ICO
        if (icoBuffers.length > 0) {
          const icoBuf = buildIcoBuffer(icoBuffers);
          const fname = `${icon.iconName}.ico`;
          const dest = dirPath ? `${dirPath}/${fname}` : filePath!;
          await electronAPI.writeFile(dest, new Uint8Array(icoBuf));
          current++;
          setProgress({ current, total });
        }
      }

      message.success(t('iconExport.done'));
      onClose();
    } catch (err: any) {
      message.error(t('iconExport.error', { error: err.message }));
    } finally {
      setExporting(false);
    }
  }, [rows, icons, isBatch, totalFiles, quality, bgColor, icoMerge, showIcoMerge, firstIcon, t, onClose]);

  // ── Reset on open ──────────────────────────────────────
  const prevVisibleRef = React.useRef(false);
  if (visible && !prevVisibleRef.current) {
    // Fresh open: reset to default
    setRows([makeDefaultRow()]);
    setActivePreset(null);
    setExporting(false);
  }
  prevVisibleRef.current = visible;

  // ── Render ─────────────────────────────────────────────
  const title = isBatch
    ? t('iconExport.titleBatch', { count: icons.length })
    : t('iconExport.title');

  const footer = exporting ? null : (
    <>
      <Button onClick={onClose}>{t('iconExport.cancel')}</Button>
      <Button type="primary" onClick={handleExport} disabled={rows.length === 0}>
        {isBatch ? t('iconExport.exportAll') : t('iconExport.export')}
      </Button>
    </>
  );

  return (
    <Dialog
      open={visible}
      onClose={onClose}
      title={title}
      footer={footer}
      maskClosable={!exporting}
      closable={!exporting}
      className="!max-w-lg"
    >
      {/* Preview */}
      <div className="flex items-center gap-4 mb-4 pb-4 border-b border-border">
        {isBatch ? (
          <div className="relative w-20 h-20 shrink-0">
            {icons.slice(0, 3).map((icon, i) => (
              <div
                key={icon.id}
                className="absolute w-16 h-16 rounded-lg border border-border bg-surface flex items-center justify-center"
                style={{ top: i * 6, left: i * 6, zIndex: i }}
                dangerouslySetInnerHTML={{ __html: sanitizeSVG(icon.iconContent) }}
              />
            ))}
          </div>
        ) : firstIcon ? (
          <div
            className="w-20 h-20 shrink-0 rounded-lg border border-border flex items-center justify-center checkerboard"
            dangerouslySetInnerHTML={{ __html: sanitizeSVG(firstIcon.iconContent) }}
          />
        ) : null}
        <div>
          <div className="font-semibold text-foreground">
            {isBatch ? t('iconExport.titleBatch', { count: icons.length }) : firstIcon?.iconName}
          </div>
          {!isBatch && firstIcon && (
            <div className="text-xs text-foreground-muted mt-1">
              SVG · {viewBox.w} × {viewBox.h}
            </div>
          )}
        </div>
      </div>

      {/* Presets */}
      <div className="mb-3">
        <div className="text-[11px] uppercase tracking-wider text-foreground-muted mb-1.5">
          {t('iconExport.presets')}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => handlePreset(p)}
              className={cn(
                'px-3 py-1 rounded-md text-xs border transition-colors',
                activePreset === p.key
                  ? 'bg-accent/15 text-accent border-accent/30'
                  : 'bg-surface-muted/30 text-foreground-muted border-border/50 hover:border-accent/30'
              )}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Export Rows */}
      <div className="mb-3">
        <div className="text-[11px] uppercase tracking-wider text-foreground-muted mb-1.5">
          {t('iconExport.exportSettings')}
        </div>
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <ExportRow
              key={row.id}
              row={row}
              iconName={firstIcon?.iconName || 'icon'}
              onChange={handleRowChange}
              onDelete={handleRowDelete}
            />
          ))}
          <button
            onClick={handleAddRow}
            className={cn(
              'flex items-center justify-center gap-1 py-1.5',
              'border border-dashed border-border/50 rounded-lg',
              'text-xs text-foreground-muted hover:border-accent/30 hover:text-foreground',
              'transition-colors'
            )}
          >
            + {t('iconExport.addExport')}
          </button>
        </div>
      </div>

      {/* Format Settings — conditional */}
      {hasJpgOrWebp && (
        <div className="mb-3 p-3 rounded-lg border border-border/50 bg-surface-muted/20">
          <div className="text-[11px] uppercase tracking-wider text-foreground-muted mb-2">
            {t('iconExport.formatSettings')}
          </div>
          {rows.some((r) => r.format === 'jpg') && (
            <div className="flex items-center gap-3 mb-2 text-sm text-foreground-muted">
              <span className="w-28 shrink-0">{t('iconExport.jpgBackground')}</span>
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-6 h-6 rounded border border-border cursor-pointer"
              />
              <span className="text-xs font-mono text-foreground-muted">{bgColor}</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm text-foreground-muted">
            <span className="w-28 shrink-0">{t('iconExport.quality')}</span>
            <Slider
              defaultValue={quality}
              min={10}
              max={100}
              onChange={setQuality}
              tooltip={{ formatter: (v) => `${v}%` }}
              className="flex-1"
            />
            <span className="text-xs font-mono w-10 text-right">{quality}%</span>
          </div>
        </div>
      )}

      {/* ICO Merge — conditional */}
      {showIcoMerge && (
        <div className="mb-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <Checkbox checked={icoMerge} onChange={setIcoMerge}>
            <span className="text-sm text-amber-600 dark:text-amber-400">
              {t('iconExport.icoMerge')}
            </span>
          </Checkbox>
        </div>
      )}

      {/* Progress — during export */}
      {exporting && (
        <div className="mb-3 text-sm text-foreground-muted">
          {t('iconExport.exporting', { current: progress.current, total: progress.total })}
          <div className="mt-1 h-1.5 bg-surface-accent rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer info */}
      {!exporting && (
        <div className="text-xs text-foreground-muted pt-2 border-t border-border">
          {isBatch
            ? t('iconExport.fileSummaryBatch', {
                icons: icons.length,
                rows: rows.length,
                total: totalFiles,
              })
            : t('iconExport.fileSummary', { count: totalFiles })}
        </div>
      )}
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/IconExportDialog/index.tsx
git commit -m "feat(export): add IconExportDialog main component"
```

---

## Task 7: Wire Up SideEditor and BatchPanel

**Files:**
- Modify: `src/renderer/components/SideEditor/index.tsx`
- Modify: `src/renderer/components/BatchPanel/index.tsx`

- [ ] **Step 1: Wire SideEditor**

In `src/renderer/components/SideEditor/index.tsx`:

1. Add import at top (after existing imports):

```tsx
import { IconExportDialog } from '../IconExportDialog';
import type { IconExportTarget } from '../IconExportDialog';
```

2. Add state (near other useState hooks, around line 50):

```tsx
const [exportDialogVisible, setExportDialogVisible] = useState(false);
```

3. Replace `handleIconExport` function (lines 222-233) with:

```tsx
const handleIconExport = () => setExportDialogVisible(true);
```

4. Build export targets (near the derived state section):

```tsx
const exportIcons: IconExportTarget[] = useMemo(
  () => iconData ? [{ id: iconData.id, iconName: iconData.iconName, iconContent: iconData.iconContent }] : [],
  [iconData]
);
```

5. Add dialog render before the closing `</div>` of the component (around line 774):

```tsx
<IconExportDialog
  visible={exportDialogVisible}
  onClose={() => setExportDialogVisible(false)}
  icons={exportIcons}
/>
```

- [ ] **Step 2: Wire BatchPanel**

In `src/renderer/components/BatchPanel/index.tsx`:

1. Add import:

```tsx
import { IconExportDialog } from '../IconExportDialog';
import type { IconExportTarget } from '../IconExportDialog';
```

2. Add state:

```tsx
const [exportDialogVisible, setExportDialogVisible] = useState(false);
```

3. Replace `handleExport` (lines 86-102) with:

```tsx
const handleExport = useCallback(() => setExportDialogVisible(true), []);
```

4. Build export targets:

```tsx
const exportIcons: IconExportTarget[] = useMemo(
  () => selectedIds.map((id: string) => {
    const data = db.getIconData(id);
    return data ? { id, iconName: data.iconName, iconContent: data.iconContent } : null;
  }).filter(Boolean) as IconExportTarget[],
  [selectedIds]
);
```

5. Add dialog render before closing tag:

```tsx
<IconExportDialog
  visible={exportDialogVisible}
  onClose={() => setExportDialogVisible(false)}
  icons={exportIcons}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SideEditor/index.tsx src/renderer/components/BatchPanel/index.tsx
git commit -m "feat(export): wire IconExportDialog to SideEditor and BatchPanel"
```

---

## Task 8: Export Worker for Batch Mode

**Files:**
- Create: `src/renderer/workers/exportRaster.worker.ts`

- [ ] **Step 1: Write the worker**

```ts
// src/renderer/workers/exportRaster.worker.ts
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

      // Prepare SVG with target dimensions
      let svg = svgContent;
      if (!svg.includes('width=')) {
        svg = svg.replace('<svg', `<svg width="${targetSize}" height="${targetSize}"`);
      }

      const canvas = new OffscreenCanvas(targetSize, targetSize);
      const ctx = canvas.getContext('2d')!;

      // Background fill for JPG
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
        quality: (format === 'jpg' || format === 'webp') ? quality / 100 : undefined,
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
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/workers/exportRaster.worker.ts
git commit -m "feat(export): add batch export Worker with OffscreenCanvas"
```

---

## Task 9: Checkerboard CSS + Build Verify

**Files:**
- Modify: `src/renderer/index.css` (or equivalent global CSS)

- [ ] **Step 1: Add checkerboard utility class**

Search for the global CSS file and add this utility class if not already present:

```css
.checkerboard {
  background-image: repeating-conic-gradient(
    hsl(var(--surface-accent)) 0% 25%,
    transparent 0% 50%
  );
  background-size: 12px 12px;
}
```

- [ ] **Step 2: Verify build**

```bash
npx electron-vite build
```

Expected: Clean build, no errors.

- [ ] **Step 3: Run existing tests**

```bash
npx vitest run
```

Expected: All existing tests PASS + new export tests PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(export): add checkerboard CSS, verify build and tests"
```

---

## Task 10: Manual Smoke Test

- [ ] **Step 1: Start dev mode**

```bash
npx electron-vite dev
```

- [ ] **Step 2: Test single icon export**

1. Import or select any SVG icon in the app
2. Click "Export" in SideEditor → dialog opens
3. Verify: icon preview with checkerboard background
4. Click "iOS" preset → 3 rows appear (@1x/@2x/@3x PNG)
5. Click "Add export" → new row added
6. Change format to JPG → Format Settings section appears
7. Change format to ICO → add another ICO row → ICO merge checkbox appears
8. Click "Export" → save dialog → verify files are correct

- [ ] **Step 3: Test batch export**

1. Select multiple icons (batch mode)
2. Click "Export" in BatchPanel → dialog opens with stacked preview
3. Apply "Favicon" preset → verify 6 rows + ICO merge
4. Export → verify directory contains all expected files

- [ ] **Step 4: Verify exported files**

Open exported PNG/JPG/WebP in image viewer. Open SVG in browser. Open PDF in PDF reader. Open ICO in a viewer or Windows icon preview.

- [ ] **Step 5: Commit any fixes discovered during smoke test**

```bash
git add -A
git commit -m "fix(export): smoke test fixes"
```
