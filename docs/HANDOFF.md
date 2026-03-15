# Session Handoff — 2026-03-16

> 前一个 Claude Code session 的完整交接。新 session 请先读此文档 + AGENTS.md。

## 项目状态

**版本**: v1.1.2 | **GitHub**: Caldis/bobcorn | **路径**: D:\Code\bobcorn

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
| v1.1.2 | **导出修复 + 模板性能升级** | ✅ |

### v1.1.2 修复内容
- 修复导出卡死: punycode ESM/CJS 不兼容 (ucs2.decode undefined)
- 替换 memory-fs 为 EventEmitter+pipe glyph streams (绕过 TextDecoder 兼容性)
- safeCallback 模式 + 120s 超时保护 + 顶层 try/catch
- 生产路径回退 (asar 不存在时回退 dev 路径)
- 导出加载弹窗可关闭
- 导出模板 HTML 性能升级: content-visibility 虚拟滚动 + 分批 DOM 插入
- 新增 E2E 导出测试: Step 8b (5 icons) + Step 13b (2949 icons ICP)
- 移除 memory-fs 依赖, bundle 减小 ~72KB

## 当前进行中: UI 全面现代化 + 多色图标支持

### 目标 1: UI 现代化
- 替换 antd 5 → shadcn/ui (Radix + Tailwind)
- 现代视觉设计 + 暗色模式
- 重构三栏布局
- 导出 HTML 演示页面现代化

### 目标 2: 多色图标
- 多色 SVG 图标保留原始颜色
- 图标上色编辑功能
- Symbol 渲染模式天然支持多色

### 不可变约束
- **导出协议不可变**: .svg, .ttf, .woff, .woff2, .eot, .css, .js 文件格式不能有任何破坏性更改
- **数据库 schema 不可变**: .icp 项目文件必须保持可加载
- 字体生成管线 (svgicons2svgfont → svg2ttf → ttf2woff/woff2/eot) 不变
- contextBridge IPC 模式不变

## 已知问题

1. **electron-builder 本地构建** — winCodeSign symlink 权限错误。workaround: rcedit + unpacked
2. **ESLint warnings** — 48 个 warning，已降级为 warn
3. **E2E ICP 导入测试** — dialog mock 时序偶尔不稳定

## 发版规则 (必须遵守)

- 每完成阶段性改造或累计 ≥10 commit → 发版
- 发版前: build ✓ + vitest ✓ + E2E ✓
- 流程: `npm version patch` → `git push --follow-tags`

## 操作规则

- **禁止盲杀全局 electron 进程** — 用户可能同时调试其他 Electron 项目
- **每次变更后更新**: united-memory + AGENTS.md + roadmap
- **真实数据测试**: 用 ICP fixture (2949 icons) 验证

## 测试基础设施

```bash
npx vitest run                    # 158 单元测试
node test/e2e/full-e2e.js         # 16 完整流程 (含导出 + ICP 导入导出)
node test/e2e/acceptance.js       # 21 E2E checks
node test/e2e/css-integrity.js    # 23 CSS 完整性检查
node test/e2e/layout-assertions.js # 10 布局断言
```

## 关键技术决策记录

| 决策 | 原因 |
|------|------|
| electron-vite 而非 Webpack 5 | 开发启动 30s→<1s |
| antd 3 直接升 5 (跳过 4) | antd 3 与 esbuild 不兼容 |
| sql.js ASM build (非 WASM) | WASM 需要文件加载，ASM 纯 JS 可 bundle |
| punycode-shim.ts | Vite ESM 打包丢失 ucs2 对象，shim 重新组装 |
| EventEmitter glyph streams (非 memory-fs) | stream-browserify TextDecoder 兼容性问题 |
| content-visibility 虚拟滚动 (非 JS 虚拟列表) | 保留 DOM 文本支持 Ctrl+F，零 JS 依赖 |

## 文件结构

```
src/main/index.ts        — 主进程
src/preload/index.ts     — contextBridge
src/renderer/            — React 应用 (全部 .tsx/.ts)
  store/index.ts         — Zustand (State + Actions interfaces)
  database/index.ts      — Database class
  config/index.ts        — AppConfig + 资源路径解析
  components/            — 12 个 .tsx 组件
  utils/                 — sanitize, tools, svg, generators, importers, loaders
  utils/punycode-shim.ts — punycode CJS 兼容 shim
```

## United Memory ID

`20260314-bobcorn-project` — 包含完整项目状态和操作规则
