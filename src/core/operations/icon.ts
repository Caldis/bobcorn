/**
 * Core icon operations — list, import, delete, rename, move, get-content.
 *
 * Environment-agnostic: no browser globals or build-time env vars.
 * All file I/O goes through IoAdapter.
 */
import type { IoAdapter } from '../io';
import type { IconData } from '../types';
import { openProject, saveProject } from '../database';
import crypto from 'crypto';

/** Environment-agnostic byte length (avoids Node-only Buffer) */
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
function byteLength(str: string): number {
  return textEncoder.encode(str).length;
}
function uint8ToString(data: Uint8Array): string {
  return textDecoder.decode(data);
}

// ---------------------------------------------------------------------------
// SVG sanitization — CLI-safe (no DOMPurify / no DOM required)
// ---------------------------------------------------------------------------

/**
 * Strip script tags and event handlers from SVG content.
 * This is a lightweight alternative to DOMPurify for CLI use.
 */
function sanitizeSvgForCli(svg: string): string {
  // Remove <script> tags and their content
  let result = svg.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  // Remove on* event handler attributes
  result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  return result;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List icons in a project, optionally filtered by group.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param opts - Optional filter: group name (group id)
 * @returns Array of icon data records
 */
export async function listIcons(
  io: IoAdapter,
  projectPath: string,
  opts?: { group?: string }
): Promise<IconData[]> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    if (opts?.group) {
      // Find the group by name to get its id
      const groups = db.getGroupList();
      const targetGroup = groups.find((g) => g.groupName === opts.group);
      if (!targetGroup) {
        return []; // Group not found — return empty
      }
      return db.getIconListFromGroup(targetGroup.id);
    }
    return db.getIconList();
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportResult {
  imported: number;
  icons: { id: string; name: string; code: string }[];
}

/**
 * Import SVG files into a project.
 *
 * Reads each SVG file, sanitizes it (strips scripts/event handlers),
 * generates a UUID and auto-assigns the next available unicode code,
 * then inserts into the iconData table.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param svgPaths - Paths to SVG files to import
 * @param opts - Optional: target group name (default: uncategorized)
 */
export async function importIcons(
  io: IoAdapter,
  projectPath: string,
  svgPaths: string[],
  opts?: { group?: string }
): Promise<ImportResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    // Resolve target group
    let targetGroupId = 'resource-uncategorized';
    if (opts?.group) {
      const group = db.findGroupByName(opts.group);
      if (!group) {
        throw new Error(`Group not found: ${opts.group}`);
      }
      targetGroupId = group.id as string;
    }

    const imported: { id: string; name: string; code: string }[] = [];

    for (const svgPath of svgPaths) {
      const resolvedSvg = io.resolve(svgPath);
      const data = await io.readFile(resolvedSvg);
      const content = uint8ToString(data);
      const sanitized = sanitizeSvgForCli(content);

      const id = crypto.randomUUID();
      const iconCode = db.getNewIconCode();
      const iconName = io.basename(svgPath, io.extname(svgPath));
      const iconSize = byteLength(sanitized);

      db.addIcon({
        id,
        iconCode,
        iconName,
        iconGroup: targetGroupId,
        iconSize,
        iconType: 'svg',
        iconContent: sanitized,
      });

      imported.push({ id, name: iconName, code: iconCode });
    }

    await saveProject(io, resolvedPath, db);

    return { imported: imported.length, icons: imported };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export interface DeleteResult {
  deleted: number;
  ids: string[];
}

/**
 * Soft-delete icons by moving them to the 'resource-deleted' group.
 * Variants are cascade-deleted (hard delete).
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param ids - Icon UUIDs to delete
 */
export async function deleteIcons(
  io: IoAdapter,
  projectPath: string,
  ids: string[]
): Promise<DeleteResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    // Verify icons exist
    const validIds: string[] = [];
    for (const id of ids) {
      const icon = db.getIcon(id);
      if (icon) {
        validIds.push(id);
      }
    }

    db.deleteIcons(validIds);
    await saveProject(io, resolvedPath, db);

    return { deleted: validIds.length, ids: validIds };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

export interface RenameResult {
  id: string;
  oldName: string;
  newName: string;
}

/**
 * Rename an icon by its UUID.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param id - Icon UUID
 * @param newName - New icon name
 */
export async function renameIcon(
  io: IoAdapter,
  projectPath: string,
  id: string,
  newName: string
): Promise<RenameResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const icon = db.getIcon(id);
    if (!icon) {
      throw new Error(`Icon not found: ${id}`);
    }

    const oldName = icon.iconName as string;
    db.setIconName(id, newName);
    await saveProject(io, resolvedPath, db);

    return { id, oldName, newName };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

export interface MoveResult {
  moved: number;
  ids: string[];
  targetGroup: string;
}

/**
 * Move icons to a different group. Variants follow their parent.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param ids - Icon UUIDs to move
 * @param targetGroupName - Target group name
 */
export async function moveIcons(
  io: IoAdapter,
  projectPath: string,
  ids: string[],
  targetGroupName: string
): Promise<MoveResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    // Resolve target group by name
    const group = db.findGroupByName(targetGroupName);
    if (!group) {
      throw new Error(`Group not found: ${targetGroupName}`);
    }
    const targetGroupId = group.id as string;

    db.moveIcons(ids, targetGroupId);
    await saveProject(io, resolvedPath, db);

    return { moved: ids.length, ids, targetGroup: targetGroupName };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Get Content
// ---------------------------------------------------------------------------

/**
 * Get the raw SVG content of an icon.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param id - Icon UUID
 * @returns Raw SVG string
 */
export async function getIconContent(
  io: IoAdapter,
  projectPath: string,
  id: string
): Promise<string> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const content = db.getIconContent(id);
    if (content === null) {
      throw new Error(`Icon not found: ${id}`);
    }
    return content;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export interface CopyResult {
  copied: number;
  icons: { id: string; name: string; code: string }[];
  targetGroup: string;
}

/**
 * Copy icons to a target group (duplicate with new UUID + unicode code).
 * Does NOT copy variants.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param ids - Icon UUIDs to copy
 * @param targetGroupName - Target group name
 */
export async function copyIcons(
  io: IoAdapter,
  projectPath: string,
  ids: string[],
  targetGroupName: string
): Promise<CopyResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const group = db.findGroupByName(targetGroupName);
    if (!group) {
      throw new Error(`Group not found: ${targetGroupName}`);
    }
    const targetGroupId = group.id as string;

    const copied: { id: string; name: string; code: string }[] = [];
    for (const sourceId of ids) {
      const result = db.copyIcon(sourceId, targetGroupId);
      copied.push({ id: result.id, name: result.iconName, code: result.iconCode });
    }

    await saveProject(io, resolvedPath, db);

    return { copied: copied.length, icons: copied, targetGroup: targetGroupName };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Set Code
// ---------------------------------------------------------------------------

export interface SetCodeResult {
  id: string;
  oldCode: string;
  newCode: string;
}

/**
 * Set the unicode code point for an icon.
 * Validates hex format in the PUA range E000-F8FF.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param id - Icon UUID
 * @param code - Hex code (e.g. "E001", "F000")
 */
export async function setIconCode(
  io: IoAdapter,
  projectPath: string,
  id: string,
  code: string
): Promise<SetCodeResult> {
  // Validate hex format
  const normalized = code.toUpperCase();
  if (!/^[0-9A-F]{4}$/.test(normalized)) {
    throw new Error(`Invalid hex code: "${code}". Must be 4 hex digits (e.g. "E001").`);
  }
  const codeNum = parseInt(normalized, 16);
  if (codeNum < 0xe000 || codeNum > 0xf8ff) {
    throw new Error(`Code "${normalized}" is outside the PUA range (E000-F8FF).`);
  }

  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const icon = db.getIcon(id);
    if (!icon) {
      throw new Error(`Icon not found: ${id}`);
    }
    const oldCode = icon.iconCode as string;
    db.setIconCode(id, normalized);
    await saveProject(io, resolvedPath, db);

    return { id, oldCode, newCode: normalized };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Replace
// ---------------------------------------------------------------------------

export interface ReplaceResult {
  id: string;
  iconName: string;
  newSize: number;
}

/**
 * Replace an icon's SVG content with a new SVG file.
 * Deletes any variants of this icon.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param id - Icon UUID
 * @param svgPath - Path to the new SVG file
 */
export async function replaceIcon(
  io: IoAdapter,
  projectPath: string,
  id: string,
  svgPath: string
): Promise<ReplaceResult> {
  const resolvedPath = io.resolve(projectPath);
  const resolvedSvg = io.resolve(svgPath);

  const data = await io.readFile(resolvedSvg);
  const content = uint8ToString(data);
  const sanitized = sanitizeSvgForCli(content);

  const db = await openProject(io, resolvedPath);

  try {
    const icon = db.getIcon(id);
    if (!icon) {
      throw new Error(`Icon not found: ${id}`);
    }

    db.replaceIconContent(id, sanitized);
    await saveProject(io, resolvedPath, db);

    return {
      id,
      iconName: icon.iconName as string,
      newSize: byteLength(sanitized),
    };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Export SVG
// ---------------------------------------------------------------------------

export interface ExportSvgResult {
  exported: number;
  files: { id: string; name: string; path: string }[];
}

/**
 * Export icons as individual SVG files.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param ids - Icon UUIDs to export
 * @param outDir - Output directory
 */
export async function exportIconSvg(
  io: IoAdapter,
  projectPath: string,
  ids: string[],
  outDir: string
): Promise<ExportSvgResult> {
  const resolvedPath = io.resolve(projectPath);
  const resolvedOut = io.resolve(outDir);
  const db = await openProject(io, resolvedPath);

  try {
    // Ensure output directory exists
    if (!(await io.exists(resolvedOut))) {
      await io.mkdir(resolvedOut, { recursive: true });
    }

    const files: { id: string; name: string; path: string }[] = [];

    for (const id of ids) {
      const icon = db.getIcon(id);
      if (!icon) {
        throw new Error(`Icon not found: ${id}`);
      }
      const content = db.getIconContent(id);
      if (content === null) {
        throw new Error(`Icon content not found: ${id}`);
      }

      const fileName = `${icon.iconName}.svg`;
      const filePath = io.join(resolvedOut, fileName);
      const data = new TextEncoder().encode(content);
      await io.writeFile(filePath, data);

      files.push({ id, name: icon.iconName as string, path: filePath });
    }

    return { exported: files.length, files };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Set Favorite
// ---------------------------------------------------------------------------

export interface SetFavoriteResult {
  id: string;
  iconName: string;
  isFavorite: boolean;
}

/**
 * Set or unset the favorite flag for an icon.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param id - Icon UUID
 * @param favorite - true to mark as favorite, false to unmark
 */
export async function setIconFavorite(
  io: IoAdapter,
  projectPath: string,
  id: string,
  favorite: boolean
): Promise<SetFavoriteResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const icon = db.getIcon(id);
    if (!icon) {
      throw new Error(`Icon not found: ${id}`);
    }

    db.setIconFavorite(id, favorite);
    await saveProject(io, resolvedPath, db);

    return { id, iconName: icon.iconName as string, isFavorite: favorite };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search icons by name substring.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param query - Search term (substring match on iconName)
 * @param opts - Optional group filter and limit
 */
export async function searchIcons(
  io: IoAdapter,
  projectPath: string,
  query: string,
  opts?: { group?: string; limit?: number }
): Promise<IconData[]> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    let groupId: string | undefined;
    if (opts?.group) {
      const group = db.findGroupByName(opts.group);
      if (!group) {
        throw new Error(`Group not found: ${opts.group}`);
      }
      groupId = group.id as string;
    }

    return db.searchIcons(query, { groupId, limit: opts?.limit });
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// List Favorites
// ---------------------------------------------------------------------------

/**
 * List all icons marked as favorite.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 */
export async function listFavorites(io: IoAdapter, projectPath: string): Promise<IconData[]> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    return db.getFavoriteIcons();
  } finally {
    db.close();
  }
}
