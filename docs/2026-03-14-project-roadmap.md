# Bobcorn 升级路线图

> 最后更新: 2026-03-14

## 概述

将 Bobcorn 从 2018 年代技术栈全面现代化，同时保持功能完整性。

## 阶段总览

| 阶段 | 状态 | 核心目标 |
|------|------|---------|
| P0 | ✅ 完成 | 安全修复 & 基础可运行性 |
| P1 | ✅ 完成 | 核心工具链现代化 |
| P2 | ✅ 完成 | 架构改进 |
| P3 | 🔄 进行中 | 工程化 |
| P4 | 📋 计划 | 功能增强 |

---

## P0: 安全 & 基础可运行性 ✅

**完成时间:** 2026-03-14

| 事项 | 变更 |
|------|------|
| Electron 升级 | 2.0.5 → 28.3.3 |
| node-sass 替换 | node-sass → sass (dart-sass) |
| 安全修复 | 移除 webSecurity:false, 添加 DOMPurify SVG 消毒 |
| remote 迁移 | electron.remote → ipcRenderer/ipcMain |
| 测试基础 | Jest 单元测试 + Playwright E2E 验收 (20 checks) |
| Node 版本 | 通过 fnm 使用 Node 18 |

---

## P1: 核心工具链现代化 🔄

**目标:** 一步到位迁移到现代构建栈

| # | 事项 | 变更 | 说明 |
|---|------|------|------|
| 1 | Babel 升级 | 6 → 7 | 所有后续升级的前提 |
| 2 | 构建系统替换 | Webpack 4 → electron-vite | 替代 Webpack 5 升级，5 个 config → 1 个 |
| 3 | React 升级 | 16.4 → 18 | createRoot API, 移除 react-hot-loader |
| 4 | UI 框架升级 | antd 3 → 5 | Modal visible→open, Icon 迁移, CSS-in-JS |

**关键决策:** 选择 electron-vite 而非 Webpack 5，理由：
- 开发启动 ~30s → <1s
- 5 个 webpack config → 1 个 electron.vite.config.js
- 内置 React Fast Refresh (替代弃用的 react-hot-loader)
- 内置 CSS Modules, 资源处理 (替代 url-loader, file-loader)
- 不再需要 DLL 预构建
- 不再需要 `--openssl-legacy-provider`

---

## P2: 架构改进 📋

> 因引入 electron-vite，部分项从原计划调整

| # | 事项 | 变更 | 调整说明 |
|---|------|------|---------|
| 1 | ✅ TypeScript | JS → TS | tsconfig + 类型声明就位，渐进迁移 |
| 2 | ✅ 状态管理 | GlobalEvent → Zustand | 集中式 store 替代事件总线 |
| 3 | ✅ 组件模式 | Class → Functional + Hooks | 12 个组件全部转换 |
| 4 | ✅ 数据库层 | sql.js 0.5 → sql.js 1.14 (WASM) | 异步初始化，消除 asm.js 警告 |
| 5 | ✅ 清理死代码 | 删除 IconGridCloud, CENTER_ICONS | GlobalEvent/GlobalData 已删除 |
| 6 | 🔄 Preload 脚本 | nodeIntegration → contextBridge | 正确的 Electron 安全模式 |

**P2 调整说明:**
- TypeScript 从 P3 提前到 P2，因为 electron-vite + Vite 提供开箱即用的 TS 支持
- 新增 "Preload 脚本" 任务，将 renderer 改为 contextIsolation 模式（Electron 安全最佳实践）
- Zustand 替代 Redux/MobX，因为项目状态简单，无需重型方案

---

## P3: 工程化 📋

| # | 事项 | 说明 | 调整说明 |
|---|------|------|---------|
| 1 | ESLint + Prettier | 统一代码风格 | 无变化 |
| 2 | 测试覆盖 | Vitest 替代 Jest | electron-vite 原生集成 Vitest (原 Jest 迁移) |
| 3 | CI/CD | GitHub Actions | 构建命令改为 electron-vite build |
| 4 | README | 开发文档 | 无变化 |

**P3 调整说明:**
- Jest → Vitest，因为 Vitest 是 Vite 原生测试框架，共享配置和转译管线
- CI/CD 的构建命令需适配 electron-vite

---

## P4: 功能增强 📋

| # | 事项 | 说明 | 调整说明 |
|---|------|------|---------|
| 1 | iconfont.cn 爬虫 | Nightmare.js → Playwright | 已安装 Playwright，直接复用 |
| 2 | 自动更新 | electron-updater | electron-builder 24 已支持 |
| 3 | Apple Silicon | arm64 构建 | electron-vite + electron-builder 原生支持 |
| 4 | 清理 .idea | gitignore 已包含 | 无变化 |

**P4 调整说明:**
- iconfont.cn 爬虫：Nightmare.js 改用已安装的 Playwright，无需额外依赖
- Apple Silicon：electron-vite 的构建天然支持 arm64 target

---

## 变更日志

| 日期 | 变更 |
|------|------|
| 2026-03-14 | 创建路线图；P0 完成；确定 electron-vite 方向；调整 P1-P4 计划 |
| 2026-03-14 | P1 完成 (electron-vite, React 18, antd 5) |
| 2026-03-14 | P2 完成 (TypeScript, Zustand, Hooks, sql.js, 死代码清理, contextBridge) |
| 2026-03-14 | P3 大部分完成 (ESLint, Prettier, GitHub Actions CI, README)；Vitest 待做 |
