/**
 * CSS Module Class Integrity Test
 *
 * Prevents CSS module class names from silently becoming empty strings
 * at runtime due to Vite CSS modules configuration issues (e.g.,
 * localsConvention: 'camelCaseOnly' dropping kebab-case originals).
 *
 * Checks:
 *   1. Critical elements exist with non-empty className
 *   2. Key layout computed styles are correct
 *   3. Content presence after ICP import (groups, button area)
 *   4. Screenshots saved for visual inspection
 *
 * Run: npx electron-vite build && node test/e2e/css-integrity.js
 */

const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

// ── Paths ────────────────────────────────────────────────────────────────────
const projectRoot = path.join(__dirname, '../..');
const screenshotDir = path.join(projectRoot, 'screenshots/css-integrity');
const icpFixturePath = path.resolve(
  __dirname,
  '../fixtures/iconfont/iconfontV8.2/iconfont.icp'
);

// ── Helpers ──────────────────────────────────────────────────────────────────
const results = [];

function assert(name, condition, detail) {
  const status = condition ? 'PASS' : 'FAIL';
  results.push({ name, status, detail });
  console.log(`  [${status}] ${name}${detail ? ' -- ' + detail : ''}`);
  return condition;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let stepNum = 0;
async function screenshot(win, name) {
  const filename = `${String(++stepNum).padStart(2, '0')}-${name}.png`;
  await win.screenshot({ path: path.join(screenshotDir, filename) });
  console.log(`    [screenshot] ${filename}`);
}

// ── Main Test ────────────────────────────────────────────────────────────────
async function run() {
  if (!fs.existsSync(screenshotDir))
    fs.mkdirSync(screenshotDir, { recursive: true });

  // Clean old screenshots
  for (const f of fs.readdirSync(screenshotDir)) {
    if (f.endsWith('.png')) fs.unlinkSync(path.join(screenshotDir, f));
  }

  console.log('\n=== CSS Module Class Integrity Test ===\n');

  // Verify fixture exists
  if (!fs.existsSync(icpFixturePath)) {
    console.error(`FATAL: ICP fixture not found at ${icpFixturePath}`);
    process.exit(2);
  }

  // ── Launch ─────────────────────────────────────────────────────────────────
  console.log('[Launch] Starting Electron app...');
  const app = await electron.launch({
    args: [projectRoot],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const win = await app.firstWindow();

  const pageErrors = [];
  win.on('pageerror', (e) => pageErrors.push(e.message));

  await win.waitForLoadState('load');
  await sleep(3000);

  try {
    // ════════════════════════════════════════════════════════════════════════
    // PHASE 1: Start new project
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[Phase 1] Start new project');
    const newProjectBtn = win.locator('button:has-text("启动新项目")');
    await newProjectBtn.click();
    await sleep(2000);
    await screenshot(win, 'empty-workspace');

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 2: Import ICP project
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[Phase 2] Import ICP project');

    // Mock dialog.showOpenDialog to return ICP file
    await app.evaluate(({ dialog }, icpPath) => {
      const original = dialog.showOpenDialog;
      dialog.showOpenDialog = async () => {
        dialog.showOpenDialog = original;
        return { canceled: false, filePaths: [icpPath] };
      };
    }, icpFixturePath);

    // Click Import dropdown -> 导入项目
    const importBtn = win.locator('button:has-text("导入")').first();
    await importBtn.click();
    await sleep(800);

    const importProjItem = win
      .locator(
        '.ant-dropdown-menu-item:has-text("导入项目"), .ant-menu-item:has-text("导入项目")'
      )
      .first();
    await importProjItem.click({ timeout: 5000 });
    await sleep(2000);

    // Handle confirmation dialog
    const confirmDialogVisible = await win
      .locator('.ant-modal-confirm')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    console.log(`    Confirm dialog visible: ${confirmDialogVisible}`);

    if (confirmDialogVisible) {
      await win.evaluate(() => {
        const btns = document.querySelectorAll('.ant-btn-primary');
        for (const btn of btns) {
          if (btn.offsetParent !== null) {
            btn.click();
            return;
          }
        }
      });
      await sleep(5000); // Wait for ICP load + React re-render
    }

    // Click "全部" to make sure all icons are visible
    await win.evaluate(() => {
      const items = document.querySelectorAll('.ant-menu-item');
      for (const item of items) {
        if (item.textContent.includes('全部')) {
          item.click();
          return;
        }
      }
    });
    await sleep(2000);

    await screenshot(win, 'after-icp-import');

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 3: Check critical elements exist with non-empty className
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[Phase 3] CSS class existence checks');

    const classSelectors = [
      'mainContainer',
      'sideMenuContainer',
      'sideMenuWrapper',
      'sideIOButtonContainer',
      'iconGridLocalContainer',
      'iconToolbarOuterContainer',
      'iconContainZone',
    ];

    for (const selector of classSelectors) {
      const info = await win.evaluate((sel) => {
        const el = document.querySelector(`[class*="${sel}"]`);
        if (!el) return { found: false };
        return {
          found: true,
          className: el.className,
          classNameEmpty: el.className.trim() === '',
          tagName: el.tagName,
        };
      }, selector);

      assert(
        `[class*="${selector}"] exists`,
        info.found,
        info.found
          ? `tag=${info.tagName}, class="${info.className.substring(0, 60)}"`
          : 'NOT FOUND'
      );

      if (info.found) {
        assert(
          `[class*="${selector}"] className is not empty`,
          !info.classNameEmpty,
          info.classNameEmpty ? 'className is empty string!' : 'OK'
        );
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 4: Check critical layout computed styles
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[Phase 4] Layout computed style checks');

    // mainContainer: display=flex, height=100%
    const mainStyles = await win.evaluate(() => {
      const el = document.querySelector('[class*="mainContainer"]');
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        display: cs.display,
        height: cs.height,
        rectHeight: rect.height,
        windowHeight: window.innerHeight,
      };
    });

    if (mainStyles) {
      assert(
        'mainContainer display=flex',
        mainStyles.display === 'flex',
        `display=${mainStyles.display}`
      );
      // height should fill viewport (within 5px tolerance)
      assert(
        'mainContainer height fills viewport',
        Math.abs(mainStyles.rectHeight - mainStyles.windowHeight) < 5,
        `height=${mainStyles.rectHeight.toFixed(0)}px, viewport=${mainStyles.windowHeight}px`
      );
    } else {
      assert('mainContainer exists for style check', false, 'Element not found');
    }

    // sideMenuContainer: display=flex, flexDirection=column
    const sideMenuStyles = await win.evaluate(() => {
      const el = document.querySelector('[class*="sideMenuContainer"]');
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      return {
        display: cs.display,
        flexDirection: cs.flexDirection,
      };
    });

    if (sideMenuStyles) {
      assert(
        'sideMenuContainer display=flex',
        sideMenuStyles.display === 'flex',
        `display=${sideMenuStyles.display}`
      );
      assert(
        'sideMenuContainer flexDirection=column',
        sideMenuStyles.flexDirection === 'column',
        `flexDirection=${sideMenuStyles.flexDirection}`
      );
    } else {
      assert(
        'sideMenuContainer exists for style check',
        false,
        'Element not found'
      );
    }

    // sideMenuWrapper: overflow-y=auto
    const sideMenuWrapperStyles = await win.evaluate(() => {
      const el = document.querySelector('[class*="sideMenuWrapper"]');
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      return {
        overflowY: cs.overflowY,
      };
    });

    if (sideMenuWrapperStyles) {
      assert(
        'sideMenuWrapper overflow-y=auto',
        sideMenuWrapperStyles.overflowY === 'auto',
        `overflow-y=${sideMenuWrapperStyles.overflowY}`
      );
    } else {
      assert(
        'sideMenuWrapper exists for style check',
        false,
        'Element not found'
      );
    }

    // iconGridLocalContainer: height fills parent (100%)
    const iconGridStyles = await win.evaluate(() => {
      const el = document.querySelector('[class*="iconGridLocalContainer"]');
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        height: cs.height,
        rectHeight: rect.height,
      };
    });

    if (iconGridStyles) {
      // height should be substantial (not collapsed)
      assert(
        'iconGridLocalContainer has substantial height',
        iconGridStyles.rectHeight > 200,
        `height=${iconGridStyles.rectHeight.toFixed(0)}px`
      );
    } else {
      assert(
        'iconGridLocalContainer exists for style check',
        false,
        'Element not found'
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 5: Content presence checks (after ICP load)
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[Phase 5] Content presence checks (post-ICP import)');

    // Group list should have > 5 .ant-menu-item entries
    const menuItemCount = await win.locator('.ant-menu-item').count();
    assert(
      'Group list has >5 menu items',
      menuItemCount > 5,
      `found ${menuItemCount} .ant-menu-item elements`
    );

    // sideIOButtonContainer padding is not "0px"
    const ioButtonStyles = await win.evaluate(() => {
      const el = document.querySelector('[class*="sideIOButtonContainer"]');
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      return {
        padding: cs.padding,
        paddingTop: cs.paddingTop,
        paddingBottom: cs.paddingBottom,
      };
    });

    if (ioButtonStyles) {
      const allZero =
        ioButtonStyles.paddingTop === '0px' &&
        ioButtonStyles.paddingBottom === '0px';
      assert(
        'sideIOButtonContainer padding is not all zero',
        !allZero,
        `padding: ${ioButtonStyles.padding}`
      );
    } else {
      assert(
        'sideIOButtonContainer exists for padding check',
        false,
        'Element not found'
      );
    }

    // sideIOButtonContainer is within viewport (bottom <= windowHeight)
    const ioButtonPosition = await win.evaluate(() => {
      const el = document.querySelector('[class*="sideIOButtonContainer"]');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        windowHeight: window.innerHeight,
      };
    });

    if (ioButtonPosition) {
      // Allow 2px tolerance for sub-pixel rounding
      assert(
        'sideIOButtonContainer bottom within viewport',
        ioButtonPosition.bottom <= ioButtonPosition.windowHeight + 2,
        `bottom=${ioButtonPosition.bottom.toFixed(1)}px, viewport=${ioButtonPosition.windowHeight}px`
      );
    } else {
      assert(
        'sideIOButtonContainer exists for position check',
        false,
        'Element not found'
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 6: Final screenshot
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[Phase 6] Final screenshots');
    await screenshot(win, 'final-state');
  } finally {
    // ── Summary ──────────────────────────────────────────────────────────
    console.log('\n====================================================');
    console.log('  CSS INTEGRITY TEST SUMMARY');
    console.log('====================================================');
    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    console.log(`  Total:  ${results.length}`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log('----------------------------------------------------');
    results.forEach((r) => {
      const icon = r.status === 'PASS' ? '[OK]' : '[XX]';
      console.log(
        `  ${icon} ${r.name}${r.detail ? ' -- ' + r.detail : ''}`
      );
    });
    console.log('====================================================');

    const screenshots = fs
      .readdirSync(screenshotDir)
      .filter((f) => f.endsWith('.png'));
    console.log(`\n  Screenshots: ${screenshots.length} saved to screenshots/css-integrity/`);
    screenshots.forEach((s) => console.log(`    - ${s}`));

    await app.close().catch(() => {});

    process.exit(failed > 0 ? 1 : 0);
  }
}

run().catch((e) => {
  console.error('\nFATAL ERROR:', e.message);
  console.error(e.stack);
  process.exit(2);
});
