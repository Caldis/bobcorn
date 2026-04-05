/**
 * Core project operations — create and inspect .icp project files.
 *
 * Environment-agnostic: no browser globals or build-time env vars.
 * All file I/O goes through IoAdapter.
 */
import type { IoAdapter } from '../io';
import { openProject, createEmptyProject, saveProject } from '../database';

export interface InspectResult {
  name: string;
  prefix: string;
  iconCount: number;
  groupCount: number;
  groups: { name: string; count: number }[];
}

/**
 * Create a new empty .icp project file.
 *
 * @param io - File system adapter
 * @param outputPath - Path where the .icp file will be written
 * @param projectName - Optional font prefix / project name (defaults to 'iconfont')
 * @returns The resolved path of the created project
 */
export async function createProject(
  io: IoAdapter,
  outputPath: string,
  projectName?: string
): Promise<{ projectPath: string }> {
  const resolvedPath = io.resolve(outputPath);

  const db = await createEmptyProject(projectName);
  try {
    await saveProject(io, resolvedPath, db);
  } finally {
    db.close();
  }

  return { projectPath: resolvedPath };
}

/**
 * Inspect an existing .icp project file.
 *
 * Returns metadata: project name (used as font prefix), icon count,
 * group count, and a list of groups with their icon counts.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 */
export async function inspectProject(io: IoAdapter, projectPath: string): Promise<InspectResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const attrs = db.getProjectAttributes();
    const groups = db.getGroupList();
    const iconCount = db.getIconCount();

    const groupsWithCounts = groups.map((g) => ({
      name: g.groupName,
      count: db.getIconCountForGroup(g.id),
    }));

    return {
      name: attrs.projectName,
      prefix: attrs.projectName, // projectName IS the prefix in Bobcorn
      iconCount,
      groupCount: groups.length,
      groups: groupsWithCounts,
    };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Set Name
// ---------------------------------------------------------------------------

export interface SetNameResult {
  oldName: string;
  newName: string;
}

/**
 * Set the project name (which is also the font prefix in Bobcorn).
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param name - New project name
 */
export async function setProjectName(
  io: IoAdapter,
  projectPath: string,
  name: string
): Promise<SetNameResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const oldName = db.getProjectName();
    db.setProjectName(name);
    await saveProject(io, resolvedPath, db);

    return { oldName, newName: name };
  } finally {
    db.close();
  }
}
