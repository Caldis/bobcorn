/**
 * Re-export from core operations layer.
 * Original implementation moved to src/core/operations/export-formats.ts.
 */
export {
  ICO_HEADER_SIZE,
  ICO_DIRENTRY_SIZE,
  buildIcoBuffer,
  buildPdfBuffer,
} from '@core/operations/export-formats';
export type { IcoEntry } from '@core/operations/export-formats';
