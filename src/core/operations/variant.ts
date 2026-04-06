/**
 * Core variant operations — list and delete variants.
 *
 * Variant generation (feMorphology + Canvas bake pipeline) requires a
 * browser/Electron rendering context and cannot run in headless CLI mode.
 * Only read/delete operations are available here.
 *
 * Environment-agnostic: no browser globals or build-time env vars.
 * All file I/O goes through IoAdapter.
 */
import type { IoAdapter } from '../io';
import type { IconData } from '../types';
import { openProject, saveProject } from '../database';

// ---------------------------------------------------------------------------
// List Variants
// ---------------------------------------------------------------------------

export interface ListVariantsResult {
  parentId: string;
  parentName: string;
  variants: IconData[];
}

/**
 * List all variants of a given parent icon.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param parentId - UUID of the parent icon
 * @returns Parent info and array of variant icon records
 */
export async function listVariants(
  io: IoAdapter,
  projectPath: string,
  parentId: string
): Promise<ListVariantsResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const parent = db.getIcon(parentId);
    if (!parent) {
      throw new Error(`Icon not found: ${parentId}`);
    }

    const variants = db.getVariants(parentId) as unknown as IconData[];

    return {
      parentId,
      parentName: parent.iconName as string,
      variants,
    };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Delete Variants
// ---------------------------------------------------------------------------

export interface DeleteVariantsResult {
  parentId: string;
  parentName: string;
  deleted: number;
}

/**
 * Delete all variants of a given parent icon (hard delete).
 * The parent icon itself is preserved.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param parentId - UUID of the parent icon
 */
export async function deleteVariants(
  io: IoAdapter,
  projectPath: string,
  parentId: string
): Promise<DeleteVariantsResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const parent = db.getIcon(parentId);
    if (!parent) {
      throw new Error(`Icon not found: ${parentId}`);
    }

    const deleted = db.deleteVariants(parentId);
    await saveProject(io, resolvedPath, db);

    return {
      parentId,
      parentName: parent.iconName as string,
      deleted,
    };
  } finally {
    db.close();
  }
}
