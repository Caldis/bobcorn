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
import { listIcons as coreListIcons } from '../core/operations/icon';
import { listGroups as coreListGroups } from '../core/operations/group';

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
const project = program.command('project').description('Project operations');

project
  .command('inspect <icp>')
  .description('Show project metadata and statistics')
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
  .description('Create a new empty .icp project file')
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
const icon = program.command('icon').description('Icon operations');

icon
  .command('list <icp>')
  .description('List icons in project')
  .option('--group <name>', 'Filter by group name')
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
  .description('Import SVG files')
  .action(stubAction('icon import'));

icon
  .command('rename <icp> <id> <newName>')
  .description('Rename an icon')
  .action(stubAction('icon rename'));

icon
  .command('move <icp> <ids...>')
  .option('--to <group>', 'Target group name')
  .description('Move icons to a group')
  .action(stubAction('icon move'));

icon
  .command('copy <icp> <ids...>')
  .option('--to <group>', 'Target group name')
  .description('Copy icons to a group')
  .action(stubAction('icon copy'));

icon.command('delete <icp> <ids...>').description('Delete icons').action(stubAction('icon delete'));

icon
  .command('set-code <icp> <id> <code>')
  .description('Set icon Unicode code point')
  .action(stubAction('icon set-code'));

icon
  .command('replace <icp> <id> <svg>')
  .description('Replace icon SVG content')
  .action(stubAction('icon replace'));

icon
  .command('export-svg <icp> <ids...>')
  .option('--out <dir>', 'Output directory')
  .description('Export icon SVG files')
  .action(stubAction('icon export-svg'));

icon
  .command('set-favorite <icp> <id>')
  .option('--off', 'Remove favorite')
  .description('Toggle icon favorite status')
  .action(stubAction('icon set-favorite'));

icon
  .command('set-color <icp> <id> <color>')
  .description('Set icon color')
  .action(stubAction('icon set-color'));

icon
  .command('get-content <icp> <id>')
  .description('Get icon SVG content')
  .action(stubAction('icon get-content'));

// ---------------------------------------------------------------------------
// group
// ---------------------------------------------------------------------------
const group = program.command('group').description('Group operations');

group
  .command('list <icp>')
  .description('List groups with icon counts')
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

group.command('add <icp> <name>').description('Add a new group').action(stubAction('group add'));

group
  .command('rename <icp> <oldName> <newName>')
  .description('Rename a group')
  .action(stubAction('group rename'));

group
  .command('delete <icp> <name>')
  .description('Delete a group')
  .action(stubAction('group delete'));

group
  .command('reorder <icp> <names...>')
  .description('Reorder groups')
  .action(stubAction('group reorder'));

group
  .command('set-description <icp> <name> <description>')
  .description('Set group description')
  .action(stubAction('group set-description'));

group
  .command('move-icons <icp> <targetGroup> <ids...>')
  .description('Move icons to target group')
  .action(stubAction('group move-icons'));

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------
const exp = program.command('export').description('Export operations');

exp
  .command('font <icp>')
  .option('--out <dir>', 'Output directory')
  .option('--formats <formats>', 'Comma-separated formats: svg,ttf,woff,woff2,eot')
  .description('Export font files')
  .action(stubAction('export font'));

exp
  .command('icon <icp> <ids...>')
  .option('--out <dir>', 'Output directory')
  .option('--preset <name>', 'Export preset name')
  .option('--format <format>', 'Export format: svg,png,jpg,webp,pdf,ico')
  .option('--size <size>', 'Export size in pixels')
  .description('Export icon image files')
  .action(stubAction('export icon'));

exp
  .command('svg <icp>')
  .option('--out <dir>', 'Output directory')
  .description('Export all SVG files')
  .action(stubAction('export svg'));

// ---------------------------------------------------------------------------
// variant
// ---------------------------------------------------------------------------
const variant = program.command('variant').description('Variant operations');

variant
  .command('list <icp> <id>')
  .description('List variants of an icon')
  .action(stubAction('variant list'));

variant
  .command('generate <icp> <id>')
  .description('Generate a variant')
  .action(stubAction('variant generate'));

variant
  .command('delete <icp> <id>')
  .description('Delete a variant')
  .action(stubAction('variant delete'));

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------
program
  .command('search <icp> <query>')
  .description('Search icons by name or code')
  .action(stubAction('search'));

// ---------------------------------------------------------------------------
// favorite
// ---------------------------------------------------------------------------
const favorite = program.command('favorite').description('Favorite operations');

favorite
  .command('list <icp>')
  .description('List favorite icons')
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
