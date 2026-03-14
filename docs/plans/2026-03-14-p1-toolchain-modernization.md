# P1: Core Toolchain Modernization

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Modernize build toolchain (Babel 7, React 18, antd 5) while keeping Webpack 4 stable.

**Architecture:** Sequential upgrades — Babel 7 first (foundation), then React 18 (small), then antd 5 (largest). Webpack 5 deferred to reduce risk since Webpack 4 works fine with `--openssl-legacy-provider`.

**Tech Stack:** @babel/core 7, @babel/preset-env, React 18, antd 5, @ant-design/icons

---

## Dependency Graph

```
Task 1 (Babel 6→7) ──→ Task 2 (React 16→18) ──→ Task 3 (antd 3→5) ──→ Task 4 (Acceptance)
                          (parallel OK ↑↓)
```

Tasks 2 and 3 can technically run in parallel after Task 1, but antd 5 requires React ≥16.8, so React 18 first is safer.

## Prerequisites

All commands need fnm Node 18:
```bash
FNM="/c/Users/mail/AppData/Local/Microsoft/WinGet/Packages/Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe/fnm.exe"
eval "$("$FNM" env --shell bash)" && "$FNM" use 18
cd /d/Code/bobcorn
```

---

## Task 1: Babel 6 → Babel 7

**Files:**
- Delete: `.babelrc`
- Create: `babel.config.js`
- Modify: `package.json` (swap all babel packages)
- Modify: `webpack.config.renderer.dev.js:70-77` (update plugin names)
- Modify: `webpack.config.base.js` (remove NamedModulesPlugin)

### Step 1: Uninstall Babel 6 packages

```bash
npm uninstall babel-core babel-eslint babel-loader babel-plugin-add-module-exports \
  babel-plugin-dev-expression babel-plugin-flow-runtime babel-plugin-import \
  babel-plugin-transform-class-properties babel-plugin-transform-es2015-classes \
  babel-polyfill babel-preset-env babel-preset-react babel-preset-react-optimize \
  babel-preset-stage-0 babel-register --legacy-peer-deps
```

### Step 2: Install Babel 7 packages

```bash
npm install --save-dev @babel/core @babel/preset-env @babel/preset-react \
  @babel/plugin-transform-class-properties @babel/register \
  babel-loader@9 babel-plugin-import --legacy-peer-deps
```

Note: `babel-plugin-import` v1.13+ works with Babel 7.

### Step 3: Create babel.config.js (replaces .babelrc)

Delete `.babelrc`, create `babel.config.js`:
```js
module.exports = function(api) {
  api.cache(true);

  const presets = [
    ['@babel/preset-env', {
      targets: { electron: '28' },
      useBuiltIns: false,
    }],
    '@babel/preset-react',
  ];

  const plugins = [];

  const env = {
    production: {
      plugins: [
        ['import', { libraryName: 'antd', style: 'css' }],
      ],
    },
    development: {
      plugins: [
        ['import', { libraryName: 'antd', style: 'css' }],
        '@babel/plugin-transform-class-properties',
      ],
    },
  };

  return { presets, plugins, env };
};
```

### Step 4: Update build scripts in package.json

All scripts using `-r babel-register` must change to `-r @babel/register`:

- `dev` script
- `build-dll` script
- `build-main` script
- `build-renderer` script
- `start-main-dev` script
- `start-renderer-dev` script

Replace `babel-register` with `@babel/register` in all script strings.

### Step 5: Update webpack.config.renderer.dev.js

Lines 70-77, replace Babel 6 plugin names:
```js
plugins: [
    '@babel/plugin-transform-class-properties',
    'react-hot-loader/babel'
]
```
Remove `'transform-es2015-classes'` (already handled by @babel/preset-env).

### Step 6: Update webpack.config.base.js

Remove `webpack.NamedModulesPlugin()` from plugins array (deprecated, named modules is default in Webpack 4 dev mode).

### Step 7: Rebuild DLL and build

```bash
rm -rf dll/
npm run build-dll
npm run build
```

### Step 8: Run tests and verify

```bash
npx jest test/unit --verbose
npm start  # visual check
```

### Step 9: Commit

```bash
git add -A && git commit -m "build: migrate Babel 6 to Babel 7

- Replace babel-core with @babel/core
- Replace babel-preset-env/react/stage-0 with @babel/preset-env/react
- Convert .babelrc to babel.config.js
- Update all build scripts from babel-register to @babel/register
- Remove deprecated NamedModulesPlugin
- Enable babel-plugin-import for both dev and production"
```

---

## Task 2: React 16 → React 18

**Files:**
- Modify: `package.json` (react, react-dom versions)
- Modify: `app/index.js` (createRoot API, remove react-hot-loader)
- Modify: `app/containers/MainContainer/index.js` (fix deprecated lifecycles)

### Step 1: Upgrade React

```bash
npm install react@18 react-dom@18 --legacy-peer-deps
npm uninstall react-hot-loader --legacy-peer-deps
```

### Step 2: Update app/index.js to React 18 createRoot

Replace entire file:
```js
import React from 'react';
import { createRoot } from 'react-dom/client';
import 'antd/dist/antd.min.css';
import MainContainer from './containers/MainContainer';

const root = createRoot(document.getElementById('root'));
root.render(<MainContainer />);
```

