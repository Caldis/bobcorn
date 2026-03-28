/**
 * Inlined from electron-pixel-picker@1.0.2 (MIT License)
 * https://github.com/nicechow/electron-pixel-picker
 *
 * Zero-dependency screen color picker for Electron.
 * Converted from CJS to ESM to avoid Rollup bundling issues.
 */

import { app, BrowserWindow, ipcMain, screen, desktopCapturer } from 'electron';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

// ---------------------------------------------------------------------------
// Inlined assets — avoids __dirname / file-path issues when bundled
// ---------------------------------------------------------------------------
const PRELOAD_JS = `
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('colorPickerAPI', {
  onScreenshotData: (cb) => {
    ipcRenderer.on('screenshot-data', (_ev, dataUrl, w, h) => cb(dataUrl, w, h));
  },
  sendColorPicked: (hex) => {
    ipcRenderer.send('color-picked', hex);
  },
});
`;

const OVERLAY_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; cursor: none; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
  #canvas-source {
    position: fixed; top: 0; left: 0;
    width: 100vw; height: 100vh;
    object-fit: cover;
  }
  #magnifier {
    position: fixed;
    pointer-events: none;
    border-radius: 50%;
    overflow: hidden;
    border: 3px solid rgba(255,255,255,0.9);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.4);
    z-index: 10;
  }
  #magnifier canvas {
    display: block;
    border-radius: 50%;
  }
  #color-label {
    position: fixed;
    pointer-events: none;
    padding: 4px 10px;
    border-radius: 4px;
    font-family: 'Cascadia Code', 'Consolas', 'SF Mono', monospace;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    background: rgba(0,0,0,0.75);
    backdrop-filter: blur(4px);
    z-index: 11;
    white-space: nowrap;
  }
</style>
</head>
<body>
  <canvas id="canvas-source"></canvas>
  <div id="magnifier"><canvas id="canvas-mag"></canvas></div>
  <div id="color-label"></div>

<script>
  var MAG_DISPLAY_SIZE = 140;
  var GRID_MIN = 5;
  var GRID_MAX = 141;
  var gridCount = 13;

  var sourceCanvas = document.getElementById('canvas-source');
  var sourceCtx = sourceCanvas.getContext('2d');
  var magDiv = document.getElementById('magnifier');
  var magCanvas = document.getElementById('canvas-mag');
  var magCtx = magCanvas.getContext('2d');
  var colorLabel = document.getElementById('color-label');

  magDiv.style.width = magDiv.style.height = MAG_DISPLAY_SIZE + 'px';
  magCanvas.width = magCanvas.height = MAG_DISPLAY_SIZE;
  magCanvas.style.width = magCanvas.style.height = MAG_DISPLAY_SIZE + 'px';

  var currentColor = '';
  var imgLoaded = false;
  var lastClientX = 0, lastClientY = 0;

  window.colorPickerAPI.onScreenshotData(function(dataUrl) {
    var img = new Image();
    img.onload = function() {
      sourceCanvas.width = img.width;
      sourceCanvas.height = img.height;
      sourceCtx.drawImage(img, 0, 0);
      imgLoaded = true;
      drawMagnifier(lastClientX, lastClientY);
    };
    img.src = dataUrl;
  });

  function getPixelColor(x, y) {
    if (!imgLoaded) return '#000000';
    var px = Math.max(0, Math.min(sourceCanvas.width - 1, x));
    var py = Math.max(0, Math.min(sourceCanvas.height - 1, y));
    var pixel = sourceCtx.getImageData(px, py, 1, 1).data;
    return '#' + pixel[0].toString(16).padStart(2, '0')
              + pixel[1].toString(16).padStart(2, '0')
              + pixel[2].toString(16).padStart(2, '0');
  }

  function drawMagnifier(clientX, clientY) {
    var cellSize = MAG_DISPLAY_SIZE / gridCount;
    var half = Math.floor(gridCount / 2);
    var totalW = MAG_DISPLAY_SIZE + 6;
    var magX = clientX - totalW / 2;
    var magY = clientY - totalW / 2;
    magDiv.style.transform = 'translate(' + magX + 'px,' + magY + 'px)';

    if (!imgLoaded) {
      magCtx.fillStyle = '#222';
      magCtx.fillRect(0, 0, MAG_DISPLAY_SIZE, MAG_DISPLAY_SIZE);
      colorLabel.textContent = '...';
      colorLabel.style.background = '#333';
      colorLabel.style.color = '#fff';
      colorLabel.style.transform = 'translate(' + (magX + totalW / 2 - 20) + 'px,' + (magY + totalW + 8) + 'px)';
      return;
    }

    var rect = sourceCanvas.getBoundingClientRect();
    var cx = Math.round((clientX - rect.left) / rect.width * sourceCanvas.width);
    var cy = Math.round((clientY - rect.top) / rect.height * sourceCanvas.height);
    var startX = Math.max(0, Math.min(sourceCanvas.width - gridCount, cx - half));
    var startY = Math.max(0, Math.min(sourceCanvas.height - gridCount, cy - half));
    var imageData = sourceCtx.getImageData(startX, startY, gridCount, gridCount);

    currentColor = getPixelColor(cx, cy);

    magCtx.clearRect(0, 0, MAG_DISPLAY_SIZE, MAG_DISPLAY_SIZE);
    var pixels = imageData.data;
    for (var py = 0; py < gridCount; py++) {
      for (var px = 0; px < gridCount; px++) {
        var i = (py * gridCount + px) * 4;
        magCtx.fillStyle = 'rgb(' + pixels[i] + ',' + pixels[i+1] + ',' + pixels[i+2] + ')';
        magCtx.fillRect(Math.floor(px * cellSize), Math.floor(py * cellSize),
                        Math.ceil(cellSize), Math.ceil(cellSize));
      }
    }

    if (cellSize >= 4) {
      magCtx.strokeStyle = 'rgba(255,255,255,0.15)';
      magCtx.lineWidth = 0.5;
      for (var i = 0; i <= gridCount; i++) {
        var pos = Math.floor(i * cellSize);
        magCtx.beginPath(); magCtx.moveTo(pos, 0); magCtx.lineTo(pos, MAG_DISPLAY_SIZE); magCtx.stroke();
        magCtx.beginPath(); magCtx.moveTo(0, pos); magCtx.lineTo(MAG_DISPLAY_SIZE, pos); magCtx.stroke();
      }
    }

    var cx0 = Math.floor(half * cellSize);
    var cy0 = Math.floor(half * cellSize);
    var cs = Math.ceil(cellSize);
    magCtx.strokeStyle = '#fff'; magCtx.lineWidth = 2;
    magCtx.strokeRect(cx0, cy0, cs, cs);
    magCtx.strokeStyle = '#000'; magCtx.lineWidth = 1;
    magCtx.strokeRect(cx0 - 1, cy0 - 1, cs + 2, cs + 2);

    colorLabel.textContent = currentColor.toUpperCase();
    colorLabel.style.background = currentColor;
    var r = parseInt(currentColor.slice(1,3), 16);
    var g = parseInt(currentColor.slice(3,5), 16);
    var b = parseInt(currentColor.slice(5,7), 16);
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    colorLabel.style.color = lum > 0.5 ? '#000' : '#fff';
    colorLabel.style.transform = 'translate(' + (magX + totalW / 2 - 35) + 'px,' + (magY + totalW + 8) + 'px)';
  }

  document.addEventListener('mousemove', function(e) {
    lastClientX = e.clientX; lastClientY = e.clientY;
    drawMagnifier(e.clientX, e.clientY);
  });

  document.addEventListener('wheel', function(e) {
    e.preventDefault();
    var delta = e.deltaY < 0 ? -2 : 2;
    gridCount = Math.max(GRID_MIN, Math.min(GRID_MAX, gridCount + delta));
    if (gridCount % 2 === 0) gridCount += (delta > 0 ? 1 : -1);
    drawMagnifier(lastClientX, lastClientY);
  }, { passive: false });

  document.addEventListener('click', function() {
    if (!imgLoaded) return;
    window.colorPickerAPI.sendColorPicked(currentColor);
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') window.colorPickerAPI.sendColorPicked('');
  });

  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    window.colorPickerAPI.sendColorPicked('');
  });
