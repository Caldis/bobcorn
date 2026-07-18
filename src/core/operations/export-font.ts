/**
 * Core operation: export font — thin consumer over @core/font.
 *
 * Opens a .icp project, assembles the icon list, delegates all generation to
 * generateFontArtifacts (src/core/font), writes the artifacts through the
 * IoAdapter and returns the file stats. All font/CSS/JS generation logic
 * lives in src/core/font — do not re-grow it here.
 */
import type { IoAdapter } from '../io';
import { openProject } from '../database';
import type { ProjectDb } from '../database';
import { generateFontArtifacts } from '../font';
import type { FontFormat, FontIconInput } from '../font';
import { flattenSvgUseRefs } from '../svg/transforms';

export { flattenSvgUseRefs };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExportFontOptions {
  outputDir: string;
  fontName?: string; // override project name
  prefix?: string; // CSS class prefix (defaults to fontName)
  formats?: string[]; // which formats: ['svg','ttf','woff2','woff','eot'] (default: all)
  css?: boolean; // generate CSS @font-face (default: true)
  js?: boolean; // generate JS symbol sprite (default: true)
  preview?: boolean; // generate HTML demo (not available in CLI)
  groups?: string[]; // filter by group names
}

export interface ExportFontFileInfo {
  name: string;
  size: number;
  format: string;
}

export interface ExportFontResult {
  files: ExportFontFileInfo[];
  fontName: string;
  iconCount: number;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

const ALL_FONT_FORMATS: FontFormat[] = ['svg', 'ttf', 'woff2', 'woff', 'eot'];

export async function exportFont(
  io: IoAdapter,
  projectPath: string,
  opts: ExportFontOptions
): Promise<ExportFontResult> {
  const start = Date.now();
  const resolvedPath = io.resolve(projectPath);
  const resolvedOut = io.resolve(opts.outputDir);
  const db = await openProject(io, resolvedPath);

  try {
    // Determine font name
    const fontName = opts.fontName || db.getProjectName();

    // Get icons with content
    const allIcons = getFilteredIcons(db, opts.groups);

    if (allIcons.length === 0) {
      throw new Error('No icons to export');
    }

    // Ensure output dir exists
    if (!(await io.exists(resolvedOut))) {
      await io.mkdir(resolvedOut, { recursive: true });
    }

    // Requested artifact set: font formats + css/js companions (default on)
    const formats = new Set<FontFormat>(
      (opts.formats as FontFormat[] | undefined) ?? ALL_FONT_FORMATS
    );
    if (opts.css !== false) formats.add('css');
    if (opts.js !== false) formats.add('js');

    // Prepare icon data for the generator
    const fontIcons: FontIconInput[] = allIcons.map((icon) => ({
      iconName: icon.iconName,
      iconCode: icon.iconCode,
      iconContent: icon.iconContent,
    }));

    // Generate everything in memory (no yieldEvery — pure-throughput mode)
    const artifacts = await generateFontArtifacts(fontIcons, { fontName, formats });

    // Write artifacts in canonical order (Map preserves insertion order)
    const files: ExportFontFileInfo[] = [];
    for (const [name, content] of artifacts) {
      const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
      await io.writeFile(io.join(resolvedOut, name), data);
      files.push({ name, size: data.length, format: name.slice(name.lastIndexOf('.') + 1) });
    }

    return {
      files,
      fontName,
      iconCount: fontIcons.length,
      duration_ms: Date.now() - start,
    };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Helper: filter icons by group names
// ---------------------------------------------------------------------------

function getFilteredIcons(
  db: ProjectDb,
  groupNames?: string[]
): Array<{ iconName: string; iconCode: string; iconContent: string; iconGroup: string }> {
  if (!groupNames || groupNames.length === 0) {
    return db.getIconListWithContent() as any[];
  }

  // Resolve group names to IDs
  const groups = db.getGroupList();
  const groupIds = new Set<string>();
  for (const name of groupNames) {
    const group = groups.find((g) => g.groupName === name);
    if (group) {
      groupIds.add(group.id);
    }
  }

  if (groupIds.size === 0) {
    return [];
  }

  const allIcons = db.getIconListWithContent() as any[];
  return allIcons.filter((icon) => groupIds.has(icon.iconGroup));
}
