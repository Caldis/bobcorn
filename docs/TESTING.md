# Testing Guide

## Stack

| Layer | Tool | Config |
|-------|------|--------|
| Unit | Vitest 3.x | `vitest.config.js` |
| E2E | Playwright 1.58 | `test/e2e/acceptance.js` |
| Fixtures | `test/fixtures/icons/` | Sample SVG files |

## Unit Tests (Vitest)

### Run

```bash
npx vitest run              # All unit tests
npx vitest run test/unit/   # Unit only
npx vitest                  # Watch mode
```

### Config

- `vitest.config.js` — environment: `node`, globals: `true`
- Alias: `@` maps to `src/renderer/`
- Pattern: `test/**/*.test.{js,ts}`

### Template

```js
// test/unit/my-module.test.js
describe('MyModule', () => {
  test('does something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  test('handles edge case', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

### What to Test

- `src/renderer/utils/tools/` — pure functions (hexToDec, decToHex, nameOfPath, sf, generateUUID)
- `src/renderer/database/` — CRUD operations (use sql.js directly, no Electron needed)
- `src/renderer/config/` — config constants and Unicode range calculations
- `src/renderer/utils/svg/` — SVG parsing and formatting

### Gotcha

The database and renderer modules use `import.meta.env` — mock it in tests or test at the function level.

## E2E / Acceptance Tests (Playwright)

### Run

```bash
# Must build first (both scripts drive the production bundle in out/)
npx electron-vite build

node test/e2e/acceptance.js   # smoke: launch + layout + security (22 checks)
node test/e2e/full-e2e.js     # full user flow (20 steps)
```

> **Single-instance gotcha:** kill any running Bobcorn electron before a run, and
> close the installed `Bobcorn.exe` if present (it holds the single-instance lock
> and makes the test launch fail silently). See `AGENTS.md` → 开发环境.

### `acceptance.js` — What It Checks (22 items)

1. **Launch:** window title, Electron version, window size
2. **React:** root exists, content rendered
3. **Security:** nodeIntegration disabled, contextBridge available
4. **Splash screen:** welcome text, new/open project buttons
5. **Workspace:** side menu, icon grid, menu items, File-menu import/export items
6. **Window controls:** 3 title bar buttons (Win32)
7. **Aesthetics:** stylesheets loaded, UI components rendered, empty state hint
8. **Errors:** zero page errors, zero console errors

### `full-e2e.js` — End-to-End User Flow (20 steps)

Drives the current UI with Playwright's Electron driver (real locator clicks;
native file dialogs mocked in the **main** process via `app.evaluate()`).
Selector priority: `data-testid` > semantic role/text > structural. Each step is
independently reported; the script exits non-zero if any step fails and prints an
`N/N passed` summary.

| # | Step | Key assertion |
|---|------|---------------|
| 1 | Splash screen | 欢迎使用 + action buttons |
| 2 | Enter workspace (启动新项目) | nav items + empty-grid hint + `file-menu-btn` |
| 3 | New project via `NewProjectDialog` | name + prefix fields (prefix default `iconfont`), confirm via `data-testid="new-project-confirm"`, title reflects name |
| 4 | Import 5 SVG icons | new toast pattern (`import.success{Appended\|Filled\|Mixed}`), 5 grid blocks |
| 5 | Select icon → editor | 基本信息 / 操作 sections render |
| 6 | Rename icon | toast 图标名称已修改 |
| 7 | Change icon code | toast 图标字码已修改 |
| 8 | Create group | toast 添加分组成功 + group in sidebar |
| 9 | Move to group (`GroupPickerDialog`) | "未分组" option present, confirm via `data-testid="group-picker-confirm"`, toast + group count |
| 10 | Favorite a single icon (star) | 收藏 view shows it |
| 11 | Search | grid filters to the renamed icon |
| 12 | Sort toggle | grid order differs asc vs desc (flat 未分组 view) |
| 13 | Batch select (批量 + 全选) → `BatchPanel` | 已选中 N 个图标 + batch favorite toast |
| 14 | Right-click context menu | menu appears + 回收 item → confirm → recycled |
| 14b | SideEditor recycle | second icon → trash |
| 15 | Recycle bin | 字码占用提示条 + restore + 彻底删除 |
| 16 | Export icon font | font files (`.svg/.ttf/.woff2/.css`) written to disk |
| 17 | Settings dialog | opens + renders without blocking (async CLI detection) |
| 18 | Save As | `.icp` written to disk (toast 项目已保存) |
| 19 | Error check | zero critical page errors |

Fixtures: `test/fixtures/icons/*.svg` (5 sample icons, committed). Temp export /
save artefacts go to `os.tmpdir()` and are cleaned up on exit.

### E2E Template (Playwright Electron)

```js
const { _electron: electron } = require('playwright');
const path = require('path');

async function run() {
  const app = await electron.launch({
    args: [path.join(__dirname, '../..')],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('load');

  // Your assertions here
  const title = await window.title();
  console.assert(title === 'Bobcorn');

  // Interact with the app
  await window.locator('button:has-text("启动新项目")').click();
  await window.waitForTimeout(2000);

  // Screenshot
  await window.screenshot({ path: 'screenshots/test.png' });

  await app.close();
}
run();
```

### Screenshots

Acceptance tests save screenshots to `screenshots/`:
- `accept-01-splash.png` — splash screen
- `accept-02-workspace.png` — main workspace
- `accept-03-final.png` — final state

## Adding a New Test

1. Create file in `test/unit/` or `test/e2e/`
2. For unit tests: use `describe`/`test`/`expect` (Vitest globals enabled)
3. For E2E: extend `acceptance.js` or create a new script
4. Run and verify before committing
