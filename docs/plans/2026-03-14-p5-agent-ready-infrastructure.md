# P5: Agent-Ready Infrastructure Implementation Plan

> **Goal:** 使 Bobcorn 成为一个 AI Agent 团队可高质量并行开发的项目，每次功能新增都有完整 ATDD 闭环，可自动推送更新给用户。

## 架构概览

```
Agent 接到任务
    ↓
读取 AGENTS.md + 模块文档 (2min onboarding)
    ↓
创建 feature branch + 锁定共享模块
    ↓
TDD: 写测试 → 实现 → 验证
    ↓
三层视觉防护 (像素快照 + 布局断言 + Vision 审查)
    ↓
CI 全自动验证 (build + lint + unit + E2E + visual)
    ↓
合并 → tag → 自动多平台构建 → GitHub Releases → 用户自动更新
```

---

## 依赖图与执行顺序

```
Task 1 (修复 dev 模式) ──┐
Task 2 (pre-commit)  ──┤── 并行, 无冲突
Task 3 (release 自动化) ─┤
Task 4 (Agent 文档体系) ─┘
                         ↓
Task 5 (三层视觉防护) ←── 需要 dev 模式工作
                         ↓
Task 6 (测试覆盖补全) ←── 需要视觉测试框架
                         ↓
Task 7 (验收 + 发布 v1.0.0)
```

**可并行: Tasks 1-4 | 顺序: Task 5 → 6 → 7**

---

## Task 1: 修复 Dev 模式 (.js → .jsx)

**问题:** `electron-vite dev` 失败 — Vite dep scanner 不识别 .js 文件中的 JSX
**方案:** 重命名 13 个含 JSX 的文件为 .jsx

**文件列表:**
```
app/components/enhance/badge/index.js    → .jsx
app/components/enhance/input/index.js    → .jsx
app/components/IconBlock/index.js        → .jsx
app/components/IconGridLocal/index.js    → .jsx
app/components/IconInfoBar/index.js      → .jsx
app/components/IconToolbar/index.js      → .jsx
app/components/SideEditor/index.js       → .jsx
app/components/SideGrid/index.js         → .jsx
app/components/SideMenu/index.js         → .jsx
app/components/SplashScreen/index.js     → .jsx
app/components/TitleBar/button/index.js  → .jsx
app/components/TitleBar/index.js         → .jsx
app/containers/MainContainer/index.js    → .jsx
```

**验证:** `npx electron-vite dev` 成功启动 + HMR 工作

---

## Task 2: Pre-commit Hooks (husky + lint-staged)

```bash
npm install --save-dev husky lint-staged
npx husky init
```

`.husky/pre-commit`:
```bash
npx lint-staged
```

`package.json` 添加:
```json
"lint-staged": {
  "app/**/*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"],
  "app/**/*.{css,json}": ["prettier --write"]
}
```

---

## Task 3: Release 自动化

### 3a. 添加 version 字段
`package.json`: `"version": "1.0.0"`

### 3b. 创建 `.github/workflows/release.yml`
```yaml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  build-and-release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [windows-latest, ubuntu-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 18, cache: npm }
      - run: npm install --legacy-peer-deps
      - run: npx electron-vite build
      - run: npx electron-builder --publish always
        env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }
```

### 3c. 发布流程
```bash
npm version patch  # 自动 commit + tag
git push origin main --follow-tags  # 触发 CI → 构建 → 发布
```

---

## Task 4: Agent 文档体系

创建面向 AI Agent 的完整文档:

| 文件 | 用途 | 阅读时机 |
|------|------|---------|
| `docs/QUICK_START.md` | 2 分钟上手 | 每个 agent 第一步 |
| `docs/MODULES.md` | 模块注册表 + 所有权 | 规划阶段 |
| `docs/DEPENDENCY_MAP.md` | 变更影响分析 | 合并前 |
| `docs/FEATURE_WORKFLOW.md` | 7 步开发协议 | 开发中 |
| `docs/TESTING.md` | 测试指南 + 模板 | 写测试时 |
| `docs/CONVENTIONS.md` | 代码规范 + 模式 | 编码时 |
| `docs/PARALLEL_DEVELOPMENT.md` | 并行安全 + 锁机制 | 多 agent 协作时 |
| `docs/TROUBLESHOOTING.md` | 常见问题 | 卡住时 |

同时为核心模块创建 README:
- `app/store/README.md`
- `app/database/README.md`
- `app/components/README.md`

---

## Task 5: 三层视觉防护体系

这是本计划最核心的创新 — 解决 AI Agent 无法人工验收 UI 的问题。

### L1: Playwright 像素快照对比

```javascript
// test/e2e/visual-regression.test.js
const { test, expect, _electron } = require('@playwright/test');

test('splash screen matches baseline', async () => {
  const app = await _electron.launch({ args: ['.'] });
  const win = await app.firstWindow();
  await win.waitForTimeout(3000);
  await expect(win).toHaveScreenshot('splash.png', {
    maxDiffPixelRatio: 0.01,  // 允许 1% 像素差异
    animations: 'disabled',
  });
  await app.close();
});
```

Golden files 存储在 `screenshots/baselines/`，首次运行生成，后续对比。

### L2: 布局属性断言

