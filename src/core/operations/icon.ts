/**
 * Core icon operations — list icons in a project.
 *
 * Environment-agnostic: no browser globals or build-time env vars.
 * All file I/O goes through IoAdapter.
 */
import type { IoAdapter } from '../io';
import type { IconData } from '../types';
import { openProject } from '../database';

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
