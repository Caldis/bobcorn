/**
 * CLI install/uninstall logic.
 *
 * Handles PATH registration for the `bobcorn` command:
 * - macOS/Linux: wrapper script in ~/.local/bin
 * - Windows: bobcorn.cmd wrapper in %LOCALAPPDATA%\Bobcorn\cli + HKCU\Environment\Path
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
}

/**
 * Get the path to the CLI entry point.
 * When running inside a packaged app: <app>/resources/app.asar.unpacked/out/cli/index.cjs
 * When running in dev: <project>/out/cli/index.cjs
 */
export function getCliSourcePath(): string {
  return path.resolve(__dirname, 'index.cjs');
}

/**
 * Detect whether `bobcorn` is currently available on the system PATH.
 */
export function detectInstallStatus(): {
  installed: boolean;
  version: string | null;
  path: string | null;
} {
  try {
    const result = execSync('bobcorn --version', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    const whichCmd = os.platform() === 'win32' ? 'where bobcorn' : 'which bobcorn';
    const binPath = execSync(whichCmd, {
      encoding: 'utf8',
      timeout: 5000,
    })
      .trim()
      .split('\n')[0];
    return { installed: true, version: result, path: binPath };
  } catch {
    return { installed: false, version: null, path: null };
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
  const cliDir = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'Bobcorn',
    'cli'
  );
  fs.mkdirSync(cliDir, { recursive: true });

  // Write a .cmd wrapper that invokes node with the bundled CLI entry
  const wrapperPath = path.join(cliDir, 'bobcorn.cmd');
  fs.writeFileSync(wrapperPath, `@echo off\r\n"${process.execPath}" "${source}" %*\r\n`);

  // Add cliDir to User PATH if not already there
  try {
    const currentPath = execSync('reg query "HKCU\\Environment" /v Path', {
      encoding: 'utf8',
    });
    if (!currentPath.includes(cliDir)) {
      const pathValue = currentPath.match(/REG_(?:EXPAND_)?SZ\s+(.+)/)?.[1]?.trim() || '';
      const newPath = pathValue ? `${pathValue};${cliDir}` : cliDir;
      execSync(`reg add "HKCU\\Environment" /v Path /t REG_EXPAND_SZ /d "${newPath}" /f`);
      // Broadcast WM_SETTINGCHANGE so other processes pick up the change
      execSync(
        "powershell -Command \"[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User'), 'User')\""
      );
    }
  } catch {
    // PATH registry key might not exist yet — create it
    execSync(`reg add "HKCU\\Environment" /v Path /t REG_EXPAND_SZ /d "${cliDir}" /f`);
  }

  return {
    success: true,
    message: 'CLI installed to PATH',
    path: wrapperPath,
    needsRestart: true,
  };
}

function uninstallWindows(): InstallResult {
  const cliDir = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'Bobcorn',
    'cli'
  );
  const wrapperPath = path.join(cliDir, 'bobcorn.cmd');
  try {
    fs.unlinkSync(wrapperPath);
  } catch {
    // Already removed or never existed
  }

  // Remove cliDir from User PATH if present
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
      // Broadcast WM_SETTINGCHANGE
      execSync(
        "powershell -Command \"[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User'), 'User')\""
      );
    }
  } catch {
    // If reg query fails, PATH key doesn't exist — nothing to clean
  }

  return {
    success: true,
    message: 'CLI removed from PATH',
    path: wrapperPath,
    needsRestart: true,
  };
}

// ---------------------------------------------------------------------------
// macOS / Linux
// ---------------------------------------------------------------------------

function installUnix(source: string): InstallResult {
  const localBin = path.join(os.homedir(), '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  const linkPath = path.join(localBin, 'bobcorn');

  // Create wrapper script (not symlink — handles node path correctly)
  fs.writeFileSync(linkPath, `#!/bin/sh\nexec "${process.execPath}" "${source}" "$@"\n`);
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
    };
  }

  return {
    success: true,
    message: 'CLI installed to PATH',
    path: linkPath,
    needsRestart: false,
  };
}

function uninstallUnix(): InstallResult {
  const linkPath = path.join(os.homedir(), '.local', 'bin', 'bobcorn');
  try {
    fs.unlinkSync(linkPath);
  } catch {
    // Already removed or never existed
  }
  return {
    success: true,
    message: 'CLI removed',
    path: linkPath,
    needsRestart: false,
  };
}
