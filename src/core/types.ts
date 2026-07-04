/**
 * Shared type definitions used by both CLI and GUI.
 *
 * These types were originally defined in src/renderer/database/index.ts
 * and src/renderer/utils/export/presets.ts. They are now canonical here
 * in src/core/ so that both entry points share the same contracts.
 */

// ---------------------------------------------------------------------------
// Database entity types
// ---------------------------------------------------------------------------

/** Icon data as stored in the database */
export interface IconData {
  id: string;
  iconCode: string;
  iconName: string;
  iconGroup: string;
  iconSize: number;
  iconType: string;
  iconContent: string;
  variantOf?: string | null;
  variantMeta?: string | null;
  isFavorite?: number;
  originalContent?: string | null;
  createTime?: string;
  updateTime?: string;
}

/** Group data as stored in the database */
export interface GroupData {
  id: string;
  groupName: string;
  groupOrder: number;
  groupColor?: string;
  groupDescription?: string;
  groupIcon?: string;
  /** Optional per-group PUA code range (decimal code points). */
  codeRangeStart?: number | null;
  codeRangeEnd?: number | null;
  createTime?: string;
  updateTime?: string;
}

/** Project attributes as stored in the database */
export interface ProjectAttributes {
  id: string;
  /** Icon code prefix (technical: font family name / CSS class prefix / export dir) */
  projectName: string;
  /** Human-readable project name (user-facing). Optional; falls back to projectName. */
  displayName?: string;
  createTime?: string;
  updateTime?: string;
}

// ---------------------------------------------------------------------------
// Icon code allocation
// ---------------------------------------------------------------------------

/**
 * New-icon unicode code allocation mode. Mirrors the GUI's "codeAllocationMode"
 * setting (src/renderer/config/index.ts) so CLI and GUI produce identical codes
 * given the same project state and mode:
 *   append (default) — allocate past the highest currently-used PUA code point,
 *     protecting already-published CSS class references from code reuse. Falls
 *     back to hole-filling only when the tail is full (next code > F8FF).
 *   fill — always return the lowest free PUA code point (fills holes first,
 *     maximizes code point utilization).
 *
 * NOTE: unlike most GUI settings, codeAllocationMode is a global renderer
 * localStorage preference, NOT a field persisted in the .icp project file —
 * there is no per-project value for the CLI to read. The CLI only supports
 * an explicit --code-mode flag, defaulting to 'append' when omitted.
 */
export type CodeAllocationMode = 'append' | 'fill';

// ---------------------------------------------------------------------------
// Export types (from renderer/utils/export/presets.ts)
// ---------------------------------------------------------------------------

export type ExportFormat = 'svg' | 'png' | 'jpg' | 'webp' | 'pdf' | 'ico';
export type SizeMode = 'scale' | 'pixel';

export interface ExportRowConfig {
  id: string;
  sizeMode: SizeMode;
  scale: number;
  pixelSize: number;
  format: ExportFormat;
}

export interface PresetDef {
  key: string;
  labelKey: string;
  rows: Omit<ExportRowConfig, 'id'>[];
  icoMerge?: boolean;
}
