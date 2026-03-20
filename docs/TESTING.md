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
# Must build first
npx electron-vite build && node test/e2e/acceptance.js
```

### What It Checks (21 items)

1. **Launch:** window title, Electron version, window size
2. **React:** root exists, content rendered
3. **Security:** nodeIntegration disabled, contextBridge available
4. **Splash screen:** welcome text, new/open project buttons
5. **Workspace:** side menu, icon grid, menu items, toolbar buttons
6. **Window controls:** 3 title bar buttons (Win32)
7. **Aesthetics:** stylesheets loaded, UI components rendered, empty state hint
8. **Errors:** zero page errors, zero console errors

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
