/**
 * Core group operations — list groups in a project.
 *
 * Environment-agnostic: no browser globals or build-time env vars.
 * All file I/O goes through IoAdapter.
 */
import type { IoAdapter } from '../io';
import type { GroupData } from '../types';
import { openProject } from '../database';

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
