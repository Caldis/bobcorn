/**
 * CLI install/uninstall logic.
 *
 * Handles PATH registration:
 * - Production: installs `bobcorn` command
 * - Development: installs `bobcorn-dev` command
 * Both can coexist simultaneously.
 *
 * - macOS/Linux: wrapper script in ~/.local/bin
 * - Windows: .cmd wrapper in %LOCALAPPDATA%\Bobcorn\cli + HKCU\Environment\Path
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

export interface InstallResult {
  success: boolean;
  message: string;
  path: string;
  needsRestart: boolean;
  commandName: string;
}

/** Detect if running in dev mode */
function isDev(): boolean {
  // In dev, the CLI source lives directly under the project (not inside app.asar)
  const source = getCliSourcePath();
  return !source.includes('app.asar') && !source.includes('resources');
}

/** Command name: `bobcorn` in prod, `bobcorn-dev` in dev */
function commandName(): string {
  return isDev() ? 'bobcorn-dev' : 'bobcorn';
}

/** Directory where CLI wrapper lives */
function cliHome(): string {
  if (os.platform() === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'Bobcorn',
      'cli'
    );
  }
  return path.join(os.homedir(), '.local', 'bin');
}

/**
 * Get the path to the CLI entry point.
 * When running inside a packaged app: <app>/resources/app.asar.unpacked/out/cli/index.cjs
 * When running in dev: <project>/out/cli/index.cjs
 */
export function getCliSourcePath(): string {
  return path.resolve(__dirname, 'index.cjs');
}

/** Find a usable Node.js binary (prefer system node over Electron) */
function findNodeBin(): string {
  if (!process.versions.electron) {
    return process.execPath;
  }
  try {
    const which = os.platform() === 'win32' ? 'where node' : 'which node';
    return execSync(which, { encoding: 'utf8', timeout: 5000 }).trim().split('\n')[0];
  } catch {
    return process.execPath;
  }
}

/**
 * Detect whether the CLI command is available on the system PATH.
 */
export function detectInstallStatus(): {
  installed: boolean;
  version: string | null;
  path: string | null;
  commandName: string;
} {
  const cmd = commandName();
  try {
    const result = execSync(`${cmd} --version`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    const whichCmd = os.platform() === 'win32' ? `where ${cmd}` : `which ${cmd}`;
    const binPath = execSync(whichCmd, {
      encoding: 'utf8',
      timeout: 5000,
    })
      .trim()
      .split('\n')[0];
    return { installed: true, version: result, path: binPath, commandName: cmd };
  } catch {
    return { installed: false, version: null, path: null, commandName: cmd };
  }
}

/**
 * Install the CLI to the system PATH.
 */
export function install(): InstallResult {
  const source = getCliSourcePath();
  if (os.platform() === 'win32') {
    return installWindows(source);
  } else {
    return installUnix(source);
  }
}

/**
 * Remove the CLI from the system PATH.
 */
export function uninstall(): InstallResult {
  if (os.platform() === 'win32') {
    return uninstallWindows();
  } else {
    return uninstallUnix();
  }
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function installWindows(source: string): InstallResult {
  const cmd = commandName();
  const cliDir = cliHome();
  fs.mkdirSync(cliDir, { recursive: true });

  const nodeBin = findNodeBin();
  const wrapperPath = path.join(cliDir, `${cmd}.cmd`);
  fs.writeFileSync(wrapperPath, `@echo off\r\n"${nodeBin}" "${source}" %*\r\n`);

  // Add cliDir to User PATH if not already there
  try {
    const currentPath = execSync('reg query "HKCU\\Environment" /v Path', {
      encoding: 'utf8',
    });
    if (!currentPath.includes(cliDir)) {
      const pathValue = currentPath.match(/REG_(?:EXPAND_)?SZ\s+(.+)/)?.[1]?.trim() || '';
      const newPath = pathValue ? `${pathValue};${cliDir}` : cliDir;
      execSync(`reg add "HKCU\\Environment" /v Path /t REG_EXPAND_SZ /d "${newPath}" /f`);
      execSync(
        "powershell -Command \"[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User'), 'User')\""
      );
    }
  } catch {
    execSync(`reg add "HKCU\\Environment" /v Path /t REG_EXPAND_SZ /d "${cliDir}" /f`);
  }

  return {
    success: true,
    message: `CLI installed as "${cmd}"`,
    path: wrapperPath,
    needsRestart: true,
    commandName: cmd,
  };
}

function uninstallWindows(): InstallResult {
  const cmd = commandName();
  const cliDir = cliHome();
  const wrapperPath = path.join(cliDir, `${cmd}.cmd`);
  try {
    fs.unlinkSync(wrapperPath);
  } catch {
    // Already removed or never existed
  }

  // Only remove cliDir from PATH if no wrappers remain
  const remaining = fs.existsSync(cliDir)
    ? fs.readdirSync(cliDir).filter((f) => f.endsWith('.cmd'))
    : [];
  if (remaining.length === 0) {
    try {
      const currentPath = execSync('reg query "HKCU\\Environment" /v Path', {
        encoding: 'utf8',
      });
      const pathValue = currentPath.match(/REG_(?:EXPAND_)?SZ\s+(.+)/)?.[1]?.trim() || '';
      if (pathValue.includes(cliDir)) {
        const newPath = pathValue
          .split(';')
          .filter((p) => p !== cliDir)
          .join(';');
        if (newPath) {
          execSync(`reg add "HKCU\\Environment" /v Path /t REG_EXPAND_SZ /d "${newPath}" /f`);
        }
        execSync(
          "powershell -Command \"[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User'), 'User')\""
        );
      }
    } catch {
      // PATH key doesn't exist — nothing to clean
    }
  }

  return {
    success: true,
    message: `"${cmd}" removed`,
    path: wrapperPath,
    needsRestart: true,
    commandName: cmd,
  };
}

// ---------------------------------------------------------------------------
// macOS / Linux
// ---------------------------------------------------------------------------

function installUnix(source: string): InstallResult {
  const localBin = path.join(os.homedir(), '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });

  const cmd = commandName();
  const nodeBin = findNodeBin();
  const linkPath = path.join(localBin, cmd);
  fs.writeFileSync(linkPath, `#!/bin/sh\nexec "${nodeBin}" "${source}" "$@"\n`);
  fs.chmodSync(linkPath, 0o755);

  // Check if ~/.local/bin is in PATH, suggest shell RC update if not
  const currentPath = process.env.PATH || '';
  const needsRcUpdate = !currentPath.includes(localBin);
  if (needsRcUpdate) {
    const shell = process.env.SHELL || '/bin/zsh';
    const rcFile = shell.includes('zsh') ? '~/.zshrc' : '~/.bashrc';
    return {
      success: true,
      message: `CLI installed. Add to PATH: echo 'export PATH="$HOME/.local/bin:$PATH"' >> ${rcFile}`,
      path: linkPath,
      needsRestart: true,
      commandName: cmd,
    };
  }

  return {
    success: true,
    message: `CLI installed as "${cmd}"`,
    path: linkPath,
    needsRestart: false,
    commandName: cmd,
  };
}

function uninstallUnix(): InstallResult {
  const cmd = commandName();
  const linkPath = path.join(os.homedir(), '.local', 'bin', cmd);
  try {
    fs.unlinkSync(linkPath);
  } catch {
    // Already removed or never existed
  }
  return {
    success: true,
    message: `"${cmd}" removed`,
    path: linkPath,
    needsRestart: false,
    commandName: cmd,
  };
}
