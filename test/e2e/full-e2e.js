/**
 * Comprehensive E2E Test Suite for Bobcorn
 * ============================================================================
 * Drives the real (current) UI end-to-end via Playwright's Electron driver,
 * mirroring the driving/selector/wait strategy of test/e2e/acceptance.js.
 *
 * Selector priority: data-testid > semantic role/text > structural.
 * Native file dialogs are mocked in the MAIN process via app.evaluate() so the
 * flows run headlessly without OS pickers (electronAPI.showOpenDialog /
 * showSaveDialog are contextBridge wrappers over dialog.show*Dialog).
 *
 * Covered flow (see STEP banners below):
 *   1  Launch + splash screen
 *   2  Enter workspace ("启动新项目" → NewProjectDialog 默认值确认)
 *   3  New project via NewProjectDialog (name + icon-code prefix)
 *   4  Import 5 SVG icons  → asserts new toast text pattern (import.success*)
 *   5  Select icon → SideEditor renders
 *   6  Rename icon (toast: 图标名称已修改)
 *   7  Change icon code (toast: 图标字码已修改)
 *   8  Create group (GroupDialogs → toast: 添加分组成功)
 *   9  Move icon to group via shared GroupPickerDialog (verifies "未分组" item)
 *   9b Group code range (set E100-E10F → import into range → move-reassign越界)
 *   10 Favorite a single icon (star) → 收藏 view shows it
 *   11 Search filters the grid
 *   12 Sort toggle changes grid order (asc vs desc)
 *   13 Batch select (批量 + 全选) → BatchPanel → batch favorite
 *   14 Right-click context menu smoke (appears + one item clickable → recycle)
 *   14b SideEditor recycle (second icon → trash)
 *   15 Recycle bin (占用提示条 + restore + 彻底删除)
 *   16 Export icon font (produces font files on disk)
 *   17 Settings dialog (opens + renders without blocking)
 *   18 Save As (writes .icp to disk)
 *   19 Error check (no critical page errors)
 *
 * Run: node test/e2e/full-e2e.js
 */
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Paths ────────────────────────────────────────────────────────────────────
const projectRoot = path.join(__dirname, '../..');
const screenshotDir = path.join(projectRoot, 'screenshots/e2e');
const fixtureDir = path.join(__dirname, '../fixtures/icons');

// Fixture SVGs (checked into test/fixtures/icons/, not gitignored)
const SVG_FIXTURES = ['home.svg', 'star.svg', 'heart.svg', 'settings.svg', 'search.svg'];

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let shotNum = 0;
async function screenshot(win, name) {
  const filename = `${String(++shotNum).padStart(2, '0')}-${name}.png`;
  try {
    await win.screenshot({ path: path.join(screenshotDir, filename) });
  } catch {
    /* ignore screenshot failures — non-critical */
  }
}

