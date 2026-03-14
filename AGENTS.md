# Bobcorn — Agent Instructions

## 项目概述

Bobcorn 是一个 Electron + React 的图标字体管理/生成桌面工具。
用户可以导入 SVG 图标，管理分组，生成 iconfont 字体文件（SVG/TTF/WOFF/WOFF2/EOT）。

## 当前技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| 运行时 | Electron | 28.3.3 |
| UI | React (functional + hooks) | 18 |
| 组件库 | antd (CSS-in-JS) | 5 |
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

# 启动前杀旧进程！
taskkill /f /im electron.exe 2>/dev/null

# 构建 + 启动
cd /d/Code/bobcorn && npx electron-vite build && npx electron-vite preview

# 验收测试 (20 checks)
npx electron-vite build && node test/e2e/acceptance.js
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
| `src/renderer/store/README.md` | State tree + 使用模式 |
| `src/renderer/database/README.md` | Schema + 异步初始化 + CRUD API |

### 项目规划

| 文件 | 内容 |
|------|------|
| `docs/2026-03-14-project-roadmap.md` | 全阶段升级路线图 (P0-P4) |
| `docs/plans/2026-03-14-p0-security-runnability.md` | P0 实施计划 (已完成) |
| `docs/plans/2026-03-14-p1-toolchain-modernization.md` | P1 实施计划 (已完成) |
| `docs/plans/2026-03-14-p5-agent-ready-infrastructure.md` | P5 实施计划 |

## 验收测试协议

每次重大变更后必须运行完整验收：

1. `npx electron-vite build` — 构建成功
2. `node test/e2e/acceptance.js` — 20 项 E2E 检查全过
3. 截图 UI 验收 — 闪屏/主界面/窗口控制/工具栏/美学检查

## 关键约定

- 状态管理使用 Zustand store (`src/renderer/store/index.js`)，不要引入 GlobalEvent
- 所有组件是 functional + hooks，不要写 class components
- main↔renderer 通信使用 ipcMain/ipcRenderer (无 electron.remote)
- SVG 内容必须经过 `sanitizeSVG()` (DOMPurify) 处理后才能渲染
- 图片资源必须用 ES import（Vite 要求）
- sql.js 异步初始化：bootstrap.jsx 中 `await dbReady` 确保 WASM 加载
- electron-vite CJS renderer: 自定义 `electronCjsHtmlPlugin` 处理 HTML
- 不要手动编辑 `out/` 目录 — 它们是构建产物
