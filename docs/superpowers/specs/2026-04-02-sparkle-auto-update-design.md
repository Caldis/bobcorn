# Sparkle Auto-Update — Design Spec

> Bobcorn 应用内静默自动更新机制，基于 electron-updater + GitHub Releases。

## 概述

在左下角底栏（FileMenuBar 同一行）内嵌更新指示器，支持 stable/beta 双通道，用户可在偏好设置中控制更新行为。更新安装前走脏检测流程保护未保存工作。

## 现有基础设施

| 组件 | 状态 | 说明 |
|------|------|------|
| `electron-updater` v6.8.3 | ✅ 已安装 | `autoUpdater.checkForUpdatesAndNotify()` 在 main 进程 |
| Preload bridge | ✅ 已有 | `onUpdateAvailable`, `onUpdateDownloaded`, `installUpdate` |
| `package.json` publish | ✅ 已配 | `provider: "github"`, owner: Caldis, repo: bobcorn |
| CI release.yml | ✅ 已有 | 3 平台构建 + `latest*.yml` + blockmap 上传 |
| Renderer UI | ❌ 缺失 | 事件到达 renderer 但无任何可见反馈 |

## 1. 更新指示器 (UpdateIndicator)

### 位置

FileMenuBar 同一行（`h-[42px]`），`[文件]` 按钮在左，指示器 `ml-auto` 推到右侧。

### 状态机

```
idle → checking → available → downloading → downloaded
                      ↓                         ↓
                    error ←──────────────── error
```

| 状态 | 视觉 | 文案 (i18n) | 交互 |
|------|------|-------------|------|
| idle | 不显示 | — | — |
| checking | 无特殊样式 | `update.checking` | cursor-default |
| available | 6px `bg-brand-500` 圆点 + 单轮 pulse | `update.available` (`{{version}}`) | 点击 → 开始下载 |
| downloading | 微型 Progress bar (48×2px, `bg-brand-500`) | `update.downloading` (`{{percent}}%`) | cursor-default |
| downloaded | 6px `bg-emerald-500` 圆点 | `update.downloaded` (`{{version}}`) | 点击 → 脏检测 → 安装 |
| error | 6px `bg-red-500` 圆点 | `update.error` | 点击 → 重试 |

### 视觉规范

- 文字：`text-[11px] text-foreground-muted`，与底栏一致
- 整体是 `button` 元素：`hover:bg-surface-accent rounded-md px-2 py-1`，与 `[文件]` 按钮同样 hover 态
- `available` 状态圆点 `animate-pulse` 2s 周期，仅脉冲一轮后停止
- Tooltip 提示操作含义（`update.install` / `update.download` / `update.retry`）
- `checking` / `downloading` 时 `cursor-default`，其余可点击状态 `cursor-pointer`

### 脏检测流程

点击 `downloaded` 状态按钮时：

1. 调用共享的 `guardDirtyState()` 函数
2. 若脏 → 弹出确认对话框（复用 close-guard 逻辑）："有未保存更改，保存后更新 / 取消"
3. 保存成功或用户确认 → `electronAPI.installUpdate()`
4. 取消 → 不更新

```ts
// utils/dirtyGuard.ts
export async function guardDirtyState(): Promise<boolean>
// true = 可以继续（已保存或用户放弃更改）
// false = 用户取消
```

`MainContainer` 的 close handler 和更新安装都调用同一个函数，消除重复逻辑。

## 2. 偏好设置对话框 (PreferencesDialog)

### 入口

FileMenuBar 菜单项拆分：
- **项目设置** (`menu.file.projectSettings`) — 打开现有 PrefixDialog
- **偏好设置** (`menu.file.preferences`) — 打开新的 PreferencesDialog

### 布局

单页纵向分区，无 tab（内容不多）。复用 `ui/dialog.tsx`，宽度 `w-[400px]`。

```
┌─ 偏好设置 ────────────────────────── ✕ ─┐
│                                          │
│  外观                                    │
│  ┌──────────────────────────────────┐    │
│  │ 深色模式          [Switch ○━━]   │    │
│  └──────────────────────────────────┘    │
│                                          │
│  更新                                    │
│  ┌──────────────────────────────────┐    │
│  │ 自动检查更新      [Switch ━━●]   │    │
│  │ 发现新版本时自动下载 [Switch ○━━] │    │
│  │ 更新通道     [▾ 稳定版 ────────] │    │
│  └──────────────────────────────────┘    │
│                                          │
│  版本                                    │
│  Bobcorn v1.7.1                          │
│                                          │
└──────────────────────────────────────────┘
```

