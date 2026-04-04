#!/usr/bin/env node
/**
 * Bobcorn — Automated screenshot tool (macOS only)
 *
 * Generates UI screenshots for E2E visual acceptance and website assets.
 * Uses `screencapture -l <windowID>` for native macOS window shadow.
 *
 * Usage:
 *   node scripts/screenshot.mjs [options] [project.icp]
 *
 * Options:
 *   --width=N       Window width  (default: 1440)
 *   --height=N      Window height (default: 1080)
 *   --theme=MODE    light | dark  (default: light)
 *   --lang=LANG     Single language only, e.g. --lang=en
 *   --out=DIR       Output directory (default: ~/Desktop/bobcorn-screenshot)
 *
 * npm scripts:
 *   npm run screenshot             # default output (website assets)
 *   npm run screenshot:acceptance  # E2E visual acceptance
 */

import { execSync, spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

// ── CLI argument parsing ────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    width: 1440,
    height: 1080,
    theme: 'light',
    lang: null,       // null = both en + zh-CN
    out: path.join(process.env.HOME, 'Desktop/bobcorn-screenshot'),
    project: '',
  };

  for (const arg of args) {
    if (arg.startsWith('--width='))  { opts.width = parseInt(arg.split('=')[1], 10); continue; }
    if (arg.startsWith('--height=')) { opts.height = parseInt(arg.split('=')[1], 10); continue; }
    if (arg.startsWith('--theme='))  { opts.theme = arg.split('=')[1]; continue; }
    if (arg.startsWith('--lang='))   { opts.lang = arg.split('=')[1]; continue; }
    if (arg.startsWith('--out='))    { opts.out = arg.split('=')[1]; continue; }
    if (arg.endsWith('.icp'))        { opts.project = arg; continue; }
  }
  return opts;
}

const OPTS = parseArgs();
const CDP_PORT = 9222;

// ── Helpers ─────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpGet(url, { json = true } = {}) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve(json ? JSON.parse(d) : d));
      })
      .on('error', reject);
  });
}

async function findPageTarget() {
  const targets = await httpGet(`http://127.0.0.1:${CDP_PORT}/json`);
  return targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
}

async function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => {
    ws.addEventListener('open', ok);
    ws.addEventListener('error', fail);
  });

  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expr) => {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.result?.exceptionDetails) {
      throw new Error(
        res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text
      );
    }
    return res.result?.result?.value;
  };

  return { ws, evaluate };
}

/** Get Bobcorn window CGWindowID via Swift + CoreGraphics */
function getWindowId() {
  const swift = path.join(process.env.TMPDIR || '/tmp', 'bobcorn_winid.swift');
  fs.writeFileSync(
    swift,
    `import Cocoa
let list = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]
for w in list {
  guard let owner = w[kCGWindowOwnerName as String] as? String,
        let name  = w[kCGWindowName as String] as? String,
        let layer = w[kCGWindowLayer as String] as? Int,
        let num   = w[kCGWindowNumber as String] as? Int else { continue }
  if owner == "Electron" && layer == 0 && name.contains("Bobcorn") {
    print(num)
    exit(0)
  }
}
`
  );
  const out = execSync(`swift "${swift}" 2>/dev/null`).toString().trim();
  try { fs.unlinkSync(swift); } catch {}
  if (!out) throw new Error('Could not find Bobcorn window ID');
  return out;
}

function screencapture(windowId, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  execSync(`screencapture -l ${windowId} -o "${outputPath}"`);
  console.log(`  📸 ${path.basename(outputPath)}`);
}

function focusWindow() {
  try {
    execSync(
      `osascript -e 'tell application "System Events" to tell process "Electron" to set frontmost to true'`
    );
  } catch {}
}

// ── App lifecycle ───────────────────────────────────────────────

function killApp() {
  execSync(
    'pkill -f "bobcorn/node_modules/electron" 2>/dev/null; pkill -f "electron-vite" 2>/dev/null; true'
  );
  try {
    const appSupport = path.join(process.env.HOME, 'Library/Application Support/Bobcorn');
    for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
      try { fs.unlinkSync(path.join(appSupport, f)); } catch {}
    }
  } catch {}
}

async function startApp() {
  console.log('  Building...');
  execSync('npx electron-vite build', { stdio: 'ignore' });

  console.log(`  Starting (${OPTS.width}×${OPTS.height}, NO_DEVTOOLS)...`);
  const env = {
    ...process.env,
    NO_DEVTOOLS: '1',
    WIN_WIDTH: String(OPTS.width),
    WIN_HEIGHT: String(OPTS.height),
  };
  const child = spawn(
    'npx',
    ['electron-vite', 'dev', '--', `--remote-debugging-port=${CDP_PORT}`],
    { env, stdio: 'ignore', detached: true }
  );
  child.unref();

  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try {
      if (await findPageTarget()) return;
    } catch {}
  }
  throw new Error('App did not start within 30s');
}

