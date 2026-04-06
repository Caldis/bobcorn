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
import { resolveProject, ProjectResolutionError } from './resolve-project';
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
  copyIcons as coreCopyIcons,
  setIconCode as coreSetIconCode,
  replaceIcon as coreReplaceIcon,
  exportIconSvg as coreExportIconSvg,
  setIconFavorite as coreSetIconFavorite,
  searchIcons as coreSearchIcons,
  listFavorites as coreListFavorites,
  setIconColor as coreSetIconColor,
} from '../core/operations/icon';
import {
  listVariants as coreListVariants,
  deleteVariants as coreDeleteVariants,
} from '../core/operations/variant';
import {
  listGroups as coreListGroups,
  addGroup as coreAddGroup,
  renameGroup as coreRenameGroup,
  deleteGroup as coreDeleteGroup,
  reorderGroups as coreReorderGroups,
  setGroupDescription as coreSetGroupDescription,
} from '../core/operations/group';
import {
  setProjectName as coreSetProjectName,
  saveAsProject as coreSaveAsProject,
} from '../core/operations/project';
import { exportFont as coreExportFont } from '../core/operations/export-font';
import { exportBatchSvg as coreExportBatchSvg } from '../core/operations/export-svg';

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
  .description(
    'Icon font manager CLI \u2014 AI-agent friendly. Project file (.icp) is auto-detected from current directory, or specify with --project flag.'
  )
  .version(VERSION)
  .option('--json', 'Structured JSON output')
  .option(
    '--project <path>',
    'Path to .icp project file (default: auto-detect in current directory)'
  );

/**
 * Resolve the project path using the priority chain, with unified error handling.
 * Also validates that the resolved file exists on disk.
 * If resolution or existence check fails, prints the error and exits with code 2.
 */