</script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Runtime asset extraction — write inlined assets to temp once per app run
// ---------------------------------------------------------------------------
let _preloadPath: string | null = null;
let _htmlPath: string | null = null;

function ensureAssets(): { preload: string; html: string } {
  if (_preloadPath && _htmlPath) return { preload: _preloadPath, html: _htmlPath };
  const assetDir = join(app.getPath('temp'), 'electron-pixel-picker');
  mkdirSync(assetDir, { recursive: true });
  _preloadPath = join(assetDir, 'preload.js');
  _htmlPath = join(assetDir, 'overlay.html');
  writeFileSync(_preloadPath, PRELOAD_JS, 'utf-8');
  writeFileSync(_htmlPath, OVERLAY_HTML, 'utf-8');
  return { preload: _preloadPath, html: _htmlPath };
}

let overlayWindow: BrowserWindow | null = null;

async function captureScreen(): Promise<string> {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const scaleFactor = primaryDisplay.scaleFactor;
  const thumbWidth = Math.round(width * scaleFactor);
  const thumbHeight = Math.round(height * scaleFactor);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: thumbWidth, height: thumbHeight },
  });
  if (!sources.length) throw new Error('No screen source available');
  return sources[0].thumbnail.toDataURL();
}

export async function pickScreenColor(): Promise<string> {
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
  }
  const { preload, html } = ensureAssets();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const { x, y } = primaryDisplay.bounds;

  let screenshotDataUrl: string;
  try {
    screenshotDataUrl = await captureScreen();
  } catch (err) {
    console.error('[pixel-picker] capture failed:', err);
    return '';
  }

  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (value: string) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

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
        preload,
      },
    });

    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setBounds({ x, y, width, height });
    overlayWindow.loadFile(html);

    overlayWindow.webContents.once('did-finish-load', () => {
      overlayWindow?.webContents.send('screenshot-data', screenshotDataUrl, width, height);
    });

    ipcMain.once('color-picked', (_event: any, colorHex: string) => {
      overlayWindow?.close();
      overlayWindow = null;
      safeResolve(colorHex);
    });

    overlayWindow.once('closed', () => {
      overlayWindow = null;
      ipcMain.removeAllListeners('color-picked');
      safeResolve('');
    });
  });
}

export function registerPixelPicker(): void {
  ipcMain.handle('pick-screen-color', async () => {
    return pickScreenColor();
  });
}
