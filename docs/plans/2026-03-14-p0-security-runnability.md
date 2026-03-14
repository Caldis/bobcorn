# P0: Security & Basic Runnability — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical security vulnerabilities and unblock running on modern Node.js, while establishing ATDD testing infrastructure to guarantee no regressions.

**Architecture:** Incremental upgrades within the existing Babel 6 + Webpack 4 build system. Electron upgraded to latest compatible version with explicit `nodeIntegration: true` / `contextIsolation: false` to maintain current behavior (proper isolation deferred to P2). SVG sanitization via DOMPurify. Testing via Playwright Electron + Jest.

**Tech Stack:** Electron 28, sass (dart-sass), DOMPurify, Playwright, Jest

---

## Dependency Graph

```
Task 1 (Testing Infra) ──────────────────────────────────┐
Task 2 (node-sass → sass) ───┐                           │
Task 3 (SVG sanitization) ───┤── can run in parallel ────┤
                              │                           │
                              ▼                           │
Task 4 (Electron upgrade) ←── needs build working        │
                              │                           │
                              ▼                           │
Task 5 (webSecurity fix) ←── needs Electron upgrade      │
                              │                           │
                              ▼                           ▼
Task 6 (E2E verification) ←── needs everything done
```

**Parallel streams:** Tasks 1, 2, 3 are independent and can execute concurrently.

---

## Task 1: Testing Infrastructure (ATDD Foundation)

**Files:**
- Create: `test/e2e/app.spec.js`
- Create: `test/e2e/playwright.config.js`
- Create: `test/unit/database.test.js`
- Modify: `package.json` (add test scripts and devDependencies)

**Step 1: Install test dependencies**

```bash
# In bobcorn root, using Node 14 via fnm
npm install --save-dev playwright @playwright/test jest babel-jest electron-playwright-helpers
```

Note: Playwright's Electron support allows launching and testing the app directly.

**Step 2: Create Playwright config**

Create `test/e2e/playwright.config.js`:
```js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 0,
  use: {
    trace: 'on-first-retry',
  },
});
```

**Step 3: Write baseline acceptance tests**

Create `test/e2e/app.spec.js`:
```js
const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

let electronApp;
let window;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../app/main.prod.js')],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  if (electronApp) await electronApp.close();
});

test('app window opens with correct title', async () => {
  const title = await window.title();
  expect(title).toBeTruthy();
});

test('splash screen is visible on launch', async () => {
  // SplashScreen component should render on first launch
  const splashOrMain = await window.locator('.SplashScreen, [class*="splashScreen"], [class*="MainContainer"], [class*="mainContainer"]').first();
  await expect(splashOrMain).toBeVisible({ timeout: 10000 });
});

test('app window has minimum dimensions', async () => {
  const size = await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win.getSize();
  });
  expect(size[0]).toBeGreaterThanOrEqual(1080);
  expect(size[1]).toBeGreaterThanOrEqual(640);
});

test('webSecurity is not disabled', async () => {
  const webSecurity = await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win.webContents.getWebPreferences().webSecurity;
  });
  // After P0 Task 5, this should be true (or undefined = default true)
  // Initially this will FAIL — that's expected, it's our target
  expect(webSecurity).not.toBe(false);
});
```

**Step 4: Write database unit tests**

Create `test/unit/database.test.js`:
```js
// Unit tests for the database layer
// These validate core data operations survive the upgrade

const path = require('path');

// Database is ES module with babel, so we test via integration
// For now, create smoke test structure
describe('Database module', () => {
  test('placeholder - database tests will be added after babel-jest setup', () => {
    expect(true).toBe(true);
  });
});
```

**Step 5: Add test scripts to package.json**

Add to `package.json` scripts:
```json
"test": "jest",
"test:e2e": "npx playwright test --config test/e2e/playwright.config.js",
"test:unit": "jest test/unit"
```

**Step 6: Commit**

```bash
git add test/ package.json
git commit -m "test: add ATDD testing infrastructure with Playwright E2E and Jest"
```

---

## Task 2: Replace node-sass with sass (dart-sass)

**Files:**
- Modify: `package.json` (swap dependency)
- No webpack config changes needed (sass-loader detects sass automatically)

**Step 1: Uninstall node-sass, install sass**

```bash
npm uninstall node-sass
npm install --save-dev sass
```

**Step 2: Verify build succeeds**

```bash
npm run build
```

Expected: Build completes without node-sass binary errors. sass-loader 7.x auto-detects `sass` package.

**Step 3: Verify app starts**

