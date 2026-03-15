# Session Handoff — 2026-03-15

> 前一个 Claude Code session 的完整交接。新 session 请先读此文档 + AGENTS.md。

## 项目状态

**版本**: v1.1.1 | **GitHub**: Caldis/bobcorn | **路径**: D:\Code\bobcorn

全量 TypeScript 迁移完成 (34 files, strict: true)。从 2018 年 Electron 2 + React 16 + Webpack 4 + JS 升级到 Electron 28 + React 18 + antd 5 + electron-vite + TypeScript 5。

## 已完成的阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 | Electron 28, DOMPurify, IPC, sass | ✅ |
| P1 | electron-vite, React 18, antd 5 | ✅ |
| P2 | Zustand, Hooks, sql.js WASM, contextBridge, dead code | ✅ |
| P3 | ESLint, Prettier, Vitest, CI/CD, README | ✅ |
| P4 | Auto-updater, Apple Silicon, E2E test suite | ✅ (市场功能待做) |
| P5 | Agent docs, visual tests, CSS integrity, release automation | ✅ |
| Phase 1 | **TypeScript 全量迁移** (34 files, strict: true) | ✅ |

## 待做事项 (按优先级)

### 立即可做
1. **Phase 2: 服务层抽取** — 组件不直接调 db，通过 iconService / groupService / exportService
2. **Phase 3: 组件拆分** — SideMenu.tsx 800行 → ResourceNav + GroupList + ImportExport + Dialogs
3. **Phase 4: Design Tokens** — 可编程的设计规范替代 CSS 魔法数字

### 功能开发
4. **图标市场** — Iconify API 集成，"发现" tab 改名为 "市场"
5. **视觉验证协议** — docs/ 中已有调研报告，需要实施 `docs/VISUAL_VERIFICATION.md`

## 已知问题

1. **electron-builder 本地构建** — winCodeSign symlink 权限错误导致 NSIS installer 无法在本地生成。workaround: 用 `rcedit` 手动嵌入图标 + 使用 unpacked 版本。CI (GitHub Actions) 不受影响。
2. **ESLint warnings** — 48 个 warning（hooks deps、unused vars），已降级为 warn 不阻塞提交
3. **E2E ICP 导入测试** — Playwright dialog mock 时序有时不稳定，需要额外 waitForTimeout

## 发版规则 (必须遵守)

- 每完成阶段性改造或累计 ≥10 commit → 发版
- 发版同时本地构建桌面版本到 Desktop
- 发版前: build ✓ + vitest ✓ + E2E ✓ + 打包版 Playwright 测试 ✓
- 流程: `npm version patch` → `git push --follow-tags`
- electron-builder 创建 draft → CI publish job 补 changelog

## 操作规则

- **启动前杀旧进程**: `cmd.exe /c "taskkill /f /im Bobcorn.exe"` + `cmd.exe /c "taskkill /f /im electron.exe"`
- **每次变更后更新**: united-memory + AGENTS.md + roadmap
- **真实数据测试**: 用 ICP fixture (2949 icons) 验证，不只测空项目
- **本地打包后必须用 rcedit 嵌入图标**:
  ```bash
  node -e "require('rcedit')('release/win-unpacked/Bobcorn.exe', { icon: 'resources/icon.ico' }).then(() => console.log('Done'))"
  ```

## 关键技术决策记录

| 决策 | 原因 |
|------|------|
| electron-vite 而非 Webpack 5 | 开发启动 30s→<1s，5 个 config→1 个 |
| antd 3 直接升 5 (跳过 4) | antd 3 与 esbuild 不兼容 |
| CJS renderer output | nodeIntegration→contextBridge 后改为 ESM |
| sql.js ASM build (非 WASM) | WASM 需要文件加载，ASM 纯 JS 可 bundle |
| localsConvention: camelCase (非 camelCaseOnly) | camelCaseOnly 会静默丢弃某些类名 |
| electron-updater exclude from externalizeDeps | 否则打包后找不到模块 |

## 测试基础设施

```bash
npx vitest run                    # 158 单元测试
node test/e2e/acceptance.js       # 21 E2E checks
node test/e2e/full-e2e.js         # 14 完整流程 (含 ICP 导入)
node test/e2e/css-integrity.js    # 23 CSS 完整性检查
node test/e2e/layout-assertions.js # 10 布局断言
```

## 文件结构

```
src/main/index.ts        — 主进程
src/preload/index.ts     — contextBridge
src/renderer/            — React 应用 (全部 .tsx/.ts)
  store/index.ts         — Zustand (State + Actions interfaces)
  database/index.ts      — Database class (IconData, GroupData interfaces)
  config/index.ts        — AppConfig, OptionData interfaces
  components/            — 12 个 .tsx 组件
  utils/                 — sanitize, tools, svg, generators, importers, loaders
  vendor-types.d.ts      — sql.js, memory-fs 等无类型依赖声明
  types.d.ts             — CSS modules, images, ElectronAPI 类型
```

## United Memory ID

`20260314-bobcorn-project` — 包含完整项目状态和操作规则
