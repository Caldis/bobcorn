/**
 * Bobcorn CLI entry point.
 *
 * Built with commander.js. All commands use singular nouns:
 * project, icon, group, variant, favorite (not plural).
 * Export has subcommands: export font, export icon, export svg.
 *
 * `project inspect` is the first real command (validates file exists, returns JSON).
 * All other commands print "Not yet implemented" until core migration is complete.
 */
import { Command } from 'commander';
import { nodeIo } from './io-node';
import { jsonOutput, jsonError, printResult, type CliMeta } from './output';
import { install, uninstall } from './install';
import {
  createProject as coreCreateProject,
  inspectProject as coreInspectProject,
} from '../core/operations/project';
import {
  listIcons as coreListIcons,
  importIcons as coreImportIcons,
  deleteIcons as coreDeleteIcons,
  renameIcon as coreRenameIcon,
  moveIcons as coreMoveIcons,
  getIconContent as coreGetIconContent,
} from '../core/operations/icon';
import {
  listGroups as coreListGroups,
  addGroup as coreAddGroup,
  renameGroup as coreRenameGroup,
  deleteGroup as coreDeleteGroup,
} from '../core/operations/group';

// Read version from package.json at build time (tsup bundles it)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: VERSION } = require('../../package.json');

function stubAction(commandName: string) {
  return () => {
    console.error('Not yet implemented \u2014 awaiting core migration');
    process.exit(1);
  };
}

function makeMeta(command: string, projectPath: string, start: number): CliMeta {
  return {
    command,
    projectPath,
    duration_ms: Date.now() - start,
    version: VERSION,
  };
}

const program = new Command()
  .name('bobcorn')
  .description('Icon font manager and generator CLI \u2014 AI-agent friendly')
  .version(VERSION)
  .option('--json', 'Structured JSON output');

// ---------------------------------------------------------------------------
// project
// ---------------------------------------------------------------------------
const project = program
  .command('project')
  .description('Manage .icp project files (create, inspect, configure)');

