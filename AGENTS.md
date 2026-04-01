# Bobcorn — Agent Instructions

## 项目概述

Bobcorn 是一个 Electron + React 的图标字体管理/生成桌面工具。
用户可以导入 SVG 图标，管理分组，生成 iconfont 字体文件（SVG/TTF/WOFF/WOFF2/EOT）。

## 当前技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| 运行时 | Electron | 28.3.3 |
| UI | React (functional + hooks) | 18 |
| 组件库 | Radix UI + Tailwind + lucide-react | — |
| 状态管理 | Zustand | latest |
| 构建 | electron-vite | 3.x |
| 打包 | electron-builder | 24.13 |
| 数据库 | sql.js (WASM) | 1.14 |
| 类型 | TypeScript (渐进迁移中) | 5.x |
| 测试 | Vitest + Playwright | 3.x / 1.58 |
| Node | 18 (via fnm) | 18.20.8 |

## 开发环境

```bash
# 切换 Node 版本 (必须)
FNM="/c/Users/mail/AppData/Local/Microsoft/WinGet/Packages/Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe/fnm.exe"
eval "$("$FNM" env --shell bash)" && "$FNM" use 18

# 开发模式 (HMR 热更新，首选)
cd /d/Code/bobcorn && npx electron-vite dev

# 如需重启整个应用 (main/preload 变更时):
# 先确保单实例 — 按命令行路径精确匹配 bobcorn 的 electron 进程，避免误杀其他 Electron 应用
powershell -Command "Get-CimInstance Win32_Process -Filter \"name='electron.exe'\" | Where-Object { \$_.CommandLine -like '*bobcorn*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }"
npx electron-vite dev
```

## 项目结构

```
bobcorn/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── index.js       # 主进程入口
│   │   └── menu.js        # 应用菜单
│   ├── preload/           # Preload 脚本
│   │   └── index.js       # contextBridge API
│   └── renderer/          # React 渲染进程
│       ├── index.html     # Vite HTML 模板
│       ├── entry.js       # Vite renderer 入口
│       ├── bootstrap.jsx  # React 挂载 (createRoot)
│       ├── store/         # Zustand 状态管理
│       ├── components/    # React 组件 (全部 functional + hooks)
│       ├── containers/    # 根容器 (MainContainer)
│       ├── database/      # sql.js 1.x WASM 数据库层
│       ├── config/        # 应用配置
│       ├── utils/         # 工具函数 (SVG, 生成器, 导入器, 爬虫)
│       └── resources/     # 图片, 模板等静态资源
├── electron.vite.config.js # 构建配置 (main + preload + renderer)
├── tsconfig.json          # TypeScript 配置
├── test/
│   ├── unit/              # Vitest 单元测试
│   └── e2e/               # Playwright E2E + 验收测试
├── docs/                  # 项目文档 (见下方索引)
└── package.json
```

## 文档索引

### Agent 开发文档

| 文件 | 内容 |
|------|------|
| `docs/QUICK_START.md` | 2 分钟上手 (fnm、build、test 命令) |
| `docs/MODULES.md` | 模块注册表 (store、database、components、utils、main、preload) |
| `docs/FEATURE_WORKFLOW.md` | 新功能开发 7 步流程 |
| `docs/TESTING.md` | Vitest 单元测试 + Playwright E2E 指南 |
| `docs/CONVENTIONS.md` | 代码规范 (hooks only、CSS modules、sanitizeSVG、IPC 模式) |
| `docs/TROUBLESHOOTING.md` | 常见问题速查 |
| `docs/RELEASE.md` | 发版流程 (每阶段或每 10 commit 发一次) |
| `docs/HANDOFF.md` | Session 交接文档 (架构决策、已知问题、待做事项) |
| `docs/PARALLEL_DEVELOPMENT.md` | 并行开发协作协议 |
| `docs/DEPENDENCY_MAP.md` | 模块依赖与变更影响分析 |
| `src/renderer/store/README.md` | State tree + 使用模式 |
| `src/renderer/database/README.md` | Schema + 异步初始化 + CRUD API |

## 测试流程

### 开发时

renderer 改动通过 HMR 热更新，无需重启。main/preload 改动需重启应用（先杀旧进程保持单实例）。

判断是否需要重启：
- **仅 renderer**（组件/store/utils/样式）→ HMR 自动生效，无需操作
- **涉及 main/preload**（IPC/窗口/菜单/文件系统 API）→ 杀进程 + 重启 `npx electron-vite dev`

### 发版前完整验收 (必须全部通过)

```bash
# 0. 确保单实例 (按命令行路径精确匹配 bobcorn)
powershell -Command "Get-CimInstance Win32_Process -Filter \"name='electron.exe'\" | Where-Object { \$_.CommandLine -like '*bobcorn*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }"

# 1. 构建
npx electron-vite build

# 2. 单元测试 (169 tests)
npx vitest run

# 3. E2E 验收测试 (21 checks)
node test/e2e/acceptance.js

# 4. Full E2E 流程测试 (15 steps)
node test/e2e/full-e2e.js

# 5. 安全审计
npm run security-audit
```

所有测试必须全部通过，0 失败。当前已知问题需优先修复后才能发版。

### 发版

```bash
npm version patch   # 或 minor / major
git push origin master --follow-tags
```

CI 自动处理：test → 3 平台构建 → 验证产物齐全 → 创建 release 上传。
**不要手动 `gh release create`**，会导致 CI 产物丢失。
详见 `docs/RELEASE.md`。

CI 失败时：查看日志 → 修复 → 删 tag 重打 → 重新 push。

## 关键约定

- 状态管理使用 Zustand store (`src/renderer/store/index.js`)，不要引入 GlobalEvent
- 所有组件是 functional + hooks，不要写 class components
- main↔renderer 通信使用 ipcMain/ipcRenderer (无 electron.remote)
- SVG 内容必须经过 `sanitizeSVG()` (DOMPurify) 处理后才能渲染
- 图片资源必须用 ES import（Vite 要求）
- sql.js 异步初始化：bootstrap.jsx 中 `await dbReady` 确保 WASM 加载
- electron-vite CJS renderer: 自定义 `electronCjsHtmlPlugin` 处理 HTML
- 不要手动编辑 `out/` 目录 — 它们是构建产物
- **i18n 必须遵守**: 所有用户可见字符串必须使用 `t()` 函数（`react-i18next`），不允许硬编码中文或英文。新增功能时必须同时在 `src/locales/zh-CN.json` 和 `src/locales/en.json` 中添加翻译 key。详见 `docs/CONVENTIONS.md` 的 i18n 章节。
