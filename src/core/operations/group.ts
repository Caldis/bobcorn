/**
 * Core group operations — list, add, rename, delete groups.
 *
 * Environment-agnostic: no browser globals or build-time env vars.
 * All file I/O goes through IoAdapter.
 */
import type { IoAdapter } from '../io';
import type { GroupData } from '../types';
import { openProject, saveProject } from '../database';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List all groups in a project with their icon counts.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @returns Array of group data records
 */
export async function listGroups(io: IoAdapter, projectPath: string): Promise<GroupData[]> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    return db.getGroupList();
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

export interface AddGroupResult {
  id: string;
  groupName: string;
  groupOrder: number;
}

/**
 * Create a new group in the project.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param name - Group name
 */
export async function addGroup(
  io: IoAdapter,
  projectPath: string,
  name: string
): Promise<AddGroupResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    // Check for duplicate group name
    const existing = db.findGroupByName(name);
    if (existing) {
      throw new Error(`Group already exists: ${name}`);
    }

    const id = crypto.randomUUID();
    const result = db.addGroup(id, name);
    await saveProject(io, resolvedPath, db);

    return result;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

export interface RenameGroupResult {
  id: string;
  oldName: string;
  newName: string;
}

/**
 * Rename an existing group.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param oldName - Current group name
 * @param newName - New group name
 */
export async function renameGroup(
  io: IoAdapter,
  projectPath: string,
  oldName: string,
  newName: string
): Promise<RenameGroupResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const group = db.findGroupByName(oldName);
    if (!group) {
      throw new Error(`Group not found: ${oldName}`);
    }

    const id = group.id as string;
    db.setGroupName(id, newName);
    await saveProject(io, resolvedPath, db);

    return { id, oldName, newName };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export interface DeleteGroupResult {
  id: string;
  name: string;
  iconsMovedToUncategorized: number;
}

/**
 * Delete a group. Icons in the group are moved to "uncategorized".
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param name - Group name to delete
 */
export async function deleteGroup(
  io: IoAdapter,
  projectPath: string,
  name: string
): Promise<DeleteGroupResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const group = db.findGroupByName(name);
    if (!group) {
      throw new Error(`Group not found: ${name}`);
    }

    const id = group.id as string;
    const iconCount = db.getIconCountForGroup(id);

    db.deleteGroup(id);
    await saveProject(io, resolvedPath, db);

    return { id, name, iconsMovedToUncategorized: iconCount };
  } finally {
    db.close();
  }
}
