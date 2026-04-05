/**
 * CLI test helpers — subprocess runner and fixture utilities.
 *
 * Spawns the built CLI binary (`out/cli/index.cjs`) as a child process,
 * captures stdout/stderr/exitCode, and provides convenience wrappers
 * for JSON-mode output and temporary project scaffolding.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Resolve CLI binary path relative to project root
const CLI_BIN = join(__dirname, '..', '..', 'out', 'cli', 'index.cjs');

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Spawn the CLI with given args, capture all output. Never throws.
 * @param args - CLI arguments (e.g. ['--version'] or ['project', 'inspect', 'foo.icp'])
 * @param options - Optional cwd override
 */
export function run(args: string[], options?: { cwd?: string }): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI_BIN, ...args],
      {
        cwd: options?.cwd,
        timeout: 15_000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        // Node's execFile puts the exit code in error.code (as a number)
        // when the process exits with non-zero. For signal kills, it's in error.signal.
        let exitCode = 0;
        if (error) {
          if (typeof (error as any).code === 'number') {
            exitCode = (error as any).code;
          } else if ((error as any).status != null) {
            exitCode = (error as any).status;
          } else {
            exitCode = 1; // fallback for other errors
          }
        }
        resolve({
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          exitCode,
        });
      }
    );
  });
}

/**
 * Run CLI with --json flag, parse stdout as JSON envelope.
 * Returns the parsed CliOutput object plus raw RunResult.
 */
export async function runJson(
  args: string[],
  options?: { cwd?: string }
): Promise<{ json: any; raw: RunResult }> {
  const raw = await run(['--json', ...args], options);
  let json: any;
  try {
    json = JSON.parse(raw.stdout.trim());
  } catch {
    json = null;
  }
  return { json, raw };
}

/**
 * Create a temporary directory for a test project.
 * Returns the path and a cleanup function.
 */
export async function tmpProject(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'bobcorn-test-'));
  return {
    dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Write a minimal valid SVG file to the given directory.
 * Returns the full path of the created file.
 */
export async function writeSvg(
  dir: string,
  name: string = 'test-icon.svg',
  content?: string
): Promise<string> {
  const svgContent =
    content ??
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path d="M12 2L2 22h20L12 2z"/>
</svg>`;
  const filePath = join(dir, name);
  await writeFile(filePath, svgContent, 'utf-8');
  return filePath;
}