async function resolveProjectOrExit(
  explicit: string | undefined,
  start: number,
  jsonMode: boolean,
  meta: CliMeta
): Promise<string> {
  let resolved: string;
  try {
    resolved = resolveProject(explicit, program.opts().project);
  } catch (err: any) {
    meta.duration_ms = Date.now() - start;
    if (err instanceof ProjectResolutionError) {
      const result = jsonError(err.message, 'PROJECT_NOT_FOUND', meta);
      printResult(result, jsonMode);
    } else {
      const result = jsonError(err.message, 'FILE_IO_ERROR', meta);
      printResult(result, jsonMode);
    }
    process.exit(2);
  }

  if (!(await nodeIo.exists(resolved))) {
    meta.duration_ms = Date.now() - start;
    const display = explicit || program.opts().project || resolved;
    const result = jsonError(`File not found: ${display}`, 'FILE_NOT_FOUND', meta);
    printResult(result, jsonMode);
    process.exit(2);
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// project
// ---------------------------------------------------------------------------
const project = program
  .command('project')
  .description('Manage .icp project files (create, inspect, configure)');

project
  .command('inspect [icp]')
  .description(
    'Show project metadata: name, prefix, icon/group counts, and per-group breakdown. Use --json for structured output.'
  )
  .action(async (icpPath?: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('project inspect', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
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
  .command('set-name <nameOrIcp> [name]')
  .description(
    'Set project name (also sets the font prefix, since projectName IS the prefix in Bobcorn).'
  )
  .action(async (arg1: string, arg2?: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    // 2 args: set-name <icp> <name> (backward compat)
    // 1 arg:  set-name <name> (auto-discover project)
    const icpPath = arg2 !== undefined ? arg1 : undefined;
    const name = arg2 !== undefined ? arg2 : arg1;
    const meta = makeMeta('project set-name', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
      const setNameResult = await coreSetProjectName(nodeIo, resolvedPath, name);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(setNameResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Project name: "${setNameResult.oldName}" -> "${setNameResult.newName}"`);
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const result = jsonError(err.message, 'FILE_IO_ERROR', meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

project
  .command('set-prefix <prefixOrIcp> [prefix]')
  .description(
    'Set project font prefix (alias for set-name, since projectName IS the prefix in Bobcorn).'
  )
  .action(async (arg1: string, arg2?: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const icpPath = arg2 !== undefined ? arg1 : undefined;
    const prefix = arg2 !== undefined ? arg2 : arg1;
    const meta = makeMeta('project set-prefix', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
      const setNameResult = await coreSetProjectName(nodeIo, resolvedPath, prefix);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(setNameResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Font prefix: "${setNameResult.oldName}" -> "${setNameResult.newName}"`);
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const result = jsonError(err.message, 'FILE_IO_ERROR', meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

project
  .command('save-as [icp] <output>')
  .description(
    'Copy the project to a new .icp file. Useful for backups or creating a copy before major changes. The source project is unchanged.'
  )
  .action(async (icpOrOutput: string, maybeOutput?: string) => {
    // Commander parses [icp] as optional. If only 1 arg, it's <output>.
    const hasExplicitIcp = maybeOutput !== undefined;
    const icpPath = hasExplicitIcp ? icpOrOutput : undefined;
    const outputPath = hasExplicitIcp ? maybeOutput! : icpOrOutput;

    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('project save-as', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
      const saveResult = await coreSaveAsProject(nodeIo, resolvedPath, outputPath);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(saveResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Saved copy to: ${saveResult.outputPath}`);
        console.log(`  Icons: ${saveResult.iconCount}, Groups: ${saveResult.groupCount}`);
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const result = jsonError(err.message, 'FILE_IO_ERROR', meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

// ---------------------------------------------------------------------------
// icon
// ---------------------------------------------------------------------------
const icon = program
  .command('icon')
  .description(
    'Manage icons: import SVGs, list, rename, move, copy, delete, set unicode, export. All icon references use UUID (use "icon list --json" to discover IDs).'
  );

icon
  .command('list [icp]')
  .description(
    'List all icons with ID, name, unicode code, and group. Filter by group name with --group. Returns JSON array with --json.'
  )
  .option('--group <name>', 'Filter by group name (exact match)')
  .action(async (icpPath: string | undefined, opts: { group?: string }) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('icon list', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
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
  .command('import <svgsOrIcp...>')
  .description(
    'Import SVG files into a project. Each SVG is sanitized (scripts and event handlers removed), assigned a UUID and the next available PUA unicode code point (E000-F8FF), and inserted into the iconData table. Icons go to "uncategorized" by default. Use --group to specify a target group by name. The project file is saved after import.'
  )
  .option('--group <name>', 'Target group name (exact match)')
  .action(async (args: string[], opts: { group?: string }) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    // If the first arg ends with .icp, treat it as the project path (backward compat)
    let icpPath: string | undefined;
    let svgs: string[];
    if (args[0]?.endsWith('.icp')) {
      icpPath = args[0];
      svgs = args.slice(1);
    } else {
      svgs = args;
    }
    const meta = makeMeta('icon import', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
      if (svgs.length === 0) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError('No SVG files specified', 'MISSING_ARGUMENT', meta);
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
  .command('rename <idOrIcp> <newNameOrId> [newName]')
  .description(
    'Rename an icon by its UUID. The icon ID can be discovered via "icon list --json". Updates the iconName field in the database and saves the project.'
  )
  .action(async (arg1: string, arg2: string, arg3?: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    // 3 args: rename <icp> <id> <newName> (backward compat)
    // 2 args: rename <id> <newName> (auto-discover)
    const icpPath = arg3 !== undefined ? arg1 : undefined;
    const id = arg3 !== undefined ? arg2 : arg1;
    const newName = arg3 !== undefined ? arg3 : arg2;
    const meta = makeMeta('icon rename', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
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
  .command('move <idsOrIcp...>')
  .option('--to <group>', 'Target group name (exact match, required)')
  .description(
    'Move one or more icons to a different group by UUID. Pass multiple UUIDs for batch move. Variant icons follow their parent icon automatically. The --to flag specifies the target group name (exact match). The project is saved after the move.'
  )
  .action(async (args: string[], opts: { to?: string }) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    let icpPath: string | undefined;
    let ids: string[];
    if (args[0]?.endsWith('.icp')) {
      icpPath = args[0];
      ids = args.slice(1);
    } else {
      ids = args;
    }
    const meta = makeMeta('icon move', icpPath ?? '', start);
    try {
      if (!opts.to) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError('--to <group> is required', 'MISSING_OPTION', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
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
  .command('copy <idsOrIcp...>')
  .option('--to <group>', 'Target group name (exact match, required)')
  .description(
    'Copy one or more icons to a different group. Creates independent copies with new UUIDs and unicode codes. Variants are NOT copied.'
  )
  .action(async (args: string[], opts: { to?: string }) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    let icpPath: string | undefined;
    let ids: string[];
    if (args[0]?.endsWith('.icp')) {
      icpPath = args[0];
      ids = args.slice(1);
    } else {
      ids = args;
    }
    const meta = makeMeta('icon copy', icpPath ?? '', start);
    try {
      if (!opts.to) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError('--to <group> is required', 'MISSING_OPTION', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
      const copyResult = await coreCopyIcons(nodeIo, resolvedPath, ids, opts.to);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(copyResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Copied ${copyResult.copied} icon(s) to "${copyResult.targetGroup}"`);
        for (const icon of copyResult.icons) {
          console.log(`  ${icon.name} (${icon.code}) -> ${icon.id}`);
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

icon
  .command('delete <idsOrIcp...>')
  .description(
    'Soft-delete one or more icons by UUID. Icons are moved to the internal "resource-deleted" group (not permanently removed). Variant icons are cascade-deleted (hard delete) when their parent is deleted. The project is saved after deletion.'
  )
  .action(async (args: string[]) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    let icpPath: string | undefined;
    let ids: string[];
    if (args[0]?.endsWith('.icp')) {
      icpPath = args[0];
      ids = args.slice(1);
    } else {
      ids = args;
    }
    const meta = makeMeta('icon delete', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
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
  .command('set-code <idOrIcp> <codeOrId> [code]')
  .description(
    'Set icon Unicode code point (hex, e.g. "E001"). Must be in PUA range E000-F8FF. Used for font generation glyph mapping.'
  )
  .action(async (arg1: string, arg2: string, arg3?: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const icpPath = arg3 !== undefined ? arg1 : undefined;
    const id = arg3 !== undefined ? arg2 : arg1;
    const code = arg3 !== undefined ? arg3 : arg2;
    const meta = makeMeta('icon set-code', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
      const setCodeResult = await coreSetIconCode(nodeIo, resolvedPath, id, code);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(setCodeResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Code: ${setCodeResult.oldCode} -> ${setCodeResult.newCode}`);
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      let errCode = 'FILE_IO_ERROR';
      if (err.message.includes('not found')) errCode = 'ICON_NOT_FOUND';
      else if (err.message.includes('Invalid hex') || err.message.includes('outside the PUA'))
        errCode = 'INVALID_CODE';
      const result = jsonError(err.message, errCode, meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

icon
  .command('replace <idOrIcp> <svgOrId> [svg]')
  .description("Replace an icon's SVG content with a new SVG file. Clears any generated variants.")
  .action(async (arg1: string, arg2: string, arg3?: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const icpPath = arg3 !== undefined ? arg1 : undefined;
    const id = arg3 !== undefined ? arg2 : arg1;
    const svgPath = arg3 !== undefined ? arg3 : arg2;
    const meta = makeMeta('icon replace', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
      const resolvedSvg = nodeIo.resolve(svgPath);
      if (!(await nodeIo.exists(resolvedSvg))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`SVG file not found: ${svgPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const replaceResult = await coreReplaceIcon(nodeIo, resolvedPath, id, svgPath);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(replaceResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(
          `Replaced SVG content for "${replaceResult.iconName}" (${replaceResult.newSize} bytes)`
        );
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
  .command('export-svg <idsOrIcp...>')
  .option('--out <dir>', 'Output directory (default: current directory)')
  .description('Export one or more icons as individual SVG files. Files are named by icon name.')
  .action(async (args: string[], opts: { out?: string }) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    let icpPath: string | undefined;
    let ids: string[];
    if (args[0]?.endsWith('.icp')) {
      icpPath = args[0];
      ids = args.slice(1);
    } else {
      ids = args;
    }
    const meta = makeMeta('icon export-svg', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
      const outDir = opts.out ?? '.';
      const exportResult = await coreExportIconSvg(nodeIo, resolvedPath, ids, outDir);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(exportResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Exported ${exportResult.exported} SVG file(s)`);
        for (const f of exportResult.files) {
          console.log(`  ${f.name}.svg -> ${f.path}`);
        }
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
  .command('set-favorite <idOrIcp> [id]')
  .option('--off', 'Remove from favorites')
  .description('Mark or unmark an icon as favorite. Use --off to remove.')
  .action(async (arg1: string, arg2: string | undefined, opts: { off?: boolean }) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const icpPath = arg2 !== undefined ? arg1 : undefined;
    const id = arg2 !== undefined ? arg2 : arg1;
    const meta = makeMeta('icon set-favorite', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
      const favorite = !opts.off;
      const favResult = await coreSetIconFavorite(nodeIo, resolvedPath, id, favorite);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(favResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(
          `${favResult.isFavorite ? 'Marked' : 'Unmarked'} "${favResult.iconName}" as favorite`
        );
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
  .command('set-color <idsOrIcp...>')
  .requiredOption('--from <color>', 'Color to replace (hex, e.g. "#000000", or named: "black")')
  .requiredOption('--to <color>', 'Replacement color (hex, e.g. "#FF5733")')
  .description(
    'Replace a fill/stroke color in one or more icons. Uses regex-based SVG color replacement (no DOM needed). For complex SVGs with CSS classes, the GUI may produce different results. Specify --from and --to colors.'
  )
  .action(async (args: string[], opts: { from: string; to: string }) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    let icpPath: string | undefined;
    let ids: string[];
    if (args[0]?.endsWith('.icp')) {
      icpPath = args[0];
      ids = args.slice(1);
    } else {
      ids = args;
    }
    const meta = makeMeta('icon set-color', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
      const colorResult = await coreSetIconColor(nodeIo, resolvedPath, ids, opts.from, opts.to);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(colorResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(
          `Updated ${colorResult.updated} icon(s): "${colorResult.oldColor}" -> "${colorResult.newColor}"`
        );
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
  .command('get-content <idOrIcp> [id]')
  .description(
    'Output the raw SVG content of an icon to stdout. In human mode, outputs just the raw SVG string (ideal for piping to files or other tools). In --json mode, the SVG content is wrapped in the standard JSON envelope under data.content.'
  )
  .action(async (arg1: string, arg2?: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const icpPath = arg2 !== undefined ? arg1 : undefined;
    const id = arg2 !== undefined ? arg2 : arg1;
    const meta = makeMeta('icon get-content', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
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
  .description(
    'Set group display order. Pass all group names in desired order. Groups not listed keep their existing order.'
  )
  .action(async (icpPath: string, names: string[]) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('group reorder', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const reorderResult = await coreReorderGroups(nodeIo, resolvedPath, names);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(reorderResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Reordered ${reorderResult.reordered} group(s)`);
        reorderResult.order.forEach((name, i) => {
          console.log(`  ${i}: ${name}`);
        });
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
  .command('set-description <icp> <name> <description>')
  .description('Set a text description for a group (shown in GUI sidebar).')
  .action(async (icpPath: string, name: string, description: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('group set-description', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const descResult = await coreSetGroupDescription(nodeIo, resolvedPath, name, description);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(descResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Set description for "${descResult.groupName}": "${descResult.description}"`);
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
  .command('move-icons <icp> <targetGroup> <ids...>')
  .description('Move icons by UUID into the target group. Equivalent to "icon move --to <group>".')
  .action(async (icpPath: string, targetGroup: string, ids: string[]) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('group move-icons', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const moveResult = await coreMoveIcons(nodeIo, resolvedPath, ids, targetGroup);
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
  .option('--no-css', 'Disable CSS @font-face generation')
  .option('--no-js', 'Disable JS symbol sprite generation')
  .option('--preview', 'Generate HTML preview page (not available in CLI)')
  .description(
    'Generate iconfont files from all icons. Supports SVG, TTF, WOFF, WOFF2, EOT. Also generates CSS @font-face and JS symbol sprite by default.'
  )
  .action(
    async (
      icpPath: string,
      opts: {
        out?: string;
        formats?: string;
        fontName?: string;
        prefix?: string;
        css: boolean;
        js: boolean;
        preview?: boolean;
      }
    ) => {
      const start = Date.now();
      const jsonMode = program.opts().json;
      const meta = makeMeta('export font', icpPath, start);
      try {
        if (opts.preview) {
          meta.duration_ms = Date.now() - start;
          const msg =
            'HTML preview generation is not available in CLI mode (requires DOM/Canvas). Use the GUI to generate preview pages.';
          const result = jsonError(msg, 'NOT_IMPLEMENTED', meta);
          printResult(result, jsonMode);
          if (!jsonMode) console.error(msg);
          process.exit(1);
        }

        const resolvedPath = nodeIo.resolve(icpPath);
        if (!(await nodeIo.exists(resolvedPath))) {
          meta.duration_ms = Date.now() - start;
          const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
          printResult(result, jsonMode);
          process.exit(2);
        }

        const outDir = opts.out ?? '.';
        const formats = opts.formats
          ? opts.formats.split(',').map((f) => f.trim().toLowerCase())
          : undefined;

        const exportResult = await coreExportFont(nodeIo, resolvedPath, {
          outputDir: outDir,
          fontName: opts.fontName ?? opts.prefix,
          prefix: opts.prefix,
          formats,
          css: opts.css,
          js: opts.js,
        });

        meta.duration_ms = Date.now() - start;
        const result = jsonOutput(exportResult, meta);
        printResult(result, jsonMode);
        if (!jsonMode) {
          console.log(
            `Exported ${exportResult.iconCount} icons as "${exportResult.fontName}" font`
          );
          for (const f of exportResult.files) {
            const sizeStr =
              f.size >= 1024 * 1024
                ? `${(f.size / (1024 * 1024)).toFixed(1)} MB`
                : f.size >= 1024
                  ? `${(f.size / 1024).toFixed(1)} KB`
                  : `${f.size} B`;
            console.log(`  ${f.name} (${sizeStr})`);
          }
          console.log(`\nDone in ${exportResult.duration_ms}ms`);
        }
      } catch (err: any) {
        meta.duration_ms = Date.now() - start;
        const code = err.message.includes('not found')
          ? 'FILE_NOT_FOUND'
          : err.message.includes('No icons')
            ? 'NO_ICONS'
            : 'EXPORT_ERROR';
        const result = jsonError(err.message, code, meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
    }
  );

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
  .action(async (icpPath: string, opts: { out?: string; group?: string }) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('export svg', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }

      const outDir = opts.out ?? '.';
      const exportResult = await coreExportBatchSvg(nodeIo, resolvedPath, {
        outputDir: outDir,
        group: opts.group,
      });

      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(exportResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Exported ${exportResult.exported} SVG file(s)`);
        if (exportResult.exported > 0 && exportResult.exported <= 20) {
          for (const f of exportResult.files) {
            console.log(`  ${f}`);
          }
        }
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const code = err.message.includes('not found')
        ? err.message.includes('Group')
          ? 'GROUP_NOT_FOUND'
          : 'FILE_NOT_FOUND'
        : 'EXPORT_ERROR';
      const result = jsonError(err.message, code, meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

// ---------------------------------------------------------------------------
// variant
// ---------------------------------------------------------------------------
const variant = program
  .command('variant')
  .description(
    'Manage icon weight/scale variants (SF Symbols style). Generate multiple weights (thin→black) and scales (sm/md/lg) from a base icon.'
  );

variant
  .command('list <idOrIcp> [id]')
  .description(
    'List all generated variants of a parent icon. Shows variant ID, name, weight/scale metadata. Returns empty array if no variants exist.'
  )
  .action(async (arg1: string, arg2?: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const icpPath = arg2 !== undefined ? arg1 : undefined;
    const id = arg2 !== undefined ? arg2 : arg1;
    const meta = makeMeta('variant list', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
      const listResult = await coreListVariants(nodeIo, resolvedPath, id);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(listResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Parent: ${listResult.parentName} (${listResult.parentId})`);
        if (listResult.variants.length === 0) {
          console.log('No variants.');
        } else {
          for (const v of listResult.variants) {
            let metaStr = '';
            if (v.variantMeta) {
              try {
                const parsed = JSON.parse(v.variantMeta);
                metaStr = ` [weight=${parsed.weight || '?'}, scale=${parsed.scale || '?'}]`;
              } catch {
                metaStr = '';
              }
            }
            console.log(`  ${v.id}  ${v.iconName}${metaStr}`);
          }
          console.log(`\n${listResult.variants.length} variant(s)`);
        }
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const code = err.message.includes('not found') ? 'ICON_NOT_FOUND' : 'FILE_IO_ERROR';
      const result = jsonError(err.message, code, meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

variant
  .command('generate <icp> <id>')
  .option('--weights <list>', 'Weight levels 1-9, comma-separated (default: all)')
  .option('--scales <list>', 'Scale levels: sm,md,lg (default: all)')
  .description(
    'Generate weight/scale variants for an icon using feMorphology SVG filters. ' +
      'NOT AVAILABLE in CLI headless mode — variant generation requires a Canvas/DOM rendering ' +
      'context (feMorphology filter + rasterize + retrace pipeline). Use the Bobcorn GUI instead.'
  )
  .action((_icpPath: string, _id: string) => {
    const jsonMode = program.opts().json;
    const meta = makeMeta('variant generate', _icpPath, Date.now());
    const msg =
      'variant generate is not available in CLI headless mode. ' +
      'The variant generation pipeline requires Canvas/DOM rendering context ' +
      '(feMorphology SVG filter → rasterize → retrace). ' +
      'Use the Bobcorn GUI to generate variants, or create variants manually ' +
      'and import them with "icon import".';
    if (jsonMode) {
      const result = jsonError(msg, 'NOT_AVAILABLE_HEADLESS', meta);
      printResult(result, jsonMode);
    } else {
      console.error(msg);
    }
    process.exit(1);
  });

variant
  .command('delete <idOrIcp> [id]')
  .description(
    'Delete all generated variants of a parent icon (hard delete). The base icon is preserved. Safe to call even when no variants exist.'
  )
  .action(async (arg1: string, arg2?: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const icpPath = arg2 !== undefined ? arg1 : undefined;
    const id = arg2 !== undefined ? arg2 : arg1;
    const meta = makeMeta('variant delete', icpPath ?? '', start);
    try {
      const resolvedPath = await resolveProjectOrExit(icpPath, start, jsonMode, meta);
      meta.projectPath = resolvedPath;
      const deleteResult = await coreDeleteVariants(nodeIo, resolvedPath, id);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(deleteResult, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        console.log(`Deleted ${deleteResult.deleted} variant(s) of "${deleteResult.parentName}"`);
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
// search
// ---------------------------------------------------------------------------
program
  .command('search <icp> <query>')
  .option('--group <name>', 'Search within a specific group')
  .option('--limit <n>', 'Maximum results (default: 50)')
  .description(
    'Search icons by name substring. Returns matching icons with ID, name, code, and group.'
  )
  .action(async (icpPath: string, query: string, opts: { group?: string; limit?: string }) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('search', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const limit = opts.limit ? parseInt(opts.limit, 10) : 50;
      const icons = await coreSearchIcons(nodeIo, resolvedPath, query, {
        group: opts.group,
        limit,
      });
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(icons, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        if (icons.length === 0) {
          console.log(`No icons matching "${query}".`);
        } else {
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
          console.log(`\n${icons.length} result(s)`);
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

// ---------------------------------------------------------------------------
// favorite
// ---------------------------------------------------------------------------
const favorite = program
  .command('favorite')
  .description('Manage favorited icons. Favorites are bookmarked icons for quick access.');

favorite
  .command('list <icp>')
  .description('List all icons marked as favorite.')
  .action(async (icpPath: string) => {
    const start = Date.now();
    const jsonMode = program.opts().json;
    const meta = makeMeta('favorite list', icpPath, start);
    try {
      const resolvedPath = nodeIo.resolve(icpPath);
      if (!(await nodeIo.exists(resolvedPath))) {
        meta.duration_ms = Date.now() - start;
        const result = jsonError(`File not found: ${icpPath}`, 'FILE_NOT_FOUND', meta);
        printResult(result, jsonMode);
        process.exit(2);
      }
      const icons = await coreListFavorites(nodeIo, resolvedPath);
      meta.duration_ms = Date.now() - start;
      const result = jsonOutput(icons, meta);
      printResult(result, jsonMode);
      if (!jsonMode) {
        if (icons.length === 0) {
          console.log('No favorite icons.');
        } else {
          const idWidth = Math.max(2, ...icons.map((i) => i.id.length));
          const nameWidth = Math.max(4, ...icons.map((i) => i.iconName.length));
          const codeWidth = Math.max(4, ...icons.map((i) => (i.iconCode || '').length));
          console.log(
            `  ${'ID'.padEnd(idWidth)}  ${'Name'.padEnd(nameWidth)}  ${'Code'.padEnd(codeWidth)}`
          );
          console.log(
            `  ${''.padEnd(idWidth, '-')}  ${''.padEnd(nameWidth, '-')}  ${''.padEnd(codeWidth, '-')}`
          );
          for (const icon of icons) {
            console.log(
              `  ${icon.id.padEnd(idWidth)}  ${icon.iconName.padEnd(nameWidth)}  ${(icon.iconCode || '').padEnd(codeWidth)}`
            );
          }
          console.log(`\n${icons.length} favorite(s)`);
        }
      }
    } catch (err: any) {
      meta.duration_ms = Date.now() - start;
      const result = jsonError(err.message, 'FILE_IO_ERROR', meta);
      printResult(result, jsonMode);
      process.exit(2);
    }
  });

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