// ── Screenshot sequence for one language ────────────────────────

async function captureSet(evaluate, windowId, lang) {
  const dir = path.join(OPTS.out, lang === 'zh-CN' ? 'cn' : 'en');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));

  const shot = (name) => {
    focusWindow();
    screencapture(windowId, path.join(dir, name));
  };

  // Switch language + theme
  await evaluate(`
    (async () => {
      const i18n = window.__BOBCORN_I18N__;
      await i18n.changeLanguage('${lang}');
      localStorage.setItem('language', '${lang}');
      window.electronAPI?.languageChanged('${lang}');
      window.__BOBCORN_STORE__.getState().setThemeMode('${OPTS.theme}');
    })()
  `);
  await sleep(1000);

  // 1. Welcome / Splash
  await evaluate(`window.__BOBCORN_STORE__.getState().showSplashScreen(true)`);
  await sleep(800);
  shot('01-welcome.png');

  // 2. Main 3-panel view
  await evaluate(`
    (() => {
      const s = window.__BOBCORN_STORE__.getState();
      s.showSplashScreen(false);
      s.setSideMenuVisible(true);
      s.setSideEditorVisible(true);
      s.selectGroup('resource-all');
    })()
  `);
  await sleep(1000);
  await evaluate(`document.querySelector('[data-testid="icon-block"]')?.click()`);
  await sleep(600);
  shot('02-main.png');

  // 3. Settings dialog
  await evaluate(`window.dispatchEvent(new CustomEvent('bobcorn:open-settings'))`);
  await sleep(1000);
  shot('03-settings.png');
  await evaluate(`document.querySelectorAll('[data-radix-portal]').forEach(p => p.remove())`);
  await sleep(500);

  // 4. Export dialog
  await evaluate(`window.dispatchEvent(new CustomEvent('bobcorn:open-export'))`);
  await sleep(1000);
  shot('04-export.png');
  await evaluate(`document.querySelectorAll('[data-radix-portal]').forEach(p => p.remove())`);
  await sleep(500);

  // 5. Batch selection
  await evaluate(`
    (() => {
      const icons = window.__BOBCORN_DB__.getIconList();
      const ids = icons.map(i => String(i.id)).slice(0, 200);
      if (ids.length) window.__BOBCORN_STORE__.getState().selectAllIcons(ids);
    })()
  `);
  await sleep(800);
  shot('05-batch.png');
  await evaluate(`window.__BOBCORN_STORE__.getState().clearBatchSelection()`);
  await sleep(300);

  console.log(`  ✅ ${lang} done\n`);
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎬 Bobcorn screenshot automation\n');

  // 1. Clean start
  killApp();
  await sleep(1000);
  await startApp();
  console.log('  App started');

  // 2. Connect
  const page = await findPageTarget();
  console.log(`  Target: ${page.title}`);
  const cdp = await cdpConnect(page.webSocketDebuggerUrl);
  console.log('  CDP connected');

  // 3. Wait for store
  for (let i = 0; i < 30; i++) {
    const ok = await cdp
      .evaluate(`typeof window.__BOBCORN_STORE__?.getState === 'function'`)
      .catch(() => false);
    if (ok) break;
    await sleep(500);
  }
  await sleep(1000);
  console.log('  Store ready');

  // 4. Load project
  if (OPTS.project) {
    console.log(`  Loading: ${path.basename(OPTS.project)}`);
    await cdp.evaluate(`
      (() => {
        const data = window.electronAPI.readFileSync(${JSON.stringify(OPTS.project)});
        window.__BOBCORN_DB__.initNewProjectFromData(new Uint8Array(data));
        const s = window.__BOBCORN_STORE__.getState();
        s.showSplashScreen(false);
        s.setCurrentFilePath(${JSON.stringify(OPTS.project)});
        s.markClean();
        s.syncLeft();
        s.selectGroup('resource-all');
      })()
    `);
    await sleep(2000);
    console.log('  Project loaded');
  }

  // 5. Get window ID
  focusWindow();
  await sleep(500);
  const windowId = getWindowId();
  console.log(`  Window ID: ${windowId}\n`);

  // 6. Capture
  const langs = OPTS.lang ? [OPTS.lang] : ['en', 'zh-CN'];
  for (const lang of langs) {
    console.log(`📷 Capturing ${lang}...`);
    await captureSet(cdp.evaluate, windowId, lang);
  }

  // 7. Cleanup
  cdp.ws.close();
  killApp();
  console.log(`🎉 Done! → ${OPTS.out}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  killApp();
  process.exit(1);
});
