# Session Handoff — 2026-04-02

> 前一个 Claude Code session 的完整交接。新 session 请先读此文档 + AGENTS.md。

## 项目状态

**版本**: v1.7.1 | **GitHub**: Caldis/bobcorn | **路径**: D:\Code\bobcorn (Windows) / ~/Code/bobcorn (Mac mini)

**分支**: `master`

## 本 Session 完成的工作

### Sparkle Auto-Update (Feature: merged to master)

完整实现了应用内自动更新机制，基于 electron-updater + GitHub Releases。

#### 新增文件 (6):
1. **`src/main/update-preferences.ts`** — main 进程偏好读写 (`userData/update-preferences.json`)
2. **`src/renderer/components/SideMenu/UpdateIndicator.tsx`** — 底栏更新状态指示器
3. **`src/renderer/utils/dirtyGuard.ts`** — 共享脏检测+保存确认工具
4. **`test/unit/config-update.test.ts`** — config 新字段测试
5. **`test/unit/store-update.test.ts`** — store update slice 测试
6. **`test/unit/dirtyGuard.test.ts`** — dirtyGuard 测试

#### 修改文件 (15):
- **main/index.ts** — autoUpdater 配置化、6 个新 IPC handler、dev 模拟器 (Ctrl+Shift+U)
- **preload/index.ts** — 10 个 update bridge 方法 (替换旧的 3 个)
- **types.d.ts** — ElectronAPI 扩展 + `__APP_VERSION__` 声明
- **store/index.ts** — update 状态 slice (status/version/progress/error)
- **config/index.ts** — 3 个偏好字段 (autoCheckUpdate/autoDownloadUpdate/updateChannel)
- **ui/dialog.tsx** — confirm() 支持 async onOk + loading 防重复点击
- **SettingsDialog.tsx** — 新增外观/更新/版本 3 个 section
- **FileMenuBar.tsx** — 集成 UpdateIndicator
- **SideMenu/index.tsx** — 传递 onInstallUpdate prop
- **MainContainer/index.tsx** — update IPC 监听、install handler、close-guard 重构用 dirtyGuard
- **locales/zh-CN.json + en.json** — 22 个新 i18n key
- **release.yml** — beta/alpha tag → GitHub pre-release
- **electron.vite.config.js** — `__APP_VERSION__` Vite define

#### 功能:
- 底栏更新指示器：idle(隐藏)/checking/available(蓝点脉冲)/downloading(进度条)/downloaded(绿点)/error(红点)
- 设置面板：深色模式开关、自动检查更新、自动下载、stable/beta 通道选择、版本号
- 脏检测保护：安装更新前检查未保存更改，复用 close-guard 逻辑
- Beta 通道：tag 含 `-beta` 时 CI 创建 pre-release，beta 用户通过 `allowPrerelease` 接收
- Dev 模拟器：Ctrl+Shift+U 模拟完整更新生命周期

#### 测试状态:
- 288 tests passing (16 test files, +3 new)
- Build: electron-vite build clean

## 待做 / 待验收

1. **发版** — `npm version patch` 发布包含 auto-update 的版本
2. **真实更新测试** — 发布后降版本号 build 一次，验证真实下载+安装流程
3. **Windows 代码签名** — 未做 (SignPath.io 可免费申请，详见 spec)

## 已知问题

1. **sf-symbols-fixture.test.js** — 已从 vitest 默认 suite exclude (corrupt fixture)
2. **electron-pixel-picker 打包** — macOS/Linux/Windows 分发包缺失 EPP 模块 (pre-existing)
3. **ESLint warnings** — 已降级为 warn
4. **dev 模式 quitAndInstall 报错** — 预期行为，模拟器只发送 IPC 事件，无真实下载

## 文档

- **设计 Spec**: `docs/superpowers/specs/2026-04-02-sparkle-auto-update-design.md`
- **实施计划**: `docs/superpowers/plans/2026-04-02-sparkle-auto-update.md`

## 测试命令

```bash
FNM="/c/Users/mail/AppData/Local/Microsoft/WinGet/Packages/Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe/fnm.exe"
eval "$("$FNM" env --shell bash)" && "$FNM" use 18

npx vitest run                    # 288 passing
npx electron-vite build           # clean build
npx electron-vite dev             # dev mode + Ctrl+Shift+U 模拟更新
```

## United Memory ID

`20260314-bobcorn-project` — 项目状态
`20260328-gh-macos-codesign` — 签名流程
