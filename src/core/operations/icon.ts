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
      const content = Buffer.from(data).toString('utf-8');
      const sanitized = sanitizeSvgForCli(content);

      const id = crypto.randomUUID();
      const iconCode = db.getNewIconCode();
      const iconName = io.basename(svgPath, io.extname(svgPath));
      const iconSize = Buffer.byteLength(sanitized, 'utf-8');

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