project
  .command('inspect <icp>')
  .description(
    'Show project metadata: name, prefix, icon/group counts, and per-group breakdown. Use --json for structured output.'
  )
  .action(async (icpPath: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('project inspect', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const info = await coreInspectProject(nodeIo, resolvedPath);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(info, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Project: ${resolvedPath}`);
        console.log(`Name:    ${info.name}`);
        console.log(`Prefix:  ${info.prefix}`);
        console.log(`Icons:   ${info.iconCount}`);
        console.log(`Groups:  ${info.groupCount}`);
        if (info.groups.length > 0) {
          console.log('');
          // Table header
          const nameWidth = Math.max(4, ...info.groups.map((g) => g.name.length));
          console.log(`  ${'Name'.padEnd(nameWidth)}  Icons`);
          console.log(`  ${''.padEnd(nameWidth, '-')}  -----`);
          for (const g of info.groups) {
            console.log(`  ${g.name.padEnd(nameWidth)}  ${g.count}`);
          }
        }
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const result = jsonError(err.message, 'FILE_IO_ERROR', meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

project
  .command('create <path>')
  .description(
    'Create a new empty .icp project file. Use --name to set the font family name (default: "iconfont").'
  )
  .option('--name <name>', 'Project / font prefix name', 'iconfont')
  .action(async (icpPath: string, opts: { name: string }) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('project create', icpPath, start);
    try {
      const { projectPath } = await coreCreateProject(nodeIo, icpPath, opts.name);
      meta.duration_ms = Date.now() - start;
      meta.projectPath = projectPath;
      const result = jsonOutput({ projectPath }, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Created project: ${projectPath}`);
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const result = jsonError(err.message, 'FILE_IO_ERROR', meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

project
  .command('set-name <icp> <name>')
  .description('Set project name')
  .action(stubAction('project set-name'));

project
  .command('set-prefix <icp> <prefix>')
  .description('Set project font prefix')
  .action(stubAction('project set-prefix'));

// ---------------------------------------------------------------------------
// icon
// ---------------------------------------------------------------------------
const icon = program
  .command('icon')
  .description(
    'Manage icons: import SVGs, list, rename, move, copy, delete, set unicode, export. All icon references use UUID (use "icon list --json" to discover IDs).'
  );

icon
  .command('list <icp>')
  .description(
    'List all icons with ID, name, unicode code, and group. Filter by group name with --group. Returns JSON array with --json.'
  )
  .option('--group <name>', 'Filter by group name (exact match)')
  .action(async (icpPath: string, opts: { group?: string }) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('icon list', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const icons = await coreListIcons(nodeIo, resolvedPath, {
        group: opts.group,
      });
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(icons, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        if (icons.length === 0) {
          console.log('No icons found.');
        } else {
          // Table output
          const idWidth = Math.max(2, ...icons.map((i) => i.id.length));
          const nameWidth = Math.max(4, ...icons.map((i) => i.iconName.length));
          const codeWidth = Math.max(4, ...icons.map((i) => (i.iconCode || '').length));
          const groupWidth = Math.max(5, ...icons.map((i) => i.iconGroup.length));
          console.log(
            `  ${'ID'.padEnd(idWidth)}  ${'Name'.padEnd(nameWidth)}  ${'Code'.padEnd(codeWidth)}  ${'Group'.padEnd(groupWidth)}`
          );
          console.log(
            `  ${''.padEnd(idWidth, '-')}  ${''.padEnd(nameWidth, '-')}  ${''.padEnd(codeWidth, '-')}  ${''.padEnd(groupWidth, '-')}`
          );
          for (const icon of icons) {
            console.log(
              `  ${icon.id.padEnd(idWidth)}  ${icon.iconName.padEnd(nameWidth)}  ${(icon.iconCode || '').padEnd(codeWidth)}  ${icon.iconGroup.padEnd(groupWidth)}`
            );
          }
          console.log(`\n${icons.length} icon(s) total`);
        }
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const result = jsonError(err.message, 'FILE_IO_ERROR', meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

icon
  .command('import <icp> <svgs...>')
  .description(
    'Import SVG files into a project. Each SVG is sanitized (scripts and event handlers removed), assigned a UUID and the next available PUA unicode code point (E000-F8FF), and inserted into the iconData table. Icons go to "uncategorized" by default. Use --group to specify a target group by name. The project file is saved after import.'
  )
  .option('--group <name>', 'Target group name (exact match)')
  .action(async (icpPath: string, svgs: string[], opts: { group?: string }) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('icon import', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      // Verify all SVG files exist
      for (const svg of svgs) {
        const resolvedSvg = nodeIo.resolve(svg);
        if (!(await nodeIo.exists(resolvedSvg))) {
          meta.duration_ms = Date.now() - start;
          const result = jsonError(`SVG file not found: ${svg}`, 'FILE_NOT_FOUND', meta);
          printResult(result, jsonMode);
          process.exit(2);
        }
      }
      const importResult = await coreImportIcons(nodeIo, resolvedPath, svgs, {
        group: opts.group,
      });
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(importResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Imported ${importResult.imported} icon(s)`);
        for (const icon of importResult.icons) {
          console.log(`  ${icon.name} (${icon.code}) -> ${icon.id}`);
        }
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const result = jsonError(err.message, 'IMPORT_ERROR', meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

icon
  .command('rename <icp> <id> <newName>')
  .description(
    'Rename an icon by its UUID. The icon ID can be discovered via "icon list --json". Updates the iconName field in the database and saves the project.'
  )
  .action(async (icpPath: string, id: string, newName: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('icon rename', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const renameResult = await coreRenameIcon(nodeIo, resolvedPath, id, newName);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(renameResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Renamed: "${renameResult.oldName}" -> "${renameResult.newName}"`);
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const code = err.message.includes('not found') ? 'ICON_NOT_FOUND' : 'FILE_IO_ERROR';
      const result = jsonError(err.message, code, meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

icon
  .command('move <icp> <ids...>')
  .option('--to <group>', 'Target group name (exact match, required)')
  .description(
    'Move one or more icons to a different group by UUID. Pass multiple UUIDs for batch move. Variant icons follow their parent icon automatically. The --to flag specifies the target group name (exact match). The project is saved after the move.'
  )
  .action(async (icpPath: string, ids: string[], opts: { to?: string }) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('icon move', icpPath, start);
    try {
      if (!opts.to) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError('--to <group> is required', 'MISSING_OPTION', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const moveResult = await coreMoveIcons(nodeIo, resolvedPath, ids, opts.to);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(moveResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Moved ${moveResult.moved} icon(s) to "${moveResult.targetGroup}"`);
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const code = err.message.includes('not found') ? 'GROUP_NOT_FOUND' : 'FILE_IO_ERROR';
      const result = jsonError(err.message, code, meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

icon
  .command('copy <icp> <ids...>')
  .option('--to <group>', 'Target group name (exact match)')
  .description(
    'Copy one or more icons to a different group. Creates independent copies (not linked).'
  )
  .action(stubAction('icon copy'));

icon
  .command('delete <icp> <ids...>')
  .description(
    'Soft-delete one or more icons by UUID. Icons are moved to the internal "resource-deleted" group (not permanently removed). Variant icons are cascade-deleted (hard delete) when their parent is deleted. The project is saved after deletion.'
  )
  .action(async (icpPath: string, ids: string[]) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('icon delete', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const deleteResult = await coreDeleteIcons(nodeIo, resolvedPath, ids);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(deleteResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Deleted ${deleteResult.deleted} icon(s)`);
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const result = jsonError(err.message, 'FILE_IO_ERROR', meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

icon
  .command('set-code <icp> <id> <code>')
  .description(
    'Set icon Unicode code point (hex, e.g. "E001"). Used for font generation glyph mapping.'
  )
  .action(stubAction('icon set-code'));

icon
  .command('replace <icp> <id> <svg>')
  .description("Replace an icon's SVG content with a new SVG file. Clears any generated variants.")
  .action(stubAction('icon replace'));

icon
  .command('export-svg <icp> <ids...>')
  .option('--out <dir>', 'Output directory (default: current directory)')
  .description('Export one or more icons as individual SVG files. Files are named by icon name.')
  .action(stubAction('icon export-svg'));

icon
  .command('set-favorite <icp> <id>')
  .option('--off', 'Remove from favorites')
  .description('Mark or unmark an icon as favorite. Use --off to remove.')
  .action(stubAction('icon set-favorite'));

icon
  .command('set-color <icp> <id> <color>')
  .description(
    'Set icon display color (hex, e.g. "#FF5733"). Affects preview only, not SVG content.'
  )
  .action(stubAction('icon set-color'));

icon
  .command('get-content <icp> <id>')
  .description(
    'Output the raw SVG content of an icon to stdout. In human mode, outputs just the raw SVG string (ideal for piping to files or other tools). In --json mode, the SVG content is wrapped in the standard JSON envelope under data.content.'
  )
  .action(async (icpPath: string, id: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('icon get-content', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const content = await coreGetIconContent(nodeIo, resolvedPath, id);
      meta.duration_ms = Date.now() - start;
      if (jsonMode) {
        const result = jsonOutput({ content }, meta);
        printResult(result, jsonMode);
      } else {
        // Raw SVG to stdout — no JSON envelope, no trailing newline formatting
        process.stdout.write(content);
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const code = err.message.includes('not found') ? 'ICON_NOT_FOUND' : 'FILE_IO_ERROR';
      const result = jsonError(err.message, code, meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

// ---------------------------------------------------------------------------
// group
// ---------------------------------------------------------------------------
const group = program
  .command('group')
  .description(
    'Manage icon groups: list, add, rename, delete, reorder. Groups organize icons into categories.'
  );

group
  .command('list <icp>')
  .description('List all groups with name and sort order. Returns JSON array with --json.')
  .action(async (icpPath: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('group list', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const groups = await coreListGroups(nodeIo, resolvedPath);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(groups, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        if (groups.length === 0) {
          console.log('No groups found.');
        } else {
          const nameWidth = Math.max(4, ...groups.map((g) => g.groupName.length));
          const orderWidth = Math.max(5, ...groups.map((g) => String(g.groupOrder).length));
          console.log(`  ${'Name'.padEnd(nameWidth)}  ${'Order'.padEnd(orderWidth)}`);
          console.log(`  ${''.padEnd(nameWidth, '-')}  ${''.padEnd(orderWidth, '-')}`);
          for (const g of groups) {
            console.log(
              `  ${g.groupName.padEnd(nameWidth)}  ${String(g.groupOrder).padEnd(orderWidth)}`
            );
          }
          console.log(`\n${groups.length} group(s) total`);
        }
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const result = jsonError(err.message, 'FILE_IO_ERROR', meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

group
  .command('add <icp> <name>')
  .description(
    'Create a new empty group with the given name. Generates a UUID for the group, assigns the next groupOrder value (max + 1), and saves the project. Fails if a group with the same name already exists.'
  )
  .action(async (icpPath: string, name: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('group add', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const addResult = await coreAddGroup(nodeIo, resolvedPath, name);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(addResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Created group: "${addResult.groupName}" (order: ${addResult.groupOrder})`);
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const code = err.message.includes('already exists') ? 'GROUP_EXISTS' : 'FILE_IO_ERROR';
      const result = jsonError(err.message, code, meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

group
  .command('rename <icp> <oldName> <newName>')
  .description(
    'Rename an existing group by its current name. Icons in the group are preserved — only the group name changes. The project is saved after renaming. Fails if the old group name is not found.'
  )
  .action(async (icpPath: string, oldName: string, newName: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('group rename', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const renameResult = await coreRenameGroup(nodeIo, resolvedPath, oldName, newName);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(renameResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Renamed group: "${renameResult.oldName}" -> "${renameResult.newName}"`);
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const code = err.message.includes('not found') ? 'GROUP_NOT_FOUND' : 'FILE_IO_ERROR';
      const result = jsonError(err.message, code, meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

group
  .command('delete <icp> <name>')
  .description(
    'Delete a group by name. All icons in the group are moved to the "uncategorized" virtual group (resource-uncategorized). The group record is then removed. The project is saved after deletion. Fails if the group name is not found.'
  )
  .action(async (icpPath: string, name: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('group delete', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const deleteResult = await coreDeleteGroup(nodeIo, resolvedPath, name);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(deleteResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Deleted group: "${deleteResult.name}"`);
        if (deleteResult.iconsMovedToUncategorized > 0) {
          console.log(`  ${deleteResult.iconsMovedToUncategorized} icon(s) moved to uncategorized`);
        }
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const code = err.message.includes('not found') ? 'GROUP_NOT_FOUND' : 'FILE_IO_ERROR';
      const result = jsonError(err.message, code, meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

group
  .command('reorder <icp> <names...>')
  .description('Set group display order. Pass all group names in desired order.')
  .action(stubAction('group reorder'));

group
  .command('set-description <icp> <name> <description>')
  .description('Set a text description for a group (shown in GUI sidebar).')
  .action(stubAction('group set-description'));

group
  .command('move-icons <icp> <targetGroup> <ids...>')
  .description('Move icons by UUID into the target group. Equivalent to "icon move --to <group>".')
  .action(stubAction('group move-icons'));

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------
const exp = program
  .command('export')
  .description(
    'Export fonts (iconfont) or icon images (PNG/JPG/WebP/PDF/ICO). Two modes: "export font" for font files, "export icon" for raster/vector images.'
  );

exp
  .command('font <icp>')
  .option('--out <dir>', 'Output directory (default: current directory)')
  .option('--formats <formats>', 'Comma-separated: svg,ttf,woff,woff2,eot (default: all)')
  .option('--font-name <name>', 'Override font family name')
  .option('--prefix <prefix>', 'CSS class prefix')
  .option('--css', 'Generate CSS @font-face file')
  .option('--preview', 'Generate HTML preview page')
  .description(
    'Generate iconfont files from all icons. Supports SVG, TTF, WOFF, WOFF2, EOT. Optionally generates CSS and HTML preview.'
  )
  .action(stubAction('export font'));

exp
  .command('icon <icp> <ids...>')
  .option('--out <dir>', 'Output directory (default: current directory)')
  .option('--preset <name>', 'Platform preset: ios, android, rn, web, favicon')
  .option('--format <format>', 'Output format: svg, png, jpg, webp, pdf, ico (default: png)')
  .option('--size <size>', 'Size: "2x" (scale) or "48px" (pixel)')
  .option('--quality <n>', 'JPG/WebP quality 1-100 (default: 92)')
  .option('--bg-color <hex>', 'JPG background color (default: #FFFFFF)')
  .option('--ico-merge', 'Merge multiple ICO sizes into single .ico file')
  .option('--rows <spec>', 'Multi-row export: "2x:png,48px:jpg,3x:webp"')
  .description(
    'Export icons as image files. Use --preset for platform-specific sizes (iOS @1x-3x, Android mdpi-xxxhdpi, etc.) or --rows for custom multi-size export.'
  )
  .action(stubAction('export icon'));

exp
  .command('svg <icp>')
  .option('--out <dir>', 'Output directory (default: current directory)')
  .option('--group <name>', 'Export only icons from this group')
  .description('Export all icons as individual SVG files. Files are named by icon name.')
  .action(stubAction('export svg'));

// ---------------------------------------------------------------------------
// variant
// ---------------------------------------------------------------------------
const variant = program
  .command('variant')
  .description(
    'Manage icon weight/scale variants (SF Symbols style). Generate multiple weights (thin→black) and scales (sm/md/lg) from a base icon.'
  );

variant
  .command('list <icp> <id>')
  .description('List all generated variants of an icon, showing weight and scale parameters.')
  .action(stubAction('variant list'));

variant
  .command('generate <icp> <id>')
  .option('--weights <list>', 'Weight levels 1-9, comma-separated (default: all)')
  .option('--scales <list>', 'Scale levels: sm,md,lg (default: all)')
  .description('Generate weight/scale variants for an icon using feMorphology SVG filters.')
  .action(stubAction('variant generate'));

variant
  .command('delete <icp> <id>')
  .description('Delete all generated variants of an icon. The base icon is preserved.')
  .action(stubAction('variant delete'));

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------
program
  .command('search <icp> <query>')
  .option('--group <name>', 'Search within a specific group')
  .option('--limit <n>', 'Maximum results (default: 50)')
  .description(
    'Search icons by name substring. Returns matching icons with ID, name, code, and group.'
  )
  .action(stubAction('search'));

// ---------------------------------------------------------------------------
// favorite
// ---------------------------------------------------------------------------
const favorite = program
  .command('favorite')
  .description('Manage favorited icons. Favorites are bookmarked icons for quick access.');

favorite
  .command('list <icp>')
  .description('List all icons marked as favorite.')
  .action(stubAction('favorite list'));

// ---------------------------------------------------------------------------
// install / uninstall
// ---------------------------------------------------------------------------
program
  .command('install')
  .description('Install bobcorn CLI to system PATH')
  .action(() => {
    const result = install();
    if (program.opts().json) {
      process.stdout.write(JSON.stringify({ ok: result.success, data: result }) + '\n');
    } else {
      console.log(result.message);
      if (result.needsRestart) {
        console.log('Note: Open a new terminal to use the `bobcorn` command.');
      }
    }
  });

program
  .command('uninstall')
  .description('Remove bobcorn CLI from system PATH')
  .action(() => {
    const result = uninstall();
    if (program.opts().json) {
      process.stdout.write(JSON.stringify({ ok: result.success, data: result }) + '\n');
    } else {
      console.log(result.message);
    }
  });

// ---------------------------------------------------------------------------
// parse and execute
// ---------------------------------------------------------------------------
program.parse();