Note: Removed `react-hot-loader` (AppContainer), removed broken HMR code. HMR will be re-added via webpack's built-in React Refresh in a future upgrade.

### Step 3: Fix deprecated lifecycle methods in MainContainer

In `app/containers/MainContainer/index.js`:
- Rename `componentWillMount()` → `componentDidMount()` (merge logic into existing componentDidMount if present)
- Remove `componentWillReceiveProps()` if present (move logic to componentDidUpdate)

### Step 4: Build and test

```bash
npm run build
npx jest test/unit --verbose
node test/e2e/acceptance.js
```

### Step 5: Commit

```bash
git add -A && git commit -m "feat: upgrade React 16 to React 18

- Use createRoot API instead of ReactDOM.render
- Remove react-hot-loader dependency
- Fix deprecated componentWillMount lifecycle"
```

---

## Task 3: antd 3 → antd 5

This is the largest task. antd 5 uses CSS-in-JS (no separate CSS import needed).

**Files to modify (13 files):**
- `app/index.js` — remove antd CSS import, add ConfigProvider
- `app/components/SplashScreen/index.js` — Modal visible→open
- `app/components/SideMenu/index.js` — Modal visible→open, Icon→@ant-design/icons
- `app/components/SideEditor/index.js` — Modal visible→open
- `app/components/IconToolbar/index.js` — Icon migration
- `app/components/IconInfoBar/index.js` — Icon→@ant-design/icons, Menu changes
- `app/components/IconGridLocal/index.js` — Modal API
- `app/components/IconGridCloud/index.js` — Spin, Modal API
- `app/components/IconBlock/index.js` — Checkbox (minor)
- `app/components/enhance/input/index.js` — Input, Button
- `app/components/enhance/badge/index.js` — Badge
- `app/containers/MainContainer/index.js` — Modal
- `app/index.global.css` — antd class overrides

### Step 1: Install antd 5 and @ant-design/icons

```bash
npm uninstall antd --legacy-peer-deps
npm install antd@5 @ant-design/icons --legacy-peer-deps
```

### Step 2: Update app/index.js — remove antd CSS import

Remove: `import 'antd/dist/antd.min.css';`

antd 5 uses CSS-in-JS, no CSS file needed. Wrap app with ConfigProvider if theming is needed (optional).

### Step 3: Global antd API changes across ALL files

**Search and replace in all 13 files:**

1. **Modal `visible` → `open`**
   Files: SplashScreen, SideMenu, SideEditor, IconGridLocal, IconGridCloud, MainContainer
   ```
   visible={...} → open={...}
   ```

2. **Icon component removal**
   Old: `import { Icon } from 'antd'` + `<Icon type="xxx" />`
   New: `import { XxxOutlined } from '@ant-design/icons'` + `<XxxOutlined />`

   Identify all Icon usages by searching: `grep -rn "Icon" app/components/ --include="*.js"`

3. **Button icon prop**
   Old: `<Button icon="xxx">` (string)
   New: `<Button icon={<XxxOutlined />}>` (React element)

4. **Menu.SubMenu**
   antd 5 still supports SubMenu but recommend using `items` prop pattern.
   For minimal migration: keep SubMenu (still works in antd 5).

### Step 4: Update app/index.global.css

Some antd class names changed between v3 and v5. Check:
- `.ant-modal-*` classes (mostly same)
- `.ant-menu-*` classes (mostly same)
- `.ant-btn-*` classes (some changed)

Test visually after migration.

### Step 5: Build and test

```bash
npm run build
node test/e2e/acceptance.js
```

### Step 6: Commit

```bash
git add -A && git commit -m "feat: upgrade antd 3 to antd 5

- Migrate to CSS-in-JS (remove antd.min.css import)
- Replace all Modal visible prop with open
- Migrate Icon component to @ant-design/icons
- Update Button icon props to use React elements
- Add @ant-design/icons dependency"
```

---

## Task 4: Full Acceptance Verification

### Step 1: Run complete test suite

```bash
npm run build
npx jest test/unit --verbose
node test/e2e/acceptance.js
```

### Step 2: Visual UI verification

Take screenshots and compare with P0 baseline:
- Splash screen layout unchanged
- Main workspace 3-column layout intact
- antd component styling correct (buttons, menus, modals)
- No broken icons or missing styles

### Step 3: Tag and push

```bash
git tag p1-complete
git push origin master --tags
```

---

## Success Criteria

| Item | Metric |
|------|--------|
| Babel 7 | `npm ls @babel/core` shows 7.x |
| React 18 | `npm ls react` shows 18.x |
| antd 5 | `npm ls antd` shows 5.x |
| No Babel 6 | `npm ls babel-core` returns empty |
| Build passes | `npm run build` exits 0 |
| Acceptance tests | `node test/e2e/acceptance.js` — 20/20 pass |
| UI unchanged | Screenshot comparison with P0 baseline |

## Deferred to P2

- Webpack 4 → 5 (works fine with --openssl-legacy-provider)
- react-hot-loader → React Refresh (needs Webpack 5)
- CSS Modules → CSS-in-JS (optional)
