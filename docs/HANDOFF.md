# Session Handoff — 2026-03-28

> 前一个 Claude Code session 的完整交接。新 session 请先读此文档 + AGENTS.md。

## 项目状态

**版本**: v1.6.5 | **GitHub**: Caldis/bobcorn | **路径**: D:\Code\bobcorn (Windows) / ~/Code/bobcorn (Mac mini)

## 本 Session 完成的工作

### 1. 欢迎界面 modal → inline view (v1.6.2)
- Radix Dialog modal 的 `pointer-events: none` 阻止了窗口关闭按钮
- 改为条件渲染：splash visible → 全页欢迎界面，否则三栏布局
- 移除冗余 `contentVisible` 状态
- 在 `bootstrap.tsx` 中同步应用 dark mode 防止首帧闪白

### 2. macOS 图标白底 + 完整性测试 (v1.6.3)
- 所有 PNG 图标从 RGBA 转 RGB（白色背景），重新生成 .icns
- 新增 `test/unit/icon-integrity.test.js` (11 tests) 检查 PNG color type

### 3. macOS 代码签名 + 公证 (v1.6.4)
- 创建 Developer ID Application 证书 (BIAO CHEN, N7Z52F27XK)
- 配置 5 个 GitHub Secrets + release.yml CI 签名
- 详细文档在 Mac mini `~/Docs/ci-signing/github-macos-codesign.md`
- United Memory: `20260328-gh-macos-codesign`

### 4. 官网 GitHub 按钮颜色修复 (v1.6.5)
- `.nav-links a` 特异性覆盖了 `.btn-primary` 白色文字

## 🔴 待修复: electron-pixel-picker 打包问题

**状态**: v1.6.5 macOS 打开仍报 `Cannot find module 'electron-pixel-picker'`

**根因分析**:
1. `electron-pixel-picker` 在 package.json 中是 `"file:../electron-pixel-picker"` 本地路径依赖
2. `externalizeDepsPlugin` 将它标记为 external，Rollup 生成 `require('electron-pixel-picker')`
3. CI `npm install` 时 `file:../electron-pixel-picker` 路径不存在，模块未安装
4. 即使移除了 `!node_modules`，asar 中也没有 EPP

**已尝试的方案及失败原因**:

| 方案 | 结果 |
|------|------|
| bundle 进 main (exclude from external) | Rollup 无法处理 CJS named exports (`"registerPixelPicker" is not exported`) |
| default import (`import epp from`) | Rollup 报 `"default" is not exported` |
| 添加 `@rollup/plugin-commonjs` | 与 `externalizeDepsPlugin` 冲突，`electron-updater` 也被处理导致构建失败 |
| `files` 中添加 `node_modules/electron-pixel-picker/**` | electron-builder glob 覆盖无效 |
| 移除 `!node_modules` | EPP 是 `file:` 依赖，CI 上路径不存在所以没安装 |

**推荐修复方向** (在 macOS 本地操作):
1. **将 EPP 发布到 npm** — 根本解决 `file:` 本地依赖问题
2. **或改为 GitHub 仓库依赖** — `"electron-pixel-picker": "github:user/repo"`
3. **或将 EPP 源码转为项目内 ESM 模块** — `src/main/pixel-picker.ts`（343 行纯 JS，零依赖）

## 已完成的阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0-P5 | 基础升级 + 工具链 | ✅ |
| Phase 1 | TypeScript 全量迁移 | ✅ |
| v1.1.2 | 导出修复 + 模板性能 | ✅ |
| UI 现代化 | Radix + Tailwind + 暗色模式 | ✅ 进行中 |
| v1.6.2 | 欢迎界面 inline view | ✅ |
| v1.6.3 | 图标白底 + 完整性测试 | ✅ |
| v1.6.4 | macOS CI 签名 + 公证 | ✅ |
| v1.6.5 | CI 修复 + 官网按钮颜色 | ✅ (EPP 待修) |

## 已知问题

1. **🔴 electron-pixel-picker 打包** — macOS/Linux/Windows 分发包中缺失 EPP 模块（见上方详细分析）
2. **electron-builder 本地构建** — winCodeSign symlink 权限错误
3. **ESLint warnings** — 48 个 warning，已降级为 warn

## 发版规则

- `npm version patch` → `git push --follow-tags`
- CI 自动: test → 3 平台构建 → 签名/公证(mac) → publish release
- **不要手动 `gh release create`**

## macOS 签名信息

- 证书: `Developer ID Application: BIAO CHEN (N7Z52F27XK)`
- 文件: Mac mini `~/Docs/ci-signing/keys/`
- Secrets: `MAC_CERTS`, `MAC_CERTS_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

## 测试基础设施

```bash
npx vitest run                    # 213 单元测试 (含 11 icon integrity)
node test/e2e/acceptance.js       # 21 E2E checks
node test/e2e/full-e2e.js         # 17 完整流程
```

## United Memory ID

`20260314-bobcorn-project` — 项目状态
`20260328-gh-macos-codesign` — 签名流程
