/**
 * Screen Color Picker for Electron
 *
 * Captures the entire screen, displays it in a fullscreen overlay window,
 * and lets the user pick a pixel color with a magnifying glass cursor.
 *
 * Usage (main process):
 *   import { registerScreenColorPicker } from './screen-color-picker';
 *   registerScreenColorPicker();
 *
 * Usage (renderer via preload):
 *   const hex = await electronAPI.pickScreenColor();
 *
 * Works on Windows, macOS, and Linux.
 * Zero dependencies — uses only Electron built-in APIs.
 */

import { BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron';
import * as path from 'path';

let overlayWindow: BrowserWindow | null = null;

async function captureScreen(): Promise<string> {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const scaleFactor = primaryDisplay.scaleFactor;

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(width * scaleFactor),
      height: Math.round(height * scaleFactor),
    },
  });

  if (!sources.length) throw new Error('No screen source available');

  // Use the primary display source
  const source = sources[0];
  return source.thumbnail.toDataURL();
}

async function openColorPicker(): Promise<string> {
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const { x, y } = primaryDisplay.bounds;

  // Capture screen BEFORE showing overlay
  const screenshotDataUrl = await captureScreen();

  return new Promise<string>((resolve) => {
    overlayWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      fullscreenable: false,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'overlay-preload.js'),
      },
    });

    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Fullscreen on all platforms
    overlayWindow.setBounds({ x, y, width, height });

    // Load the overlay HTML
    const overlayPath = path.join(__dirname, 'overlay.html');
    overlayWindow.loadFile(overlayPath);

    // Send screenshot data once overlay is ready
    overlayWindow.webContents.once('did-finish-load', () => {
      overlayWindow?.webContents.send('screenshot-data', screenshotDataUrl, width, height);
    });

    // Listen for color pick result
    ipcMain.once('color-picked', (_event, colorHex: string) => {
      overlayWindow?.close();
      overlayWindow = null;
      resolve(colorHex);
    });

    // Handle overlay close (Esc or click outside)
    overlayWindow.once('closed', () => {
      overlayWindow = null;
      ipcMain.removeAllListeners('color-picked');
      resolve(''); // cancelled
    });
  });
}

/**
 * Register IPC handler for screen color picking.
 * Call this once in main process after app is ready.
 */
export function registerScreenColorPicker(): void {
  ipcMain.handle('pick-screen-color', async () => {
    return openColorPicker();
  });
}
