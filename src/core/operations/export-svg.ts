/**
 * Core batch SVG export — export all icons as individual .svg files.
 *
 * Environment-agnostic: all file I/O goes through IoAdapter.
 */
import type { IoAdapter } from '../io';
import { openProject } from '../database';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExportBatchSvgOptions {
  outputDir: string;
  group?: string; // filter by group name
}

export interface ExportBatchSvgResult {
  exported: number;
  files: string[];
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Export all icons (or a group) as individual SVG files.
 * Handles duplicate filenames by appending -2, -3, etc.
 */
export async function exportBatchSvg(
  io: IoAdapter,
  projectPath: string,
  opts: ExportBatchSvgOptions
): Promise<ExportBatchSvgResult> {
  const resolvedPath = io.resolve(projectPath);
  const resolvedOut = io.resolve(opts.outputDir);
  const db = await openProject(io, resolvedPath);

  try {
    // Get icons with content, optionally filtered by group
    let icons: Array<{ iconName: string; iconContent: string; iconGroup: string }>;

    if (opts.group) {
      const groups = db.getGroupList();
      const targetGroup = groups.find((g) => g.groupName === opts.group);
      if (!targetGroup) {
        throw new Error(`Group not found: ${opts.group}`);
      }
      icons = db.getIconListFromGroupWithContent(targetGroup.id) as any[];
    } else {
      icons = db.getIconListWithContent() as any[];
    }

    if (icons.length === 0) {
      return { exported: 0, files: [] };
    }

    // Ensure output dir exists
    if (!(await io.exists(resolvedOut))) {
      await io.mkdir(resolvedOut, { recursive: true });
    }

    // Handle duplicate filenames
    const nameCount: Record<string, number> = {};
    const files: string[] = [];

    for (const icon of icons) {
      let baseName = icon.iconName;
      if (nameCount[baseName] != null) {
        nameCount[baseName]++;
        baseName = `${icon.iconName}-${nameCount[baseName]}`;
      } else {
        nameCount[icon.iconName] = 1;
      }

      const fileName = `${baseName}.svg`;
      const filePath = io.join(resolvedOut, fileName);
      const data = new TextEncoder().encode(icon.iconContent);
      await io.writeFile(filePath, data);
      files.push(fileName);
    }

    return { exported: files.length, files };
  } finally {
    db.close();
  }
}