```javascript
// test/e2e/layout-assertions.test.js
test('main container is flex row', async () => {
  const style = await win.locator('[class*=mainContainer]').evaluate(el =>
    window.getComputedStyle(el)
  );
  expect(style.display).toBe('flex');
  expect(style.flexDirection).toBe('row');
  expect(style.height).toBe('100%');
});

test('three-column layout proportions', async () => {
  const menu = await win.locator('[class*=sideMenuFlexWrapper]').boundingBox();
  const grid = await win.locator('[class*=sideIconContainZone]').boundingBox();
  const editor = await win.locator('[class*=sideEditorFlexWrapper]').boundingBox();
  expect(menu.width).toBeCloseTo(250, -1);
  expect(editor.width).toBeCloseTo(250, -1);
  expect(grid.width).toBeGreaterThan(500);
});
```

### L3: Claude Code 直接视觉审查

不需要额外 API 调用。Claude Code 本身是多模态的 — 用 `Read` 工具读取 PNG 截图即可直接"看"并评判 UI 质量。

**Agent 开发流程中的使用方式:**
```
1. Playwright 截图保存到 screenshots/
2. Agent 用 Read 工具读取截图
3. Agent 直接评判: 对齐、间距、配色、布局、空态
4. 对比 P0 基线截图判断是否有回归
5. 不合格 → 修复后重新截图验证
```

零成本，零外部依赖 — 整个 P0-P1 验收就是这么做的。
```

**Agent 开发闭环中的使用方式:**
1. Agent 完成功能开发
2. 构建 + 截屏
3. L1 对比 golden files → 有 diff? 预期中的还是回归?
4. L2 断言关键布局属性 → 结构是否完整?
5. L3 Agent 读取截图 → 目视审查设计质量 → 对比基线判断是否回归
6. 全部通过 → 提交; 任一失败 → 修复后重试

---

## Task 6: 测试覆盖补全

### 目标: 75% 覆盖率

| 模块 | 目标 | 测试文件 | 预估用例数 |
|------|------|---------|-----------|
| database | 85% | test/unit/database.test.js | ~40 |
| store | 80% | test/unit/store.test.js | ~15 |
| utils/svg | 75% | test/unit/svg.test.js | ~20 |
| utils/generators | 75% | test/unit/fontGenerator.test.js | ~25 |
| utils/sanitize | 80% | test/unit/sanitize.test.js | ~15 |
| utils/tools | 80% | test/unit/tools.test.js | ~20 |
| integration | — | test/integration/store-db.test.js | ~15 |
| **总计** | **75%** | | **~150** |

### Vitest 覆盖率配置
```js
// vitest.config.js
coverage: {
  provider: 'v8',
  lines: 75, functions: 75, branches: 70,
  reporter: ['text', 'html', 'lcov'],
}
```

### ATDD 工作流 (每个新功能必须遵循)
```
1. 写 E2E 验收测试 (Playwright) — 描述用户行为
2. 写单元测试 (Vitest) — 描述业务逻辑
3. 实现功能 — 使测试通过
4. L1-L3 视觉验证 — 确保 UI 质量
5. CI 绿灯 → 合并
```

---

## Task 7: Playwright MCP 实时交互测试

利用已安装的 `plugin_playwright` MCP 插件，Agent 可直接操控运行中的 Electron 窗口：
- `browser_navigate` / `browser_click` / `browser_fill_form` — 模拟用户操作
- `browser_take_screenshot` — 实时截屏验证
- `browser_snapshot` — 获取页面 accessibility tree

**使用场景：** Agent 开发新功能后，不写测试脚本，直接交互式验证 UI 行为。比写 `.test.js` 更快的即时反馈循环。

**集成方式：** 在 AGENTS.md 的验收协议中加入 Playwright MCP 作为快速验证选项。

---

## Task 8: 自动安全审计

每次提交后 Agent 自动扫描代码安全风险：

```bash
# 扫描规则
grep -rn "dangerouslySetInnerHTML" app/ --include="*.{js,jsx}" | grep -v "sanitizeSVG"  # 未消毒的 HTML 注入
grep -rn "eval(" app/ --include="*.{js,jsx}"  # eval 使用
grep -rn "innerHTML\s*=" app/ --include="*.{js,jsx}"  # 直接 innerHTML 赋值
grep -rn "nodeIntegration:\s*true" app/  # 不安全的 Electron 配置
grep -rn "password\|secret\|token\|apikey" app/ --include="*.{js,jsx}" -i  # 硬编码密钥
```

**集成方式：**
- 加入 pre-commit hook（快速扫描）
- 加入 CI pipeline（完整审计）
- 在 AGENTS.md 的 PR checklist 中要求安全审查

---

## Task 9: 验收 + 发布 v1.0.0

完成上述所有任务后:
1. 运行完整测试套件 (unit + E2E + visual)
2. 更新 roadmap 和 AGENTS.md
3. `npm version 1.0.0` → 推送 tag → 自动构建发布
4. 验证 auto-updater 工作

---

## 成功标准

| 指标 | 目标 |
|------|------|
| Dev 模式 | `electron-vite dev` HMR < 1s |
| 测试覆盖 | ≥ 75% lines |
| 验收测试 | 21+ E2E checks + 13 flow checks |
| 视觉测试 | L1 像素 + L2 布局 + L3 Vision |
| CI 时间 | < 10 min (build + test + visual) |
| 发布 | tag → 自动多平台构建 → GitHub Releases |
| 文档 | Agent 2 min onboarding |
| 并行安全 | 模块锁机制 + 依赖图 |
