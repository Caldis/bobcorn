/**
 * Platform export presets and filename/size utilities.
 *
 * Moved from src/renderer/utils/export/presets.ts to src/core/operations/
 * as part of the CLI + AI-Ready Architecture migration. This module is pure
 * logic with zero browser/window dependencies.
 */

import type { ExportFormat, SizeMode, ExportRowConfig, PresetDef } from '../types';

export type { ExportFormat, SizeMode, ExportRowConfig, PresetDef };

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
    key: 'rn',
    labelKey: 'iconExport.preset.rn',
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

export function buildFilename(
  iconName: string,
  row: Pick<ExportRowConfig, 'sizeMode' | 'scale' | 'format'> & { pixelSize?: number }
): string {
  if (row.format === 'svg') {
    // SVG is vector, size doesn't apply — but add suffix if scale != 1 to avoid overwrites
    if (row.sizeMode === 'scale' && row.scale !== 1) return `${iconName}@${row.scale}x.svg`;
    if (row.sizeMode === 'pixel' && row.pixelSize) return `${iconName}-${row.pixelSize}px.svg`;
    return `${iconName}.svg`;
  }
  if (row.sizeMode === 'scale') {
    const suffix = row.scale === 1 ? '' : `@${row.scale}x`;
    return `${iconName}${suffix}.${row.format}`;
  }
  return `${iconName}-${row.pixelSize}px.${row.format}`;
}

export function computeOutputSize(
  row: Pick<ExportRowConfig, 'sizeMode' | 'scale' | 'pixelSize'>,
  viewBoxW: number,
  viewBoxH?: number
): number {
  if (row.sizeMode === 'pixel') return row.pixelSize;
  const longest = Math.max(viewBoxW, viewBoxH ?? viewBoxW);
  return Math.round(longest * row.scale);
}