### 视觉规范

- Section 标题：`text-[11px] uppercase tracking-wide text-foreground-muted font-medium`
- Section 内容：`rounded-lg border border-border bg-surface-muted p-3`
- 行布局：`flex justify-between items-center`，label 左 control 右
- 行间距 `space-y-3`，section 间距 `space-y-5`
- 即时生效 — 修改即保存，无确认按钮
- Switch / Select 复用现有 `ui/switch.tsx` 和 Radix Select

### 更新通道选项

| 值 | 标签 (i18n) | 行为 |
|---|---|---|
| `stable` | `prefs.channelStable` (稳定版) | `allowPrerelease: false` — 只接收正式 release |
| `beta` | `prefs.channelBeta` (测试版) | `allowPrerelease: true` — 同时接收 pre-release |

## 3. 状态管理

### Zustand Store 新增（纯 UI 状态，不持久化）

```ts
// store/index.ts — update slice
updateStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
updateVersion: string | null        // e.g. "1.8.0"
updateProgress: number              // 0-100
updateError: string | null

// actions
setUpdateStatus: (status, version?) => void
setUpdateProgress: (percent) => void
setUpdateError: (error) => void
```

### 持久化偏好（config/index.ts — localStorage）

扩展 `OptionData` 接口：

```ts
autoCheckUpdate: boolean          // 默认 true
autoDownloadUpdate: boolean       // 默认 false
updateChannel: 'stable' | 'beta'  // 默认 'stable'
```

### Main 进程偏好文件

`userData/update-preferences.json` — main 进程启动时读取，不依赖 renderer 加载时序。

```json
{
  "autoCheckUpdate": true,
  "autoDownloadUpdate": false,
  "updateChannel": "stable"
}
```

Renderer 修改偏好时通过 IPC 同步写入此文件。

## 4. IPC 协议

### 现有通道（保留，增强 payload）

| 方向 | 通道 | Payload |
|------|------|---------|
| main → renderer | `update-available` | `{ version: string }` (补充 version) |
| main → renderer | `update-downloaded` | — |
| renderer → main | `install-update` | — |

### 新增通道

| 方向 | 通道 | Payload | 用途 |
|------|------|---------|------|
| main → renderer | `update-checking` | — | 开始检查更新 |
| main → renderer | `update-progress` | `{ percent: number }` | 下载进度 |
| main → renderer | `update-error` | `{ message: string }` | 错误信息 |
| renderer → main | `check-for-update` | — | 手动触发检查 |
| renderer → main | `download-update` | — | 手动触发下载 |
| renderer → main | `set-update-channel` | `{ channel: 'stable' \| 'beta' }` | 切换通道 |
| renderer → main | `sync-update-preferences` | `{ autoCheckUpdate, autoDownloadUpdate, updateChannel }` | 偏好同步到 main |

### Preload 新增

```ts
// preload/index.ts — electronAPI 扩展
onUpdateChecking: (callback) => cleanup
onUpdateProgress: (callback) => cleanup
onUpdateError: (callback) => cleanup
checkForUpdate: () => void
downloadUpdate: () => void
setUpdateChannel: (channel) => void
syncUpdatePreferences: (prefs) => void
```

## 5. Main 进程改造

```
app ready
  ├─ 读 userData/update-preferences.json
  ├─ autoUpdater.autoDownload = autoDownloadUpdate
  ├─ autoUpdater.allowPrerelease = (channel === 'beta')
  ├─ if autoCheckUpdate → autoUpdater.checkForUpdates()
  │
  ├─ autoUpdater.on('checking-for-update') → send('update-checking')
  ├─ autoUpdater.on('update-available', info) → send('update-available', { version: info.version })
  ├─ autoUpdater.on('download-progress', progress) → send('update-progress', { percent })
  ├─ autoUpdater.on('update-downloaded') → send('update-downloaded')
  ├─ autoUpdater.on('error', err) → send('update-error', { message })
  │
  ├─ ipcMain.on('check-for-update') → autoUpdater.checkForUpdates()
  ├─ ipcMain.on('download-update') → autoUpdater.downloadUpdate()
  ├─ ipcMain.on('install-update') → autoUpdater.quitAndInstall()  (已有)
  ├─ ipcMain.on('set-update-channel') → allowPrerelease = ... + checkForUpdates()
  └─ ipcMain.on('sync-update-preferences') → 写 JSON 文件
```

