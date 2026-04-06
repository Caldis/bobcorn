/**
 * Operation Registry — migration dashboard for CLI + AI-Ready Architecture.
 *
 * Tracks every user-facing operation and its migration status.
 * All operations start as Legacy (living in store/components).
 * As they are extracted to src/core/operations/, their status updates.
 */

export const enum OpStatus {
  /** Implemented in src/core/, used by both CLI and GUI */
  Core = 'core',
  /** Still lives in store/components, needs migration */
  Legacy = 'legacy',
  /** Migration in progress */
  Migrating = 'migrating',
}

export interface OpEntry {
  id: string;
  description: string;
  status: OpStatus;
  corePath?: string;
  legacyPaths?: string[];
  cliCommand: string | null;
}

export const OPERATIONS: OpEntry[] = [
  // ── Project ─────────────────────────────────────────────
  {
    id: 'project.create',
    description: 'Create a new .icp project file',
    status: OpStatus.Core,
    corePath: 'src/core/operations/project.ts#createProject',
    legacyPaths: ['src/renderer/database/index.ts#initDatabases'],
    cliCommand: 'project create',
  },
  {
    id: 'project.save',
    description: 'Save project to .icp file (export database binary)',
    status: OpStatus.Legacy,
    legacyPaths: ['src/renderer/containers/MainContainer/index.tsx#handleSave'],
    cliCommand: null, // implicit — every write command auto-saves
  },
  {
    id: 'project.save-as',
    description: 'Copy the project to a new .icp file (backup/clone)',
    status: OpStatus.Core,
    corePath: 'src/core/operations/project.ts#saveAsProject',
    legacyPaths: [],
    cliCommand: 'project save-as',
  },
  {
    id: 'project.open-file',
    description: 'Open an existing .icp project file',
    status: OpStatus.Legacy,
    legacyPaths: ['src/renderer/containers/MainContainer/index.tsx#handleOpen'],
    cliCommand: null, // GUI-only: opens file dialog → loads into renderer state. CLI opens per-command.
  },
  {
    id: 'project.inspect',
    description: 'Show project metadata, icon count, group list, and validation',
    status: OpStatus.Core,
    corePath: 'src/core/operations/project.ts#inspectProject',
    legacyPaths: ['src/renderer/database/index.ts#getProjectAttributes'],
    cliCommand: 'project inspect',
  },
  {
    id: 'project.set-name',
    description: 'Set project/font family name',
    status: OpStatus.Core,
    corePath: 'src/core/operations/project.ts#setProjectName',
    legacyPaths: ['src/renderer/components/SideMenu/ExportDialog.tsx'],
    cliCommand: 'project set-name',
  },
  {
    id: 'project.set-prefix',
    description: 'Set CSS class prefix for font export',
    status: OpStatus.Core,
    corePath: 'src/core/operations/project.ts#setProjectName',
    legacyPaths: ['src/renderer/components/SideMenu/ExportDialog.tsx'],
    cliCommand: 'project set-prefix',
  },
  {
    id: 'project.reset',
    description: 'Reset project to empty state (clear all icons and groups)',
    status: OpStatus.Legacy,
    legacyPaths: ['src/renderer/containers/MainContainer/index.tsx#resetProject'],
    cliCommand: null, // GUI-only: resets in-memory state. For CLI, just create a new project.
  },

  // ── Icon ────────────────────────────────────────────────
  {
    id: 'icon.import',
    description: 'Import SVG files into project (sanitize + insert)',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#importIcons',
    legacyPaths: ['src/renderer/store/index.ts#importIcons', 'src/renderer/utils/importer/'],
    cliCommand: 'icon import',
  },
  {
    id: 'icon.list',
    description: 'List icons in project, optionally filtered by group',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#listIcons',
    legacyPaths: ['src/renderer/components/IconGridLocal/index.tsx'],
    cliCommand: 'icon list',
  },
  {
    id: 'icon.rename',
    description: 'Rename an icon',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#renameIcon',
    legacyPaths: ['src/renderer/components/SideEditor/index.tsx'],
    cliCommand: 'icon rename',
  },
  {
    id: 'icon.move',
    description: 'Move icon(s) to a different group (batch)',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#moveIcons',
    legacyPaths: ['src/renderer/components/BatchPanel/index.tsx'],
    cliCommand: 'icon move',
  },
  {
    id: 'icon.copy',
    description: 'Copy icon(s) to a different group (batch)',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#copyIcons',
    legacyPaths: ['src/renderer/components/BatchPanel/index.tsx'],
    cliCommand: 'icon copy',
  },
  {
    id: 'icon.delete',
    description: 'Delete icon(s) with variant-safe cascade (batch)',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#deleteIcons',
    legacyPaths: [
      'src/renderer/components/SideEditor/index.tsx',
      'src/renderer/components/BatchPanel/index.tsx',
      'src/renderer/utils/variantGuard.ts',
    ],
    cliCommand: 'icon delete',
  },
  {
    id: 'icon.set-code',
    description: 'Set unicode code point for an icon',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#setIconCode',
    legacyPaths: ['src/renderer/components/SideEditor/index.tsx'],
    cliCommand: 'icon set-code',
  },
  {
    id: 'icon.replace',
    description: 'Replace SVG content of an existing icon',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#replaceIcon',
    legacyPaths: ['src/renderer/components/SideEditor/index.tsx'],
    cliCommand: 'icon replace',
  },
  {
    id: 'icon.export-svg',
    description: 'Export icon(s) as SVG files to disk',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#exportIconSvg',
    legacyPaths: ['src/renderer/components/SideEditor/index.tsx'],
    cliCommand: 'icon export-svg',
  },
  {
    id: 'icon.set-favorite',
    description: 'Toggle favorite status on icon(s)',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#setIconFavorite',
    legacyPaths: ['src/renderer/components/IconBlock/index.tsx'],
    cliCommand: 'icon set-favorite',
  },
  {
    id: 'icon.set-color',
    description: 'Batch set fill/stroke color on icon(s) — regex-based SVG replacement',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#setIconColor',
    legacyPaths: ['src/renderer/components/BatchPanel/index.tsx'],
    cliCommand: 'icon set-color',
  },
  {
    id: 'icon.get-content',
    description: 'Get SVG content of an icon',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#getIconContent',
    legacyPaths: [
      'src/renderer/components/IconBlock/index.tsx',
      'src/renderer/components/GroupIconPreview.tsx',
      'src/renderer/components/SideEditor/index.tsx',
    ],
    cliCommand: 'icon get-content',
  },

  // ── Group ───────────────────────────────────────────────
  {
    id: 'group.list',
    description: 'List all groups with icon counts',
    status: OpStatus.Core,
    corePath: 'src/core/operations/group.ts#listGroups',
    legacyPaths: [
      'src/renderer/store/index.ts#syncLeft',
      'src/renderer/components/SideMenu/GroupList.tsx',
    ],
    cliCommand: 'group list',
  },
  {
    id: 'group.add',
    description: 'Create a new group',
    status: OpStatus.Core,
    corePath: 'src/core/operations/group.ts#addGroup',
    legacyPaths: ['src/renderer/components/SideMenu/GroupDialogs.tsx'],
    cliCommand: 'group add',
  },
  {
    id: 'group.rename',
    description: 'Rename an existing group',
    status: OpStatus.Core,
    corePath: 'src/core/operations/group.ts#renameGroup',
    legacyPaths: ['src/renderer/components/SideMenu/GroupDialogs.tsx'],
    cliCommand: 'group rename',
  },
  {
    id: 'group.delete',
    description: 'Delete a group (icons moved to uncategorized)',
    status: OpStatus.Core,
    corePath: 'src/core/operations/group.ts#deleteGroup',
    legacyPaths: ['src/renderer/components/SideMenu/GroupDialogs.tsx'],
    cliCommand: 'group delete',
  },
  {
    id: 'group.reorder',
    description: 'Change group display order',
    status: OpStatus.Core,
    corePath: 'src/core/operations/group.ts#reorderGroups',
    legacyPaths: ['src/renderer/components/SideMenu/GroupList.tsx'],
    cliCommand: 'group reorder',
  },
  {
    id: 'group.set-description',
    description: 'Set or update group description text',
    status: OpStatus.Core,
    corePath: 'src/core/operations/group.ts#setGroupDescription',
    legacyPaths: ['src/renderer/components/SideMenu/GroupDialogs.tsx'],
    cliCommand: 'group set-description',
  },
  {
    id: 'group.move-icons',
    description: 'Move icon(s) into a target group',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#moveIcons',
    legacyPaths: ['src/renderer/components/BatchPanel/index.tsx'],
    cliCommand: 'group move-icons',
  },

  // ── Export ──────────────────────────────────────────────
  {
    id: 'export.font',
    description: 'Generate iconfont files (SVG/TTF/WOFF/WOFF2/EOT) + CSS + JS symbol sprite',
    status: OpStatus.Core,
    corePath: 'src/core/operations/export-font.ts#exportFont',
    legacyPaths: [
      'src/renderer/components/SideMenu/ExportDialog.tsx',
      'src/renderer/utils/generators/',
    ],
    cliCommand: 'export font',
  },
  {
    id: 'export.icon',
    description: 'Export icons as raster/vector files (PNG/JPG/WebP/SVG/PDF/ICO) with presets',
    status: OpStatus.Legacy,
    legacyPaths: [
      'src/renderer/components/IconExportDialog/index.tsx',
      'src/renderer/utils/export/',
      'src/renderer/workers/exportRaster.worker.ts',
    ],
    cliCommand: 'export icon', // Legacy: requires Canvas for rasterization (PNG/JPG/WebP/ICO)
  },
  {
    id: 'export.svg',
    description: 'Export all icons as individual SVG files',
    status: OpStatus.Core,
    corePath: 'src/core/operations/export-svg.ts#exportBatchSvg',
    legacyPaths: ['src/renderer/components/SideMenu/ExportDialog.tsx'],
    cliCommand: 'export svg',
  },
  {
    id: 'export.demo-page',
    description: 'Generate HTML demo/preview page for the icon font',
    status: OpStatus.Legacy,
    legacyPaths: ['src/renderer/utils/generators/demopageGenerator/index.ts'],
    cliCommand: null, // GUI-only: requires DOM for HTML template rendering. Sub-operation of export.font --preview.
  },

  // ── Variant ─────────────────────────────────────────────
  {
    id: 'variant.generate',
    description:
      'Generate weight/scale variants for an icon — NOT available in CLI headless mode. ' +
      'Requires Canvas/DOM rendering context (feMorphology filter + rasterize + retrace pipeline).',
    status: OpStatus.Legacy,
    legacyPaths: ['src/renderer/components/SideEditor/VariantPanel.tsx'],
    cliCommand: 'variant generate', // stub — prints NOT_AVAILABLE_HEADLESS error
  },
  {
    id: 'variant.list',
    description: 'List all variants of a given icon',
    status: OpStatus.Core,
    corePath: 'src/core/operations/variant.ts#listVariants',
    legacyPaths: ['src/renderer/components/SideEditor/VariantPanel.tsx'],
    cliCommand: 'variant list',
  },
  {
    id: 'variant.delete',
    description: 'Delete all variants of a given icon (hard delete)',
    status: OpStatus.Core,
    corePath: 'src/core/operations/variant.ts#deleteVariants',
    legacyPaths: ['src/renderer/components/SideEditor/VariantPanel.tsx'],
    cliCommand: 'variant delete',
  },

  // ── Search ──────────────────────────────────────────────
  {
    id: 'search.query',
    description: 'Search icons by name, optionally filtered by group',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#searchIcons',
    legacyPaths: ['src/renderer/components/IconInfoBar/index.tsx'],
    cliCommand: 'search',
  },

  // ── Favorite ────────────────────────────────────────────
  {
    id: 'favorite.list',
    description: 'List all favorited icons',
    status: OpStatus.Core,
    corePath: 'src/core/operations/icon.ts#listFavorites',
    legacyPaths: ['src/renderer/components/IconGridLocal/index.tsx'],
    cliCommand: 'favorite list',
  },
];
