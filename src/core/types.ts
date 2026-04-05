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
  createTime?: string;
  updateTime?: string;
}

/** Project attributes as stored in the database */
export interface ProjectAttributes {
  id: string;
  projectName: string;
  createTime?: string;
  updateTime?: string;
}

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