开发模式下（`process.env.NODE_ENV === 'development'`）跳过自动检查，避免干扰。

## 6. CI 兼容性

### 现有流程已兼容

- `latest.yml` / `latest-mac.yml` / `latest-linux.yml` 已上传 ✅
- `.blockmap` 文件已上传（增量更新） ✅
- macOS 签名 + 公证已配置 ✅
- Integrity check 已验证 `latest*.yml` 存在 ✅

### 唯一改动：Beta pre-release 标记

`release.yml` publish job：

```yaml
# gh release create 前添加 pre-release 判断
PRERELEASE_FLAG=""
if [[ "${TAG}" == *"-beta"* || "${TAG}" == *"-alpha"* ]]; then
  PRERELEASE_FLAG="--prerelease"
fi
gh release create "${TAG}" ${PRERELEASE_FLAG} --title "${TAG#v}" --notes-file changelog.md
```

### Beta 发版流程

```bash
npm version 1.8.0-beta.1    # 手动指定版本号
git push origin master --follow-tags
# CI 检测 -beta 后缀 → 创建 pre-release → beta 用户收到更新
```

## 7. i18n Keys

### 更新指示器

| Key | zh-CN | en |
|-----|-------|----|
| `update.checking` | 检查更新… | Checking for updates… |
| `update.available` | {{version}} 可用 | {{version}} available |
| `update.downloading` | {{percent}}% | {{percent}}% |
| `update.downloaded` | {{version}} 就绪 | {{version}} ready |
| `update.error` | 更新失败 | Update failed |
| `update.installTooltip` | 点击安装更新 | Click to install update |
| `update.downloadTooltip` | 点击下载 | Click to download |
| `update.retryTooltip` | 点击重试 | Click to retry |

### 偏好设置

| Key | zh-CN | en |
|-----|-------|----|
| `prefs.title` | 偏好设置 | Preferences |
| `prefs.appearance` | 外观 | Appearance |
| `prefs.darkMode` | 深色模式 | Dark Mode |
| `prefs.update` | 更新 | Updates |
| `prefs.autoCheck` | 自动检查更新 | Auto-check for updates |
| `prefs.autoDownload` | 发现新版本时自动下载 | Auto-download when available |
| `prefs.channel` | 更新通道 | Update channel |
| `prefs.channelStable` | 稳定版 | Stable |
| `prefs.channelBeta` | 测试版 | Beta |
| `prefs.version` | 版本 | Version |

### 菜单项

| Key | zh-CN | en |
|-----|-------|----|
| `menu.file.projectSettings` | 项目设置 | Project Settings |
| `menu.file.projectSettingsDesc` | 字体前缀与项目配置 | Font prefix & project config |
| `menu.file.preferences` | 偏好设置 | Preferences |
| `menu.file.preferencesDesc` | 外观、更新等应用设置 | Appearance, updates & app settings |

## 8. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/index.ts` | 改 | autoUpdater 配置化、新增 IPC handler、读偏好 JSON |
| `src/main/update-preferences.ts` | 新建 | main 进程读写 `userData/update-preferences.json` |
| `src/preload/index.ts` | 改 | 新增 6 个 bridge 方法 |
| `src/renderer/components/SideMenu/UpdateIndicator.tsx` | 新建 | 底栏更新指示器组件 |
| `src/renderer/components/SideMenu/PreferencesDialog.tsx` | 新建 | 偏好设置对话框 |
| `src/renderer/components/SideMenu/FileMenuBar.tsx` | 改 | 拆分菜单项、集成 UpdateIndicator |
| `src/renderer/store/index.ts` | 改 | 新增 update 状态 slice |
| `src/renderer/config/index.ts` | 改 | 新增 3 个偏好字段 |
| `src/renderer/utils/dirtyGuard.ts` | 新建 | 脏检测共享逻辑 |
| `src/renderer/containers/MainContainer/index.tsx` | 改 | 注册 update IPC listener、复用 dirtyGuard |
| `src/renderer/types.d.ts` | 改 | ElectronAPI 类型扩展 |
| `src/locales/zh-CN.json` | 改 | 新增 ~18 个 key |
| `src/locales/en.json` | 改 | 新增 ~18 个 key |
| `.github/workflows/release.yml` | 改 | pre-release 标记 |

## 9. 不在范围

- Windows 代码签名（已有问题，不属于本次）
- Linux 自动更新（AppImage 需要额外处理，electron-updater 对 AppImage 支持有限）
- 更新日志展示（后续可扩展，本次仅版本号）
- 强制更新机制
