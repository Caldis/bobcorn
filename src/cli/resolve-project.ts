/**
 * Project auto-discovery for the CLI.
 *
 * Resolves the .icp project file path using a priority chain:
 *   1. Explicit path (positional arg)
 *   2. --project global flag
 *   3. Auto-discover: glob *.icp in current directory
 *      - Exactly 1 found -> use it
 *      - 0 found -> throw with helpful message
 *      - 2+ found -> throw listing files, ask user to specify
 */
import { readdirSync } from 'fs';
import path from 'path';

export class ProjectResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectResolutionError';
  }
}

/**
 * Resolve the .icp project file path using priority chain.
 *
 * @param explicit - Positional argument from the command (e.g. `icon list <icp>`)
 * @param globalFlag - Value of the `--project` global flag
 * @returns Absolute path to the .icp file
 * @throws {ProjectResolutionError} When no project can be resolved
 */
export function resolveProject(explicit?: string, globalFlag?: string): string {
  // Priority 1: explicit positional argument
  if (explicit) {
    return path.resolve(explicit);
  }

  // Priority 2: --project global flag
  if (globalFlag) {
    return path.resolve(globalFlag);
  }

  // Priority 3: auto-discover *.icp in cwd
  const cwd = process.cwd();
  let entries: string[];
  try {
    entries = readdirSync(cwd);
  } catch {
    throw new ProjectResolutionError(
      'Error: Cannot read current directory.\n' +
        '  Specify a path: bobcorn icon list my-project.icp\n' +
        '  Or use --project: bobcorn --project path/to/file.icp icon list'
    );
  }

  const icpFiles = entries.filter((f) => f.endsWith('.icp'));

  if (icpFiles.length === 1) {
    return path.resolve(cwd, icpFiles[0]);
  }

  if (icpFiles.length === 0) {
    throw new ProjectResolutionError(
      'Error: No .icp project file found.\n' +
        '  Specify a path: bobcorn icon list my-project.icp\n' +
        '  Or use --project: bobcorn --project path/to/file.icp icon list\n' +
        '  Or run from a directory containing a .icp file.'
    );
  }

  // Multiple .icp files
  const listing = icpFiles.map((f) => `  - ${f}`).join('\n');
  throw new ProjectResolutionError(
    'Error: Multiple .icp files found in current directory:\n' +
      listing +
      '\n' +
      `Specify which one: bobcorn icon list ${icpFiles[0]}`
  );
}