```bash
npm start
```

Expected: App opens with correct styles.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix: replace node-sass with sass (dart-sass) for modern Node compatibility"
```

---

## Task 3: SVG Sanitization (Fix dangerouslySetInnerHTML XSS)

**Files:**
- Modify: `app/components/IconBlock/index.js:36`
- Create: `app/utils/sanitize.js`
- Modify: `app/package.json` (add dompurify dependency)

**Step 1: Install DOMPurify**

```bash
cd app && npm install dompurify && cd ..
```

Note: Install in `app/` since it's a runtime dependency used in the renderer process.

**Step 2: Create sanitize utility**

Create `app/utils/sanitize.js`:
```js
import DOMPurify from 'dompurify';

// Allow SVG elements and attributes needed for icon display
const PURIFY_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: ['use'],
  ADD_ATTR: ['xlink:href', 'xml:space'],
};

export function sanitizeSVG(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}
```

**Step 3: Update IconBlock to use sanitizer**

Modify `app/components/IconBlock/index.js`:

Replace line 36:
```js
<div className={style.iconContentWrapper} dangerouslySetInnerHTML={{__html: this.props.content}} />
```
With:
```js
<div className={style.iconContentWrapper} dangerouslySetInnerHTML={{__html: sanitizeSVG(this.props.content)}} />
```

Add import at top:
```js
import { sanitizeSVG } from '../../../utils/sanitize';
```

Wait — the relative path from `app/components/IconBlock/` to `app/utils/sanitize.js` is `../../utils/sanitize`.

Correct import:
```js
import { sanitizeSVG } from '../../utils/sanitize';
```

**Step 4: Verify build and SVG rendering**

```bash
npm run build && npm start
```

Expected: App opens, icons render correctly (DOMPurify preserves valid SVG).

**Step 5: Commit**

```bash
git add app/utils/sanitize.js app/components/IconBlock/index.js app/package.json
git commit -m "security: sanitize SVG content with DOMPurify to prevent XSS"
```

---

## Task 4: Electron Upgrade (2.x → 28.x)

This is the largest task. Electron 28 is chosen because:
- LTS support, well-tested
- Node 18 runtime (compatible with our deps)
- Still supports `nodeIntegration: true` (needed for current code pattern)
- Fixes all known CVEs from Electron 2

**Files:**
- Modify: `package.json` (electron, electron-builder, electron-devtools-installer versions)
- Modify: `app/main.dev.js` (window creation, API changes)
- Modify: `app/menu.js` (deprecated API: `popup` signature changed)
- Modify: `webpack.config.renderer.dev.js` (remove deprecated devServer options)

### Step 1: Upgrade electron and related packages

```bash
npm install --save-dev electron@28 electron-builder@24 electron-devtools-installer@3
```

Also remove deprecated devtron:
```bash
npm uninstall devtron
```

### Step 2: Update main.dev.js for Electron 28 API

Replace `app/main.dev.js` with:
```js
/* eslint global-require: 0, flowtype-errors/show-errors: 0 */
import os from 'os';
import { app, BrowserWindow } from 'electron';
import MenuBuilder from './menu';

let mainWindow = null;
const platform = os.platform();

if (process.env.NODE_ENV === 'production') {
    const sourceMapSupport = require('source-map-support');
    sourceMapSupport.install();
}

if (
    process.env.NODE_ENV === 'development' ||
    process.env.DEBUG_PROD === 'true'
) {
    require('electron-debug')();
    const path = require('path');
    const p = path.join(__dirname, '..', 'app', 'node_modules');
    require('module').globalPaths.push(p);
}

