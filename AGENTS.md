# Bobcorn — Agent Instructions

## 项目概述

Bobcorn 是一个 Electron + React 的图标字体管理/生成桌面工具。
用户可以导入 SVG 图标，管理分组，生成 iconfont 字体文件（SVG/TTF/WOFF/WOFF2/EOT）。

## 当前技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| 运行时 | Electron | 28.3.3 |
| UI | React | 16.4 (P1 升级到 18) |
| 组件库 | antd | 3.7 (P1 升级到 5) |
| 构建 | Webpack 4 + Babel 6 | (P1 迁移到 electron-vite + Babel 7) |
| 打包 | electron-builder | 24.13 |
| 数据库 | sql.js (SQLite in-memory) | 0.5 |
| 测试 | Jest + Playwright | 27 / 1.58 |
| Node | 18 (via fnm) | 18.20.8 |

## 开发环境

```bash
# 切换 Node 版本 (必须)
FNM="/c/Users/mail/AppData/Local/Microsoft/WinGet/Packages/Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe/fnm.exe"
eval "$("$FNM" env --shell bash)" && "$FNM" use 18

# 构建
cd /d/Code/bobcorn && npm run build

# 启动
npm start

# 测试
npx jest test/unit --verbose
node test/e2e/acceptance.js
```

## 项目结构

```
bobcorn/
├── app/                    # Electron 应用源码
│   ├── main.dev.js        # 主进程入口
│   ├── index.js           # React 渲染入口
│   ├── menu.js            # 应用菜单
│   ├── app.html           # HTML 模板
│   ├── components/        # React 组件 (全部 class component)
│   ├── containers/        # 根容器 (MainContainer)
│   ├── database/          # sql.js 数据库层
│   ├── config/            # 应用配置
│   ├── utils/             # 工具函数 (SVG, 生成器, 导入器, 爬虫)
│   └── resources/         # 图片, 模板等静态资源
├── test/
│   ├── unit/              # Jest 单元测试
│   └── e2e/               # Playwright E2E + 验收测试
├── docs/                  # 项目文档 (见下方索引)
├── webpack.config.*.js    # Webpack 配置 (P1 后删除)
└── package.json
```

## 文档索引

| 文件 | 内容 |
|------|------|
| `docs/2026-03-14-project-roadmap.md` | 全阶段升级路线图 (P0-P4)，含调整说明 |
| `docs/plans/2026-03-14-p0-security-runnability.md` | P0 实施计划 (已完成) |
| `docs/plans/2026-03-14-p1-toolchain-modernization.md` | P1 实施计划 (进行中) |

## 验收测试协议

每次重大变更后必须运行完整验收：

1. `npm run build` — 构建成功 (exit code 0)
2. `npx jest test/unit --verbose` — 单元测试全过
3. `node test/e2e/acceptance.js` — 20 项 E2E 检查全过
4. 截图 UI 验收 — 闪屏/主界面/窗口控制/工具栏/美学检查

## 关键约定

- `electron.remote` 已废弃，所有 main↔renderer 通信使用 ipcMain/ipcRenderer
- SVG 内容必须经过 `sanitizeSVG()` (DOMPurify) 处理后才能渲染
- 构建脚本需要 `NODE_OPTIONS=--openssl-legacy-provider` (Webpack 4 + Node 18)
- 不要手动编辑 `app/dist/` 下的文件 — 它们是构建产物
