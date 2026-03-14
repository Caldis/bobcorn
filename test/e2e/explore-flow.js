/**
 * Explore the full Bobcorn user flow via Playwright.
 * Captures screenshots at every interaction step to map the complete UX.
 */
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const screenshotDir = path.join(__dirname, '../../screenshots/flow');
const fixtureDir = path.join(__dirname, '../fixtures/icons');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function screenshot(win, name) {
  await win.screenshot({ path: path.join(screenshotDir, `${name}.png`) });
  console.log(`  [screenshot] ${name}.png`);
}

async function run() {
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  console.log('=== Bobcorn Full Flow Exploration ===\n');

  const app = await electron.launch({
    args: [path.join(__dirname, '../..')],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const win = await app.firstWindow();
  win.on('pageerror', e => console.log('[PAGE ERROR]', e.message.substring(0, 150)));
  await win.waitForLoadState('load');
  await sleep(3000);

  // === STEP 1: Splash Screen ===
  console.log('Step 1: Splash Screen');
  await screenshot(win, '01-splash');

  // Check what's on the splash screen
  const splashInfo = await win.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.map(b => ({ text: b.textContent, visible: b.offsetParent !== null }));
  });
  console.log('  Buttons:', JSON.stringify(splashInfo));

  // === STEP 2: Create New Project ===
  console.log('\nStep 2: Click "启动新项目"');
  await win.locator('button:has-text("启动新项目")').click();
  await sleep(2000);
  await screenshot(win, '02-new-project');

  // === STEP 3: Explore empty state ===
  console.log('\nStep 3: Empty workspace');
  const emptyInfo = await win.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasMenu: text.includes('全部'),
      hasEmptyHint: text.includes('还没有图标') || text.includes('拖拽'),
      hasToolbar: text.includes('导入') && text.includes('导出'),
    };
  });
  console.log('  Empty state:', JSON.stringify(emptyInfo));

  // === STEP 4: Create a group ===
  console.log('\nStep 4: Create group');
  const plusBtn = win.locator('button:has(.anticon-plus), button[class*="plus"]').first();
  const plusEnabled = await plusBtn.isEnabled({ timeout: 2000 }).catch(() => false);
  console.log(`  Plus button enabled: ${plusEnabled}`);
  if (plusEnabled) {
    await plusBtn.click();
    await sleep(1000);
    await screenshot(win, '04-add-group-dialog');

    // Type group name in the modal input
    const modalInput = win.locator('.ant-modal input').first();
    if (await modalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await modalInput.fill('测试分组');
      await sleep(500);
      await screenshot(win, '04b-group-name-entered');

      // Click OK
      const okBtn = win.locator('.ant-modal .ant-btn-primary').first();
      if (await okBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await okBtn.click();
        await sleep(1000);
      }
    }
  }
  await screenshot(win, '04c-after-group-created');

  // === STEP 5: Import icons via dialog (simulate file drop) ===
  console.log('\nStep 5: Import icons');
  // Click 导入 button
  const importBtn = win.locator('button:has-text("导入")').first();
  if (await importBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await importBtn.click();
    await sleep(1000);
    await screenshot(win, '05-import-menu');
  }

  // Try drag-and-drop SVG files onto the grid area
  // Playwright can't do native file drop on Electron easily,
  // so we'll use the app's database API directly via evaluate
  console.log('  Importing icons via db API...');
  const iconFiles = fs.readdirSync(fixtureDir).filter(f => f.endsWith('.svg'));
  const svgContents = iconFiles.map(f => ({
    name: f.replace('.svg', ''),
    content: fs.readFileSync(path.join(fixtureDir, f), 'utf8'),
  }));

  // Import icons through the app's exposed API or directly manipulate
  const importResult = await win.evaluate((icons) => {
    // The database is accessible through the store or global
    // Try to find the database module
    try {
      // Since contextIsolation is on, we can't access node modules directly
      // But the store and db are bundled into the renderer
      return { method: 'need-alternative', iconCount: icons.length };
    } catch(e) {
      return { error: e.message };
    }
  }, svgContents);
  console.log('  Import attempt:', JSON.stringify(importResult));

  // Alternative: try clicking the import button which opens a file dialog
  // Since we can't interact with native dialogs, let's just screenshot what we have
  await screenshot(win, '05b-after-import-attempt');

  // === STEP 6: Navigate menu items ===
  console.log('\nStep 6: Navigate menu');
  const menuItems = await win.locator('.ant-menu-item').all();
  console.log(`  Found ${menuItems.length} menu items`);
  for (let i = 0; i < Math.min(menuItems.length, 5); i++) {
    const text = await menuItems[i].textContent().catch(() => '');
    const visible = await menuItems[i].isVisible().catch(() => false);
    console.log(`  Menu[${i}]: "${text}" (visible: ${visible})`);
    if (visible && text.trim()) {
      await menuItems[i].click().catch(() => {});
      await sleep(500);
    }
  }
  await screenshot(win, '06-menu-navigation');

  // === STEP 7: Check toolbar interactions ===
  console.log('\nStep 7: Toolbar');
  // Slider
  const slider = win.locator('.ant-slider').first();
  if (await slider.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log('  Slider found');
  }
  // Search
  const searchInput = win.locator('input[placeholder*="搜索"]').first();
  if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log('  Search input found');
    await searchInput.fill('test');
    await sleep(500);
    await screenshot(win, '07-search');
    await searchInput.clear();
  }

  // === STEP 8: Export button ===
  console.log('\nStep 8: Export');
  const exportBtn = win.locator('button:has-text("导出")').first();
  if (await exportBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await exportBtn.click();
    await sleep(1000);
    await screenshot(win, '08-export-menu');
    // Close any popover by pressing Escape
    await win.keyboard.press('Escape');
    await sleep(500);
  }

  // === STEP 9: Settings ===
  console.log('\nStep 9: Settings');
  const settingsBtn = win.locator('button:has(.anticon-setting)').first();
  if (await settingsBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await settingsBtn.click();
    await sleep(1000);
    await screenshot(win, '09-settings');
    await win.keyboard.press('Escape');
    await sleep(500);
  }

  // === STEP 10: Window controls ===
  console.log('\nStep 10: Window controls');
  const windowBtns = await win.locator('[class*="titleBarButtonGroup"] button').count();
  console.log(`  Window control buttons: ${windowBtns}`);
  await screenshot(win, '10-final-state');

  // === Summary ===
  console.log('\n=== Flow Exploration Complete ===');
  const screenshots = fs.readdirSync(screenshotDir).filter(f => f.endsWith('.png'));
  console.log(`Screenshots captured: ${screenshots.length}`);
  screenshots.forEach(s => console.log(`  - ${s}`));

  await app.close();
}

run().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
