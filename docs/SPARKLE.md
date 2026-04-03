# Sparkle Auto-Update — 维护指南

> Bobcorn 应用内自动更新机制的运维手册。基于 electron-updater + GitHub Releases。

## 架构概览

```
GitHub Releases (latest*.yml + 安装包)
        ↑ CI 上传                    ↓ electron-updater 轮询
  release.yml                    main 进程 (autoUpdater)
  (3 平台构建 + publish)              ↓ IPC 事件
                                 preload bridge
                                      ↓
                                 renderer (UpdateIndicator + store)
```

**数据流**：CI 发布 → GitHub Release 产物 → 客户端 autoUpdater 检查 `latest*.yml` → 对比版本号 → 下载 → 安装

## 发版流程

### Stable 发布

```bash
npm version patch   # 或 minor / major
git push origin master --follow-tags
```

CI 自动：test → 3 平台构建 → 验证产物齐全 → 创建 release + 上传安装包和 `latest*.yml`。

**不要手动 `gh release create`**，会导致 CI 产物丢失。

### Beta 发布

```bash
npm version 1.9.0-beta.1   # 手动指定 prerelease 版本
git push origin master --follow-tags
```

CI 检测 tag 含 `-beta` / `-alpha` → `gh release create --prerelease`。
只有设置中选择"测试版"通道的用户（`allowPrerelease: true`）会收到更新。

### 发版后验证

```bash
# 检查 release 产物
gh release view v1.8.7 --json assets --jq '.assets[].name'

# 验证 latest.yml 文件名匹配
gh release download v1.8.7 --pattern "latest.yml" --output -
```

**关键检查**：`latest.yml` 中的 `path` 字段必须和实际上传的 `.exe` 文件名一致（都用连字符 `Bobcorn-Setup-X.Y.Z.exe`）。

## 文件清单

### Main 进程

| 文件 | 职责 |
|------|------|
| `src/main/index.ts` | autoUpdater 配置、IPC handler、事件转发 |
| `src/main/update-preferences.ts` | 读写 `userData/update-preferences.json` |

### Preload

| 文件 | 职责 |
|------|------|
| `src/preload/index.ts` | 11 个 update bridge 方法（5 事件监听 + 6 操作） |

### Renderer

| 文件 | 职责 |
|------|------|
| `src/renderer/components/SideMenu/UpdateIndicator.tsx` | 底栏更新指示器 + hover 卡片 |
| `src/renderer/components/SideMenu/SettingsDialog.tsx` | 偏好设置（外观/更新/高级/版本） |
| `src/renderer/containers/MainContainer/index.tsx` | IPC 监听注册、install handler、close-guard |
| `src/renderer/store/index.ts` | updateStatus/Version/ReleaseNotes/Progress/Error slice |
| `src/renderer/config/index.ts` | autoCheckUpdate/autoDownloadUpdate/updateChannel (localStorage) |
| `src/renderer/utils/dirtyGuard.ts` | 安装前脏检测共享逻辑 |

### CI

| 文件 | 职责 |
|------|------|
| `.github/workflows/release.yml` | 3 平台构建 + changelog 生成 + pre-release 标记 |
| `dev-app-update.yml` | Dev 模式下 autoUpdater 的 publish 配置 |

## 偏好设置双层同步

用户偏好存在两个地方，保持同步：

| 存储 | 读取方 | 说明 |
|------|--------|------|
| `localStorage` (`option` key) | Renderer | 即时读写，UI 响应快 |
| `userData/update-preferences.json` | Main 进程 | 启动时读取，不依赖 renderer 加载 |

**同步时机**：renderer 修改偏好 → `setOption()` 更新 localStorage → `syncUpdatePreferences` IPC → main 写 JSON 文件。

## 更新状态机

```
idle → checking → available → downloading → downloaded → (install)
                      ↓              ↓
                    error ←───── error
```

