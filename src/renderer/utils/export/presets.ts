/**
 * Re-export from core operations layer.
 * Original implementation moved to src/core/operations/export-presets.ts.
 */
export { PRESETS, buildFilename, computeOutputSize } from '@core/operations/export-presets';
export type {
  ExportFormat,
  SizeMode,
  ExportRowConfig,
  PresetDef,
} from '@core/operations/export-presets';
