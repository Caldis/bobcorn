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
// Save As (copy project to new path)
// ---------------------------------------------------------------------------

export interface SaveAsResult {
  sourcePath: string;
  outputPath: string;
  iconCount: number;
  groupCount: number;
}

/**
 * Copy a project to a new .icp file path.
 * Opens the source project, exports its database binary, and writes to the output path.
 * Useful for backups or creating a copy before major changes.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the source .icp file
 * @param outputPath - Path where the copy will be written
 */
export async function saveAsProject(
  io: IoAdapter,
  projectPath: string,
  outputPath: string
): Promise<SaveAsResult> {
  const resolvedSource = io.resolve(projectPath);
  const resolvedOutput = io.resolve(outputPath);

  const db = await openProject(io, resolvedSource);

  try {
    const iconCount = db.getIconCount();
    const groupCount = db.getGroupCount();

    await saveProject(io, resolvedOutput, db);

    return {
      sourcePath: resolvedSource,
      outputPath: resolvedOutput,
      iconCount,
      groupCount,
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
