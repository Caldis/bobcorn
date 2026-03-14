/**
 * L2 Layout Assertions Test
 *
 * Verifies structural/layout properties of the Bobcorn UI:
 * - mainContainer: display=flex, flexDirection=row
 * - Three-column widths: left ~250px, right ~250px, center >500px
 * - html/body height=100%
 * - Window control buttons: exactly 3
 * - Toolbar elements: slider and search input present
 *
 * Run: node test/e2e/layout-assertions.js
 */

const { _electron: electron } = require('playwright');
const path = require('path');

const results = [];

function assert(name, condition, detail) {
  const status = condition ? 'PASS' : 'FAIL';
  results.push({ name, status, detail });
  console.log(`  [${status}] ${name}${detail ? ' — ' + detail : ''}`);
  return condition;
}

async function run() {
  console.log('\n=== L2 Layout Assertions Test ===\n');

  // Launch app
  console.log('Launching Electron...');
  const app = await electron.launch({
    args: [path.join(__dirname, '../..')],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('load');
  await window.waitForTimeout(3000);

  // Click "启动新项目" to navigate to workspace
  console.log('Navigating to workspace...\n');
  const newProjectBtn = window.locator('button:has-text("启动新项目")');
  if (await newProjectBtn.isVisible()) {
    await newProjectBtn.click();
    await window.waitForTimeout(2000);
  }

  // --- 1. mainContainer flex layout ---
  console.log('Check 1: mainContainer flex layout');
  const mainContainerStyles = await window.evaluate(() => {
    // CSS modules mangle class names, so find by partial match
    const el = document.querySelector('[class*="mainContainer"]');
    if (!el) return null;
    const cs = window.getComputedStyle(el);
    return {
      display: cs.display,
      flexDirection: cs.flexDirection,
    };
  });

  if (mainContainerStyles) {
    assert('mainContainer display=flex', mainContainerStyles.display === 'flex', mainContainerStyles.display);
    assert('mainContainer flexDirection=row', mainContainerStyles.flexDirection === 'row', mainContainerStyles.flexDirection);
  } else {
    assert('mainContainer exists', false, 'Element with class *mainContainer* not found');
  }

  // --- 2. Three-column widths ---
  console.log('\nCheck 2: Three-column widths');
  const columnWidths = await window.evaluate(() => {
    const main = document.querySelector('[class*="mainContainer"]');
    if (!main) return null;

    const children = Array.from(main.children).filter(el => {
      // Skip the modal overlay and titlebar button group
      const cls = el.className || '';
      return !cls.includes('titleBarButtonGroup') &&
             el.tagName !== 'SECTION' &&
             !cls.includes('ant-modal') &&
             el.id !== 'titleBarButtonGroup';
    });

    // The three flex columns are: sideMenu, iconContainZone, sideEditor
    // Filter to divs that are direct children and part of the layout
    const layoutDivs = children.filter(el => {
      const cls = el.className || '';
      return cls.includes('sideMenu') ||
             cls.includes('sideIconContainZone') ||
             cls.includes('sideEditor') ||
             cls.includes('FlexWrapper');
    });

    return layoutDivs.map(el => {
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        className: el.className.split(' ')[0].slice(-30), // last 30 chars for readability
        width: rect.width,
        computedWidth: cs.width,
      };
    });
  });

  if (columnWidths && columnWidths.length >= 3) {
    const leftWidth = columnWidths[0].width;
    const centerWidth = columnWidths[1].width;
    const rightWidth = columnWidths[2].width;

    assert('Left column ~250px',
      leftWidth >= 200 && leftWidth <= 300,
      `${leftWidth.toFixed(0)}px`
    );
    assert('Center column >500px',
      centerWidth > 500,
      `${centerWidth.toFixed(0)}px`
    );
    assert('Right column ~250px',
      rightWidth >= 200 && rightWidth <= 300,
      `${rightWidth.toFixed(0)}px`
    );
  } else {
    assert('Three layout columns found', false,
      `Found ${columnWidths ? columnWidths.length : 0} columns`);
  }

  // --- 3. html/body height=100% ---
  console.log('\nCheck 3: html/body height');
  const heights = await window.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const htmlCs = window.getComputedStyle(html);
    const bodyCs = window.getComputedStyle(body);
    return {
      htmlHeight: htmlCs.height,
      bodyHeight: bodyCs.height,
      windowInnerHeight: window.innerHeight,
      htmlPxHeight: html.getBoundingClientRect().height,
      bodyPxHeight: body.getBoundingClientRect().height,
    };
  });

  // html and body should fill the viewport
  assert('html height fills viewport',
    Math.abs(heights.htmlPxHeight - heights.windowInnerHeight) < 5,
    `html=${heights.htmlPxHeight.toFixed(0)}px, viewport=${heights.windowInnerHeight}px`
  );
  assert('body height fills viewport',
    Math.abs(heights.bodyPxHeight - heights.windowInnerHeight) < 5,
    `body=${heights.bodyPxHeight.toFixed(0)}px, viewport=${heights.windowInnerHeight}px`
  );

  // --- 4. Window control buttons ---
  console.log('\nCheck 4: Window control buttons');
  const titleBarBtns = await window.locator('[class*="titleBarButtonGroup"] button').count();
  assert('Window control buttons = 3', titleBarBtns === 3, `${titleBarBtns} buttons`);

  // --- 5. Toolbar elements ---
  console.log('\nCheck 5: Toolbar elements');

  // Slider (antd Slider renders as div with role="slider")
  const sliderCount = await window.locator('[class*="ant-slider"], .ant-slider').count();
  assert('Slider present in toolbar', sliderCount > 0, `${sliderCount} slider(s)`);

  // Search input
  const searchInput = await window.locator('[class*="ant-input-search"] input, input[placeholder*="搜索"]').count();
  assert('Search input present in toolbar', searchInput > 0, `${searchInput} search input(s)`);

  // --- Summary ---
  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);

  if (failed > 0) {
    console.log('\nFailed:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  x ${r.name}${r.detail ? ': ' + r.detail : ''}`);
    });
  }

  await app.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
