const { _electron: electron } = require('playwright');
const path = require('path');

const screenshotDir = path.join(__dirname, '../../screenshots');

async function run() {
  const app = await electron.launch({
    args: [path.join(__dirname, '../../app')],
    env: { ...process.env, NODE_ENV: 'production' },
  });

  const window = await app.firstWindow();
  window.on('pageerror', err => console.log('[ERROR]', err.message));
  await window.waitForLoadState('load');
  await window.waitForTimeout(3000);

  // Screenshot splash screen
  await window.screenshot({ path: path.join(screenshotDir, '10-splash.png') });
  console.log('1. Splash screen captured');

  // Click "启动新项目"
  const newProjectBtn = window.locator('button:has-text("启动新项目")');
  if (await newProjectBtn.isVisible()) {
    await newProjectBtn.click();
    await window.waitForTimeout(2000);
    await window.screenshot({ path: path.join(screenshotDir, '11-main-view.png') });
    console.log('2. Main view after new project captured');
  }

  // Try expanding menu items
  const menuItems = await window.locator('.ant-menu-submenu-title').all();
  if (menuItems.length > 0) {
    await menuItems[0].click();
    await window.waitForTimeout(1000);
    await window.screenshot({ path: path.join(screenshotDir, '12-menu-expanded.png') });
    console.log('3. Menu expanded captured');
  }

  // Look for the grid/workspace area
  await window.waitForTimeout(1000);
  await window.screenshot({ path: path.join(screenshotDir, '13-workspace.png') });
  console.log('4. Workspace captured');

  console.log('\nAll flow screenshots saved!');
  await app.close();
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
