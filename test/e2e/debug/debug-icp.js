const { _electron: electron } = require('playwright');
const path = require('path');

(async () => {
  const app = await electron.launch({ args: [path.join(__dirname, '../..')], env: { ...process.env, NODE_ENV: 'production' } });
  const win = await app.firstWindow();
  await win.waitForLoadState('load');
  await win.waitForTimeout(3000);

  // Click 启动新项目
  await win.locator('button:has-text("启动新项目")').click();
  await win.waitForTimeout(2000);

  // Mock dialog for ICP import
  const icpPath = path.resolve(__dirname, '../fixtures/iconfont/iconfontV8.2/iconfont.icp');
  console.log('ICP path:', icpPath);

  await app.evaluate(({ dialog }, p) => {
    const orig = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => { dialog.showOpenDialog = orig; return { canceled: false, filePaths: [p] }; };
  }, icpPath);

  // Click 导入 button
  await win.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) { if (b.textContent.includes('导入')) { b.click(); break; } }
  });
  await win.waitForTimeout(500);

  // Click 导入项目 in dropdown
  await win.evaluate(() => {
    const items = document.querySelectorAll('.ant-dropdown-menu-item');
    for (const item of items) { if (item.textContent.includes('导入项目')) { item.click(); break; } }
  });
  await win.waitForTimeout(1000);

  // Handle confirm dialog
  const confirmBtn = win.locator('.ant-modal .ant-btn-primary');
  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('Confirm dialog found, clicking...');
    await confirmBtn.click();
  }
  await win.waitForTimeout(3000);

  // Screenshot
  await win.screenshot({ path: path.join(__dirname, '../../screenshots/debug-icp-loaded.png') });

  // Check how many groups loaded
  const info = await win.evaluate(() => {
    const menuItems = document.querySelectorAll('.ant-menu-item');
    const subMenuTitles = document.querySelectorAll('.ant-menu-submenu-title');

    // Get sideMenuContainer children
    const mc = Array.from(document.querySelectorAll('div')).find(d => d.className.includes('sideMenuContainer'));
    const ioBtn = Array.from(document.querySelectorAll('div')).find(d => d.className.includes('sideIOButton'));

    return {
      menuItemCount: menuItems.length,
      subMenuCount: subMenuTitles.length,
      menuTexts: Array.from(menuItems).map(el => el.textContent.substring(0, 25)),
      containerBottom: mc ? Math.round(mc.getBoundingClientRect().bottom) : null,
      ioPadding: ioBtn ? window.getComputedStyle(ioBtn).padding : 'not found',
      ioBottom: ioBtn ? Math.round(ioBtn.getBoundingClientRect().bottom) : null,
      windowH: window.innerHeight,
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await app.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