const installExtensions = async () => {
    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ['REACT_DEVELOPER_TOOLS'];

    return Promise.all(
        extensions.map(name => installer.default(installer[name], forceDownload))
    ).catch(console.log);
};

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('ready', async () => {
    if (
        process.env.NODE_ENV === 'development' ||
        process.env.DEBUG_PROD === 'true'
    ) {
        await installExtensions();
    }

    mainWindow = new BrowserWindow({
        show: false,
        width: 1200,
        minWidth: 1080,
        height: 800,
        minHeight: 640,
        hasShadow: true,
        transparent: false,
        frame: platform === "darwin",
        titleBarStyle: platform === "darwin" ? 'hiddenInset' : 'hidden',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            experimentalFeatures: true,
            // webSecurity stays true (default) — fixed in Task 5
        }
    });

    mainWindow.loadURL(`file://${__dirname}/app.html`);

    mainWindow.webContents.on('did-finish-load', () => {
        if (!mainWindow) {
            throw new Error('"mainWindow" is not defined');
        }
        mainWindow.show();
        mainWindow.focus();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    const menuBuilder = new MenuBuilder(mainWindow);
    menuBuilder.buildMenu();
});
```

Key changes:
- Added `nodeIntegration: true` (was implicit in Electron 2, now must be explicit)
- Added `contextIsolation: false` (was implicit in Electron 2, default changed to true in Electron 12+)
- Removed `webSecurity: false` (this IS the fix for Task 5)
- Removed `REDUX_DEVTOOLS` from extensions (app doesn't use Redux)

### Step 3: Update menu.js for Electron 28 API

In `app/menu.js`, line 40, `popup()` signature changed:

Replace:
```js
}).popup(this.mainWindow);
```
With:
```js
}).popup({ window: this.mainWindow });
```

### Step 4: Update electron-builder config in package.json

Update the `"build"` section in `package.json`:
```json
"build": {
    "productName": "Bobcorn",
    "appId": "me.caldis.bobcorn",
    "asar": true,
    "files": [
        "dist/",
        "node_modules/",
        "app.html",
        "resources/",
        "main.prod.js",
        "main.prod.js.map",
        "package.json"
    ],
    "dmg": {
        "contents": [
            { "x": 130, "y": 220 },
            { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
        ]
    },
    "mac": {
        "identity": null,
        "target": ["dmg"]
    },
    "win": {
        "target": ["nsis"]
    },
    "linux": {
        "target": ["deb", "AppImage"]
    },
    "directories": {
        "buildResources": "resources",
        "output": "release"
    }
}
```

Remove `"sign": false` from dmg (deprecated in electron-builder 24).

### Step 5: Build and verify

```bash
npm run build
npm start
```

Expected: App opens with Electron 28 runtime. Check DevTools → Application → Electron version shows 28.x.

### Step 6: Commit

```bash
git add package.json app/main.dev.js app/menu.js
git commit -m "security: upgrade Electron 2→28, fix nodeIntegration/contextIsolation defaults"
```

---

## Task 5: Verify webSecurity Fix

webSecurity was already fixed in Task 4 (removed `webSecurity: false` from main.dev.js). This task verifies it.

**Step 1: Verify webSecurity is enabled**

```bash
npm start
```

Open DevTools console and try:
```js
// This should fail with CORS error if webSecurity is properly enabled
fetch('https://httpbin.org/get').then(r => r.json()).then(console.log).catch(console.error)
```

Expected: CORS error (not a successful response).

**Step 2: Verify app functionality is unaffected**

Test that all core features work without webSecurity disabled:
- Create new project
- Import SVG icons
- View icons in grid
- Export icon fonts

The app uses `file://` protocol and reads local files via Node.js `fs` module (not fetch), so disabling webSecurity was never necessary.

**Step 3: Commit verification note**

```bash
git commit --allow-empty -m "verify: webSecurity enabled, CORS enforcement confirmed"
```

---

## Task 6: Full E2E Acceptance Verification

**Step 1: Build production version**

```bash
npm run build
```

**Step 2: Run E2E test suite**

```bash
npm run test:e2e
```

Expected: All tests pass, including the webSecurity check.

**Step 3: Manual smoke test checklist**

Run `npm start` and verify:
- [ ] App window opens at correct size (1200x800)
- [ ] Splash screen / welcome screen appears
- [ ] Can create a new project
- [ ] Can import SVG file(s) via drag-and-drop or dialog
- [ ] Icons display correctly in grid (SVG rendering works post-sanitization)
- [ ] Can select an icon and see details in editor
- [ ] Can rename an icon
- [ ] Can create and manage groups
- [ ] Can export icon fonts (SVG/TTF/WOFF/WOFF2/EOT)
- [ ] Demo page generation works
- [ ] Windows title bar buttons work (minimize/maximize/close)
- [ ] Menu items are functional
- [ ] No console errors related to security policy

**Step 4: Final commit and tag**

```bash
git tag p0-complete
git push origin master --tags
```

---

## Success Criteria

| Item | Metric |
|------|--------|
| node-sass eliminated | `npm ls node-sass` returns empty |
| sass works | `npm run build` succeeds |
| Electron ≥ 28 | DevTools shows Electron 28.x |
| webSecurity enabled | CORS fetch fails in renderer |
| SVG sanitized | `DOMPurify.sanitize()` wraps all SVG insertion |
| E2E tests pass | `npm run test:e2e` exits 0 |
| All features work | Manual smoke test checklist complete |
