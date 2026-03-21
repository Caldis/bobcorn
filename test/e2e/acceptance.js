/**
 * Bobcorn Acceptance Test Suite
 *
 * Automated E2E acceptance test that verifies:
 * 1. App launches successfully on Electron
 * 2. React renders into #root
 * 3. Splash screen displays correctly
 * 4. Main workspace renders after "新建项目"
 * 5. UI layout consistency (3-column layout, toolbar, window controls)
 * 6. Zero page/console errors
 * 7. Security settings (nodeIntegration, no remote)
 *
 * Run: node test/e2e/acceptance.js
 */

const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const screenshotDir = path.join(__dirname, '../../screenshots');
const results = [];

function assert(name, condition, detail) {
  const status = condition ? 'PASS' : 'FAIL';
  results.push({ name, status, detail });
  console.log(`  [${status}] ${name}${detail ? ' — ' + detail : ''}`);
  return condition;
}

async function run() {
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  console.log('\n=== Bobcorn Acceptance Test ===\n');

  // --- Phase 1: Launch ---
  console.log('Phase 1: Launch');
  const app = await electron.launch({
    args: [path.join(__dirname, '../..')],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const window = await app.firstWindow();

  const pageErrors = [];
  const consoleErrors = [];
  window.on('pageerror', err => pageErrors.push(err.message));
  window.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await window.waitForLoadState('load');
  await window.waitForTimeout(3000);

  const title = await window.title();
  assert('Window title', title === 'Bobcorn', title);

  const electronVersion = await app.evaluate(({ app }) => process.versions.electron);
  assert('Electron version ≥ 28', parseInt(electronVersion) >= 28, `v${electronVersion}`);

  const size = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win.getSize();
  });
  assert('Window size ≥ 1080x640', size[0] >= 1080 && size[1] >= 640, `${size[0]}x${size[1]}`);

  // --- Phase 2: React Rendering ---
  console.log('\nPhase 2: React Rendering');
  const domState = await window.evaluate(() => {
    const root = document.getElementById('root');
    return {
      rootExists: !!root,
      hasContent: root ? root.innerHTML.length > 0 : false,
      childCount: root ? root.childNodes.length : 0,
    };
  });
  assert('React root exists', domState.rootExists);
  assert('React rendered content', domState.hasContent, `${domState.childCount} children`);

  const security = await window.evaluate(() => ({
    nodeIntegration: typeof require !== 'undefined',
    hasElectronAPI: typeof window.electronAPI !== 'undefined',
  }));
  assert('nodeIntegration disabled (secure)', !security.nodeIntegration);
  assert('contextBridge API available', security.hasElectronAPI);

  // --- Phase 3: Splash Screen ---
  console.log('\nPhase 3: Splash Screen');
  await window.screenshot({ path: path.join(screenshotDir, 'accept-01-splash.png') });

  const splashText = await window.locator('text=欢迎使用').count();
  assert('Splash "欢迎使用" visible', splashText > 0);

  const newProjectBtn = window.locator('button:has-text("启动新项目")');
  const openProjectBtn = window.locator('button:has-text("打开项目文件")');
  assert('New project button visible', await newProjectBtn.isVisible());
  assert('Open project button visible', await openProjectBtn.isVisible());

  // --- Phase 4: Main Workspace ---
  console.log('\nPhase 4: Main Workspace');
  await newProjectBtn.click();
  await window.waitForTimeout(2000);
  await window.screenshot({ path: path.join(screenshotDir, 'accept-02-workspace.png') });

  const sideMenu = await window.locator('text=全部').count();
  const iconGrid = await window.locator('#iconGridLocalContainer').count();
  assert('Side menu rendered', sideMenu > 0);
  assert('Icon grid rendered', iconGrid > 0);

  const menuItems = await window.locator('text=全部').count() + await window.locator('text=未分组').count() + await window.locator('text=回收站').count();
  assert('Menu items present (全部/未分组/回收站)', menuItems >= 3, `${menuItems} items`);

  const toolbar = await window.locator('text=导入').count();
  assert('Toolbar "导入" visible', toolbar > 0);

  const exportBtn = await window.locator('text=导出').count();
  assert('Toolbar "导出" visible', exportBtn > 0);

  // --- Phase 5: Window Controls (Win32) ---
  console.log('\nPhase 5: Window Controls');
  const titleBarBtns = await window.locator('#titleBarButtonGroup button').count();
  assert('Window control buttons', titleBarBtns === 3, `${titleBarBtns} buttons`);

  // --- Phase 6: UI Aesthetics ---
  console.log('\nPhase 6: UI Aesthetics');
  const cssLoaded = await window.evaluate(() => {
    const sheets = document.styleSheets;
    return sheets.length;
  });
  assert('Stylesheets loaded', cssLoaded >= 2, `${cssLoaded} sheets`);

  const uiComponentsLoaded = await window.locator('button').count();
  assert('UI components rendered', uiComponentsLoaded > 0);

  const emptyHints = await window.locator('text=还没有图标').count();
  assert('Empty state hint visible', emptyHints > 0);

  // --- Phase 7: Error Check ---
  console.log('\nPhase 7: Error Check');
  await window.waitForTimeout(1000);
  assert('Zero page errors', pageErrors.length === 0, pageErrors.length > 0 ? pageErrors[0] : '');
  // Filter out known non-critical warnings from consoleErrors
  const realErrors = consoleErrors.filter(e => !e.includes('Electron Security Warning'));
  assert('Zero console errors', realErrors.length === 0, realErrors.length > 0 ? realErrors[0] : '');

  // --- Summary ---
  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ✗ ${r.name}${r.detail ? ': ' + r.detail : ''}`);
    });
  }

  await window.screenshot({ path: path.join(screenshotDir, 'accept-03-final.png') });
  await app.close();

  console.log(`\nScreenshots saved to screenshots/`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