| 状态 | 触发 | 底栏显示 |
|------|------|----------|
| idle | 启动 / 无更新 / 取消 | 不显示 |
| checking | 自动或手动检查 | "检查更新…" |
| available | 发现新版本 | 蓝点 + "vX.Y.Z 可用"，点击下载 |
| downloading | 下载中 | 进度条 + 百分比 + ✕ 取消按钮 |
| downloaded | 下载完成 | 绿点 + "重启更新至 vX.Y.Z"，hover 显示 changelog 卡片 |
| error | 检查/下载失败 | 红点 + "更新失败"，点击重试 |

**错误处理策略**：
- 启动自动检查失败 → 静默回到 idle（不打扰用户）
- 用户手动检查失败 → 显示错误状态
- `autoDownloadUpdate=true` 时 → 跳过 available，直接进入 downloading

## Dev 模式调试

### 模拟更新生命周期

按 `Ctrl+Shift+U` 触发完整模拟：checking → available(v99.0.0) → downloading(0→100%) → downloaded

### 测试真实更新流程

1. 将 `package.json` 版本号改低（如 `1.0.0`）
2. `dev-app-update.yml` 已配置 GitHub provider
3. `autoUpdater.forceDevUpdateConfig = true` 已在 `!app.isPackaged` 时自动启用
4. 启动 dev → 自动检测到 GitHub 上的最新 release
5. **测试完记得恢复版本号**

### Debug 日志

Main 进程通过 `updaterLog()` 将日志发送到 renderer DevTools Console（蓝色高亮）：
- `[updater] checking-for-update`
- `[updater] update-available: 1.8.7`
- `[updater] download-progress: 42%`
- `[updater] error: ...`

不使用 `console.log` 避免 EPIPE broken pipe 错误（electron-vite dev 的 main 进程 stdout 可能关闭）。

### Dev 模式安装保护

点击"重启更新"时弹出确认框（仅 dev），因为 `quitAndInstall()` 在 dev 模式下会导致进程崩溃。通过 `import.meta.env.DEV` 判断，production build 时会被 tree-shaken。

## Changelog 生成

CI 自动从 conventional commits 生成：

- `feat(...)` → Features
- `fix(...)` → Bug Fixes
- `refactor/build/test/docs/ci/chore/security(...)` → Other Changes
- 三个 section 都为空 → 兜底 "Bug fixes and improvements"
- 空 section 不输出标题

### 客户端 i18n

Changelog 内容保持英文（commit message 原文），section 标题在客户端替换为当前语言：
- "What's Changed" → 更新内容
- "Features" → 新功能
- "Bug Fixes" → 问题修复
- "Other Changes" → 其他更改

## 已知限制

| 问题 | 说明 |
|------|------|
| Windows 未签名 | 用户首次安装会看到 SmartScreen 警告。SignPath.io 可免费申请（见 spec） |
| Linux AppImage | electron-updater 对 AppImage 自动更新支持有限 |
| Dev 模式 quitAndInstall | 会崩溃，已加保护弹窗 |
| 下载取消 | UI 重置为 idle，但后台下载可能仍在进行 |

## Troubleshooting

### 更新检查无反应

1. 确认 `autoCheckUpdate` 是否开启（设置 → 更新）
2. Dev 模式需要 `dev-app-update.yml` 存在
3. 检查 DevTools Console 的 `[updater]` 日志
4. `checkForUpdates() resolved: null (updater inactive)` → `forceDevUpdateConfig` 未生效

### 下载 404

`latest.yml` 中的文件名与 release 实际文件名不匹配。检查 `package.json` 的 `build.win.artifactName` 是否为 `${productName}-Setup-${version}.${ext}`。

### 启动时显示"更新失败"

已修复：自动检查的错误静默处理（v1.8.5+）。如果仍出现，检查网络连接或 GitHub API rate limit。

## 相关文档

- **设计 Spec**: `docs/superpowers/specs/2026-04-02-sparkle-auto-update-design.md`
- **实施计划**: `docs/superpowers/plans/2026-04-02-sparkle-auto-update.md`
- **发版流程**: `docs/RELEASE.md`