// Result tracking
const results = [];
function pass(name, detail) {
  results.push({ name, status: 'PASS', detail });
  console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, err) {
  const msg = err instanceof Error ? err.message : String(err);
  results.push({ name, status: 'FAIL', detail: msg });
  console.log(`  [FAIL] ${name} — ${msg}`);
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// Run a named step; failures are recorded but do not abort the suite.
async function step(name, fn) {
  console.log(`\n[${name}]`);
  try {
    const detail = await fn();
    pass(name, detail || undefined);
  } catch (e) {
    fail(name, e);
    // Best-effort recovery: clear any stray modal/menu so the next step starts clean.
    try {
      await dismissOverlays(win);
    } catch {
      /* ignore */
    }
  }
}

// Press Escape a few times to dismiss stacked overlays (Radix dialogs, portaled menus).
async function dismissOverlays(win) {
  for (let i = 0; i < 3; i++) {
    await win.keyboard.press('Escape');
    await sleep(200);
  }
}

/**
 * Wait for a toast (message.success/…) whose text contains `substr`.
 * Toasts are direct children of <body> with inline `position: fixed` and a
 * high z-index (see components/ui/toast.ts); this isolates them from dialogs.
 */
async function waitForToast(win, substr, timeout = 7000) {
  await win.waitForFunction(
    (s) => {
      const nodes = Array.from(document.body.children);
      return nodes.some(
        (el) =>
          el instanceof HTMLElement &&
          el.style &&
          el.style.position === 'fixed' &&
          !el.querySelector('[role="dialog"]') &&
          (el.textContent || '').includes(s)
      );
    },
    substr,
    { timeout, polling: 100 }
  );
  // Return the full toast text for logging.
  return win.evaluate((s) => {
    const el = Array.from(document.body.children).find(
      (n) =>
        n instanceof HTMLElement &&
        n.style &&
        n.style.position === 'fixed' &&
        (n.textContent || '').includes(s)
    );
    return el ? el.textContent.trim() : '';
  }, substr);
}

// Open the bottom-left File menu and click a menu item by its exact label.
async function fileMenu(win, label) {
  await win.locator('[data-testid="file-menu-btn"]').click();
  await sleep(450);
  await win.getByText(label, { exact: true }).first().click({ timeout: 5000 });
  await sleep(500);
}

// Click a button (by exact accessible name) inside the currently-open confirm dialog.
async function clickDialogButton(win, name) {
  const dialog = win.locator('[role="dialog"]').last();
  await dialog.getByRole('button', { name, exact: true }).click({ timeout: 5000 });
}

// Navigate a ResourceNav item (全部 / 未分组 / 回收站 / 收藏 …) by exact label.
async function navTo(win, label) {
  await win.locator('nav button', { hasText: label }).first().click();
  await sleep(900);
}

// Count currently-mounted icon blocks.
async function iconBlockCount(win) {
  return win.locator('[data-testid="icon-block"]').count();
}

// Read the visible icon names (first <p> of each block), in DOM order.
async function iconNames(win) {
  return win.$$eval('[data-testid="icon-block"]', (els) =>
    els.map((el) => {
      const p = el.querySelector('p');
      return p ? (p.textContent || '').trim() : '';
    })
  );
}

// ── Shared app handle (so step()'s recovery can reach it) ────────────────────
let win;

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  for (const f of fs.readdirSync(screenshotDir)) {
    if (f.endsWith('.png')) fs.unlinkSync(path.join(screenshotDir, f));
  }

  console.log('====================================================');
  console.log('  Bobcorn Full E2E Test Suite');
  console.log('====================================================');

  const pageErrors = [];
  const consoleErrors = [];

  console.log('\n[Launch] Starting Electron app…');
  const app = await electron.launch({
    args: [projectRoot],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  win = await app.firstWindow();
  win.on('pageerror', (e) => {
    pageErrors.push(e.message);
    console.log(`  [PAGE ERROR] ${e.message.substring(0, 120)}`);
  });
  win.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await win.waitForLoadState('load');
  await sleep(3000); // let React render + sql.js WASM init

  // Track temp artifacts for cleanup.
  const tmpArtifacts = [];

  try {
    // ════════════════════════════════════════════════════════════════════════
    await step('Step 1: Splash screen', async () => {
      await screenshot(win, 'splash');
      assert(await win.getByText('欢迎使用').isVisible({ timeout: 5000 }), '"欢迎使用" not visible');
      assert(
        await win.locator('button:has-text("启动新项目")').isVisible({ timeout: 3000 }),
        '"启动新项目" button missing'
      );
      assert(
        await win.locator('button:has-text("打开项目文件")').isVisible({ timeout: 3000 }),
        '"打开项目文件" button missing'
      );
      assert(await win.getByText('历史记录').isVisible({ timeout: 3000 }), '"历史记录" missing');
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 2: Enter workspace', async () => {
      // 欢迎页“启动新项目”走 NewProjectDialog（默认值确认即可），确认后进入工作区
      await win.locator('button:has-text("启动新项目")').click();
      await sleep(800);
      assert(
        await win.getByText('创建新项目').isVisible({ timeout: 3000 }),
        'NewProjectDialog missing after 启动新项目'
      );
      await win.locator('[data-testid="new-project-confirm"]').click();
      await sleep(1800);
      await screenshot(win, 'workspace-empty');
      assert(await win.locator('nav button', { hasText: '全部' }).first().isVisible({ timeout: 5000 }), 'nav 全部 missing');
      assert(await win.locator('nav button', { hasText: '回收站' }).first().isVisible(), 'nav 回收站 missing');
      assert(await win.locator('#iconGridLocalContainer').count() > 0, 'icon grid container missing');
      assert(await win.getByText('还没有图标').isVisible({ timeout: 3000 }), 'empty-grid hint missing');
      assert(
        await win.locator('[data-testid="file-menu-btn"]').isVisible({ timeout: 3000 }),
        'file-menu-btn missing'
      );
    });

    // ════════════════════════════════════════════════════════════════════════
    // New project runs through the NewProjectDialog (name + icon-code prefix).
    await step('Step 3: New project via NewProjectDialog', async () => {
      await fileMenu(win, '新建项目');
      // Dialog: title 创建新项目 + two inputs; prefix defaults to "iconfont".
      assert(await win.getByText('创建新项目').isVisible({ timeout: 3000 }), 'NewProjectDialog title missing');
      const dialog = win.locator('[role="dialog"]').last();
      const inputs = dialog.locator('input');
      assert((await inputs.count()) >= 2, 'expected name + prefix inputs');
      const prefixDefault = await inputs.nth(1).inputValue();
      assert(prefixDefault === 'iconfont', `prefix default should be iconfont, got "${prefixDefault}"`);
      await screenshot(win, 'new-project-dialog');
      // Fill project name + a custom prefix, then confirm via data-testid.
      await inputs.nth(0).fill('E2E-Project');
      await inputs.nth(1).fill('e2eproj');
      await sleep(200);
      await win.locator('[data-testid="new-project-confirm"]').click();
      await sleep(1500);
      await screenshot(win, 'after-new-project');
      // Dialog closed + workspace re-rendered empty; title reflects project name.
      assert((await win.locator('[data-testid="new-project-confirm"]').count()) === 0, 'dialog did not close');
      const title = await win.title();
      assert(title.includes('E2E-Project'), `window title should contain project name, got "${title}"`);
      return `title="${title}"`;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 4: Import 5 SVG icons (new toast pattern)', async () => {
      const absPaths = SVG_FIXTURES.map((f) => path.resolve(fixtureDir, f));
      for (const p of absPaths) assert(fs.existsSync(p), `fixture missing: ${p}`);

      await app.evaluate(({ dialog }, paths) => {
        const orig = dialog.showOpenDialog;
        dialog.showOpenDialog = async () => {
          dialog.showOpenDialog = orig;
          return { canceled: false, filePaths: paths };
        };
      }, absPaths.map((p) => p.replace(/\\/g, '/')));

      await fileMenu(win, '导入图标');
      // Toast text follows import.success{Appended|Filled|Mixed}; fresh project → append.
      const toast = await waitForToast(win, '个图标');
      assert(/已导入\s*\d+\s*个图标/.test(toast), `unexpected import toast: "${toast}"`);
      assert(
        /追加至字码末尾|填充了空闲字码|填充空闲字码/.test(toast),
        `import toast missing allocation phrasing: "${toast}"`
      );
      await sleep(1500);
      await screenshot(win, 'after-import');
      const count = await iconBlockCount(win);
      assert(count >= 5, `expected >=5 icon blocks, got ${count}`);
      return `toast="${toast}", blocks=${count}`;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 5: Select icon → editor', async () => {
      await win.locator('[data-testid="icon-block"]').first().click();
      await sleep(800);
      await screenshot(win, 'icon-selected');
      assert(await win.getByText('基本信息').first().isVisible({ timeout: 3000 }), '基本信息 section missing');
      assert(await win.getByText('操作', { exact: true }).first().isVisible({ timeout: 2000 }), '操作 section missing');
      assert(
        await win.locator('input[placeholder="在界面上显示的名称"]').isVisible({ timeout: 2000 }),
        'name input missing'
      );
    });

    // ════════════════════════════════════════════════════════════════════════
    // Blank-click deselect (file-explorer parity): clicking empty canvas space
    // clears the selection and closes the editor; re-select for Step 6.
    await step('Step 5b: Blank click deselects icon', async () => {
      // Target the scroll area itself — the container also holds the 49px bottom
      // info bar, so use the scroll div's own box. Its vertical middle is blank
      // (5 icons fill a single top row).
      const box = await win.locator('#iconGridLocalContainer .overflow-y-auto').first().boundingBox();
      assert(box, 'grid scroll area bounding box missing');
      await win.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(600);
      assert(
        !(await win.getByText('基本信息').first().isVisible({ timeout: 1500 }).catch(() => false)),
        'editor should close after blank click'
      );
      // Restore state for the following steps.
      await win.locator('[data-testid="icon-block"]').first().click();
      await sleep(600);
      assert(
        await win.getByText('基本信息').first().isVisible({ timeout: 3000 }),
        'editor should reopen after re-selecting icon'
      );
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 6: Rename icon', async () => {
      const nameInput = win.locator('input[placeholder="在界面上显示的名称"]');
      await nameInput.fill('e2e-renamed');
      await sleep(200);
      await nameInput.press('Enter');
      const toast = await waitForToast(win, '图标名称已修改');
      await sleep(800);
      return toast;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 7: Change icon code', async () => {
      const codeInput = win.locator('input[placeholder*="十六进制"]');
      // E800 is comfortably inside E000–F8FF and free for a fresh 5-icon project.
      await codeInput.fill('E800');
      await sleep(200);
      await codeInput.press('Enter');
      const toast = await waitForToast(win, '图标字码已修改');
      await sleep(800);
      return toast;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 8: Create group', async () => {
      // The "+" add-group button lives in the GroupList header (lucide Plus icon).
      await win.locator('button:has(svg.lucide-plus)').first().click();
      await sleep(700);
      assert(await win.getByText('添加分组').first().isVisible({ timeout: 3000 }), 'add-group dialog missing');
      const dialog = win.locator('[role="dialog"]').last();
      await dialog.locator('input').first().fill('E2E测试分组');
      await sleep(200);
      await screenshot(win, 'add-group');
      await clickDialogButton(win, '确认');
      const toast = await waitForToast(win, '添加分组成功');
      await sleep(1000);
      assert(await win.getByText('E2E测试分组').first().isVisible({ timeout: 3000 }), 'new group not in sidebar');
      return toast;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 9: Move icon to group (GroupPickerDialog)', async () => {
      await navTo(win, '全部');
      await win.locator('[data-testid="icon-block"]').first().click();
      await sleep(700);
      await win.getByRole('button', { name: '移动', exact: true }).click();
      await sleep(700);
      await screenshot(win, 'group-picker');
      const dialog = win.locator('[role="dialog"]').last();
      // GroupPickerDialog must offer the sentinel "未分组" target.
      assert(await dialog.getByText('未分组', { exact: true }).first().isVisible({ timeout: 3000 }), '"未分组" option missing');
      // Pick the created group, then confirm via its data-testid.
      await dialog.getByText('E2E测试分组').first().click();
      await sleep(300);
      await win.locator('[data-testid="group-picker-confirm"]').click();
      const toast = await waitForToast(win, '已移动到目标分组');
      await sleep(1000);
      // Verify the group now contains the moved icon.
      await win.getByText('E2E测试分组').first().click();
      await sleep(900);
      const inGroup = await iconBlockCount(win);
      assert(inGroup >= 1, `group should contain the moved icon, got ${inGroup}`);
      await navTo(win, '全部');
      return `${toast} (group blocks=${inGroup})`;
    });

    // ════════════════════════════════════════════════════════════════════════
    // Group code-range flow: create a ranged group (E100-E10F), import into it
    // (codes must land in range), then move an out-of-range icon in with the
    // inline "reassign" choice, and verify the moved code snaps into the range.
    await step('Step 9b: Group code range (set → import → move-reassign)', async () => {
      // Read the code text (2nd <p>) of every mounted icon block, in DOM order.
      const readCodes = () =>
        win.$$eval('[data-testid="icon-block"]', (els) =>
          els.map((el) => {
            const ps = el.querySelectorAll('p');
            return ps[1] ? (ps[1].textContent || '').trim() : '';
          })
        );
      const IN_RANGE = /^E10[0-9A-F]$/i;

      // 1) Create a group WITH a code range via the add-group dialog.
      await navTo(win, '全部');
      await win.locator('button:has(svg.lucide-plus)').first().click();
      await sleep(700);
      const addDialog = win.locator('[role="dialog"]').last();
      await addDialog.locator('input').first().fill('E2E区间组');
      await sleep(150);
      // Expand the collapsible "字码区间" section, then type the hex bounds.
      await addDialog.locator('[data-testid="group-range-toggle"]').click();
      await sleep(300);
      await addDialog.locator('[data-testid="code-range-start"]').fill('E100');
      await sleep(120);
      await addDialog.locator('[data-testid="code-range-end"]').fill('E10F');
      await sleep(350);
      await screenshot(win, 'group-range-set');
      await clickDialogButton(win, '确认');
      await waitForToast(win, '添加分组成功');
      await sleep(900);

      // 2) Select the ranged group, import 5 icons → codes must land in E100-E10F.
      await win.getByText('E2E区间组').first().click();
      await sleep(800);
      const absPaths = SVG_FIXTURES.map((f) => path.resolve(fixtureDir, f));
      await app.evaluate(({ dialog }, paths) => {
        const orig = dialog.showOpenDialog;
        dialog.showOpenDialog = async () => {
          dialog.showOpenDialog = orig;
          return { canceled: false, filePaths: paths };
        };
      }, absPaths.map((p) => p.replace(/\\/g, '/')));
      await fileMenu(win, '导入图标');
      await waitForToast(win, '个图标');
      await sleep(1300);
      const importedCodes = await readCodes();
      const inRange = importedCodes.filter((c) => IN_RANGE.test(c));
      assert(
        inRange.length >= 5,
        `imported codes should all fall in E100-E10F, got: ${importedCodes.join(',')}`
      );

      // 3) Move an out-of-range icon (from 未分组) into the ranged group; the
      //    inline reassignment row must appear (default = reassign) → confirm.
      await navTo(win, '未分组');
      await sleep(500);
      const ungrouped = await iconBlockCount(win);
      assert(ungrouped >= 1, 'no ungrouped icon available to move');
      await win.locator('[data-testid="icon-block"]').first().click();
      await sleep(600);
      await win.getByRole('button', { name: '移动', exact: true }).click();
      await sleep(650);
      const moveDialog = win.locator('[role="dialog"]').last();
      await moveDialog.getByText('E2E区间组').first().click();
      await sleep(450);
      assert(
        (await moveDialog.locator('[data-testid="group-picker-reassign"]').count()) > 0,
        'reassign row not shown for an out-of-range move into a ranged group'
      );
      await screenshot(win, 'group-picker-reassign');
      await win.locator('[data-testid="group-picker-confirm"]').click();
      const reassignToast = await waitForToast(win, '重新分配');
      await sleep(1000);

      // 4) The ranged group now holds only in-range codes (moved code snapped in,
      //    so the out-of-range marker is gone).
      await win.getByText('E2E区间组').first().click();
      await sleep(900);
      const afterCodes = await readCodes();
      assert(
        afterCodes.length > 0 && afterCodes.every((c) => IN_RANGE.test(c)),
        `ranged group should only hold E100-E10F codes after reassign, got: ${afterCodes.join(',')}`
      );
      await navTo(win, '全部');
      return `imported in-range=${inRange.length}, "${reassignToast}", group codes=[${afterCodes.join(',')}]`;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 10: Favorite a single icon', async () => {
      const block = win.locator('[data-testid="icon-block"]').first();
      await block.hover();
      await sleep(200);
      await block.locator('svg.lucide-star').click({ force: true });
      await sleep(800);
      await navTo(win, '收藏');
      await screenshot(win, 'favorites');
      const favCount = await iconBlockCount(win);
      const emptyFav = await win.getByText('还没有收藏的图标').isVisible({ timeout: 1000 }).catch(() => false);
      assert(favCount >= 1 && !emptyFav, `favorite view empty (blocks=${favCount})`);
      await navTo(win, '全部');
      return `favorited blocks=${favCount}`;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 11: Search filters grid', async () => {
      const search = win.locator('input[placeholder*="搜索"]').first();
      await search.fill('e2e-renamed');
      await sleep(900);
      await screenshot(win, 'search');
      const found = await iconBlockCount(win);
      assert(found >= 1, `search returned no blocks`);
      const names = await iconNames(win);
      assert(names.some((n) => n.includes('e2e-renamed')), `renamed icon not in search results: ${names.join(',')}`);
      await search.fill('');
      await sleep(700);
      return `matches=${found}`;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 12: Sort toggle changes order', async () => {
      // Use the flat (header-less) "未分组" view so ordering is unambiguous.
      await navTo(win, '未分组');
      const flat = await iconBlockCount(win);
      assert(flat >= 2, `need >=2 icons to test sort, got ${flat}`);
      // Open the display/sort panel (SlidersHorizontal button).
      await win.locator('button:has(svg.lucide-sliders-horizontal)').first().click();
      await sleep(500);
      await win.getByText('按图标名称', { exact: true }).click();
      await sleep(300);
      await win.getByText('升序', { exact: true }).click();
      await sleep(700);
      const asc = await iconNames(win);
      await win.getByText('降序', { exact: true }).click();
      await sleep(700);
      const desc = await iconNames(win);
      await screenshot(win, 'sort-desc');
      assert(asc.join('|') !== desc.join('|'), `order did not change (asc=${asc}, desc=${desc})`);
      // Close the panel.
      await win.locator('button:has(svg.lucide-sliders-horizontal)').first().click();
      await sleep(300);
      return `asc=[${asc.join(',')}] desc=[${desc.join(',')}]`;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 13: Batch select + batch favorite', async () => {
      await navTo(win, '全部');
      // Toggle batch mode, then Select All.
      await win.getByRole('button', { name: /批量/ }).first().click();
      await sleep(400);
      await win.getByText('全选', { exact: true }).click();
      await sleep(800);
      await screenshot(win, 'batch-selected');
      // BatchPanel replaces SideEditor when >=2 selected.
      assert(await win.getByText(/已选中\s*\d+\s*个图标/).isVisible({ timeout: 3000 }), 'BatchPanel header missing');
      // Batch favorite (StarOff/Star row in the panel).
      await win.locator('button', { hasText: '收藏' }).last().click();
      const toast = await waitForToast(win, '已收藏');
      await sleep(800);
      // Clear selection.
      const cancel = win.getByRole('button', { name: '取消选择', exact: true });
      if (await cancel.isVisible({ timeout: 1500 }).catch(() => false)) {
        await cancel.click();
      } else {
        await dismissOverlays(win);
      }
      await sleep(600);
      return toast;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 14: Right-click context menu + recycle', async () => {
      await navTo(win, '全部');
      await win.locator('[data-testid="icon-block"]').first().click({ button: 'right' });
      await sleep(500);
      await screenshot(win, 'context-menu');
      const menu = win.locator('[role="menu"]');
      assert(await menu.isVisible({ timeout: 3000 }), 'context menu did not open');
      const items = await menu.locator('[role="menuitem"]').count();
      assert(items >= 1, 'context menu has no items');
      // Click the (danger) recycle item → confirm.
      await menu.getByRole('menuitem', { name: '回收', exact: true }).click();
      await sleep(500);
      await clickDialogButton(win, '确认');
      const toast = await waitForToast(win, '已回收');
      await sleep(900);
      return `${items} items; ${toast}`;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 14b: Recycle a second icon via SideEditor', async () => {
      await win.locator('[data-testid="icon-block"]').first().click();
      await sleep(600);
      await win.getByRole('button', { name: '回收', exact: true }).click();
      await sleep(500);
      await clickDialogButton(win, '确认');
      const toast = await waitForToast(win, '已回收');
      await sleep(900);
      return toast;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 15: Recycle bin (hint + restore + permanent delete)', async () => {
      await navTo(win, '回收站');
      await screenshot(win, 'recycle-bin');
      // 字码占用提示条
      assert(
        await win.getByText('回收站中的图标仍会占用图标字码', { exact: false }).isVisible({ timeout: 3000 }),
        'trash code-occupancy hint missing'
      );
      const before = await iconBlockCount(win);
      assert(before >= 2, `expected >=2 recycled icons, got ${before}`);

      // Restore one via context menu.
      await win.locator('[data-testid="icon-block"]').first().click({ button: 'right' });
      await sleep(500);
      await win.locator('[role="menu"]').getByRole('menuitem', { name: '恢复', exact: true }).click();
      const restoreToast = await waitForToast(win, '图标已恢复');
      await sleep(900);

      // Permanently delete another via context menu → confirm (删除).
      await win.locator('[data-testid="icon-block"]').first().click({ button: 'right' });
      await sleep(500);
      await win.locator('[role="menu"]').getByRole('menuitem', { name: '彻底删除', exact: true }).click();
      await sleep(500);
      await clickDialogButton(win, '删除');
      const delToast = await waitForToast(win, '删除');
      await sleep(900);
      const after = await iconBlockCount(win);
      assert(after < before, `trash count should drop (${before} → ${after})`);
      await navTo(win, '全部');
      return `restore="${restoreToast}", delete="${delToast}", trash ${before}→${after}`;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 16: Export icon font', async () => {
      const exportParent = fs.mkdtempSync(path.join(os.tmpdir(), 'bobcorn-e2e-export-'));
      tmpArtifacts.push(exportParent);
      const exportTarget = path.join(exportParent, 'out');

      await fileMenu(win, '导出图标字体');
      await sleep(900);
      const dialog = win.locator('[role="dialog"]').last();
      assert(await dialog.getByText('导出图标字体').first().isVisible({ timeout: 3000 }), 'export dialog missing');
      // Redirect output into a temp dir via the editable location field.
      const loc = dialog.locator('input[type="text"]').first();
      await loc.fill(exportTarget);
      await sleep(300);
      await screenshot(win, 'export-dialog');
      await dialog.getByRole('button', { name: '导出图标字体', exact: true }).click();

      // Wait for completion (dialog title flips to 导出完成) — small dataset is fast.
      // Target the heading specifically (a log line also contains "导出完成").
      await win.getByRole('heading', { name: '导出完成' }).waitFor({ state: 'visible', timeout: 45000 });
      await sleep(600);
      await screenshot(win, 'export-done');

      // Verify artefacts on disk (dir mode → files; zip mode → out.zip).
      const zipPath = `${exportTarget}.zip`;
      let detail;
      if (fs.existsSync(exportTarget)) {
        const files = fs.readdirSync(exportTarget);
        const need = ['.svg', '.ttf', '.woff2', '.css'];
        const missing = need.filter((ext) => !files.some((f) => f.endsWith(ext)));
        assert(missing.length === 0, `missing font files: ${missing.join(', ')} (have: ${files.join(', ')})`);
        for (const ext of need) {
          const f = files.find((x) => x.endsWith(ext));
          assert(fs.statSync(path.join(exportTarget, f)).size > 0, `${f} is empty`);
        }
        detail = `${files.length} files: ${files.join(', ')}`;
      } else if (fs.existsSync(zipPath)) {
        assert(fs.statSync(zipPath).size > 0, 'export zip is empty');
        detail = `zip: ${path.basename(zipPath)} (${fs.statSync(zipPath).size} bytes)`;
      } else {
        throw new Error(`no export output at ${exportTarget} or ${zipPath}`);
      }
      // Close the export dialog.
      const close = win.getByRole('button', { name: '关闭', exact: true });
      if (await close.isVisible({ timeout: 1500 }).catch(() => false)) await close.click();
      else await dismissOverlays(win);
      await sleep(500);
      return detail;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 17: Settings dialog opens (non-blocking)', async () => {
      await win.locator('[data-testid="settings-btn"]').click();
      // CLI detection is async now — the dialog title must render promptly.
      await win.getByText('设置', { exact: true }).first().waitFor({ state: 'visible', timeout: 2500 });
      await screenshot(win, 'settings');
      // Sanity: language + version sections rendered.
      assert(await win.getByText('版本', { exact: true }).first().isVisible({ timeout: 2000 }).catch(() => true), 'settings body missing');
      await dismissOverlays(win);
      await sleep(400);
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 18: Save As writes .icp', async () => {
      const savePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bobcorn-e2e-save-')), 'project.icp');
      tmpArtifacts.push(path.dirname(savePath));
      await app.evaluate(({ dialog }, p) => {
        const orig = dialog.showSaveDialog;
        dialog.showSaveDialog = async () => {
          dialog.showSaveDialog = orig;
          return { canceled: false, filePath: p };
        };
      }, savePath.replace(/\\/g, '/'));

      await fileMenu(win, '另存为');
      const toast = await waitForToast(win, '项目已保存');
      await sleep(700);
      assert(fs.existsSync(savePath), `save file not written: ${savePath}`);
      assert(fs.statSync(savePath).size > 0, 'save file is empty');
      return `${toast} (${fs.statSync(savePath).size} bytes)`;
    });

    // ════════════════════════════════════════════════════════════════════════
    await step('Step 19: No critical page errors', async () => {
      const critical = pageErrors.filter(
        (e) =>
          !e.includes('Warning:') &&
          !e.includes('deprecated') &&
          !e.includes('DevTools') &&
          !e.includes('Electron Security Warning')
      );
      const realConsole = consoleErrors.filter((e) => !e.includes('Electron Security Warning'));
      assert(critical.length === 0, `page errors: ${critical.slice(0, 2).join(' | ')}`);
      return `${pageErrors.length} page warnings, ${realConsole.length} console errors (ignored non-critical)`;
    });

    await screenshot(win, 'final');
  } finally {
    // Cleanup temp artefacts.
    for (const p of tmpArtifacts) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    console.log('\n====================================================');
    console.log('  TEST SUMMARY');
    console.log('====================================================');
    results.forEach((r) => {
      const icon = r.status === 'PASS' ? '[OK]' : '[XX]';
      console.log(`  ${icon} ${r.name}${r.status === 'FAIL' && r.detail ? ' — ' + r.detail : ''}`);
    });
    console.log('----------------------------------------------------');
    console.log(`  ${passed}/${results.length} passed`);
    console.log('====================================================');
    console.log(`\n  Screenshots → screenshots/e2e/`);

    await app.close().catch(() => {});
    process.exit(failed > 0 ? 1 : 0);
  }
}

run().catch((e) => {
  console.error('\nFATAL:', e.message);
  console.error(e.stack);
  process.exit(2);
});
