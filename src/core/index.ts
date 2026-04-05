/**
 * src/core/ — Public API barrel export.
 *
 * This is the shared operations kernel for Bobcorn. Both the CLI and GUI
 * import from here. Environment-specific I/O is injected via adapters.
 */

// Adapter interfaces
export type { IoAdapter } from './io';
export type { CanvasAdapter, CanvasLike, CanvasContext2D, ImageLike } from './canvas';

// Shared types
export type {
  IconData,
  GroupData,
  ProjectAttributes,
  ExportFormat,
  SizeMode,
  ExportRowConfig,
  PresetDef,
} from './types';

// Operations registry
export { OpStatus, OPERATIONS } from './registry';
export type { OpEntry } from './registry';
