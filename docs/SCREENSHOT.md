# Screenshot Automation — 维护指南

> 自动化截图工具的架构、使用方法、已知陷阱及解决方案。

## 架构

```
scripts/screenshot.mjs (Node.js)
    ├─ 启动 electron-vite dev (NO_DEVTOOLS=1, WIN_WIDTH/WIN_HEIGHT)
    ├─ 通过 CDP (Chrome DevTools Protocol) 连接到 renderer
    ├─ 通过暴露的全局变量操控应用状态
    │    ├─ window.__BOBCORN_STORE__  → Zustand store
    │    ├─ window.__BOBCORN_I18N__   → i18next 实例
    │    └─ window.__BOBCORN_DB__     → sql.js 数据库实例
    ├─ 通过自定义事件打开对话框
    │    ├─ bobcorn:open-settings
    │    ├─ bobcorn:open-export
    │    ├─ bobcorn:open-move-dialog
    │    └─ bobcorn:open-copy-dialog
    ├─ 通过 Swift + CoreGraphics 获取 CGWindowID
    └─ 通过 macOS screencapture -l 截取带阴影的窗口
```

## 使用

```bash
# 默认：亮色模式，中英文，1440×1080，输出到桌面
npm run screenshot

# 暗色模式
npm run screenshot:dark

# E2E 验收（输出到 test/e2e/screenshots/）
npm run screenshot:acceptance

# 自定义参数
node scripts/screenshot.mjs --width=1600 --height=1200 --theme=dark --lang=en /path/to/project.icp
```

## 截图场景 (7 个)

| # | 文件名 | 场景 | 触发方式 |
|---|--------|------|----------|
| 01 | welcome.png | 欢迎/启动页 | `store.showSplashScreen(true)` |
| 02 | main.png | 三栏主界面 | `store.showSplashScreen(false)` + `syncLeft()` |
| 03 | settings.png | 设置对话框 | `CustomEvent('bobcorn:open-settings')` |
| 04 | export.png | 导出对话框 | `CustomEvent('bobcorn:open-export')` |
| 05 | batch.png | 批量选择 | `store.selectAllIcons(ids)` |
| 06 | move.png | 移动到分组 | 选中图标 → `CustomEvent('bobcorn:open-move-dialog')` |
| 07 | copy.png | 复制到分组 | 选中图标 → `CustomEvent('bobcorn:open-copy-dialog')` |

## 环境变量

| 变量 | 用途 | 消费方 |
|------|------|--------|
| `NO_DEVTOOLS` | 跳过 openDevTools + electron-debug | main/index.ts, main/menu.ts |
| `WIN_WIDTH` | 窗口宽度（默认 1200） | main/index.ts |
| `WIN_HEIGHT` | 窗口高度（默认 800） | main/index.ts |
| `OPEN_FILE` | 启动时打开的 .icp 文件 | main/index.ts |

## 已知陷阱与解决方案

### 1. React 事件无法通过 CDP 触发

**问题**: `element.click()`、`dispatchEvent(new MouseEvent())`、CDP `Input.dispatchMouseEvent` 都无法触发 React 18 的合成事件处理器。

**原因**: React 18 使用自己的事件委托系统（挂在 root 节点上），不响应原生 DOM 事件的 dispatch。

**解决**: 在组件内注册 `window.addEventListener('bobcorn:xxx', handler)`，从 CDP 用 `window.dispatchEvent(new CustomEvent('bobcorn:xxx'))` 触发。

**已实现的事件**: `bobcorn:open-settings` (SideMenu)、`bobcorn:open-export` (SideMenu)、`bobcorn:open-move-dialog` (SideEditor)、`bobcorn:open-copy-dialog` (SideEditor)。

### 2. 禁止直接删除 React 管理的 DOM

**问题**: `document.querySelector('[data-radix-portal]').remove()` 删除 Radix Dialog 的 Portal 节点后，React 内部状态不变，导致：
1. 同一对话框无法重新打开（`setVisible(true)` 不触发因为值已是 `true`）
2. Virtual DOM 和真实 DOM 不一致，后续渲染出错
3. 状态污染在跨操作时扩散（如跨语言截图全白）

**解决**: 关闭对话框必须走 React 状态路径：
- **最佳**: 添加 `bobcorn:close-xxx` 自定义事件
- **次选**: 通过 CDP 找到对话框的 Cancel 按钮并 click
- **禁止**: `element.remove()`

### 3. 跨语言截图状态污染

**问题**: 第一轮语言截图结束后，第二轮切换语言时整个页面白屏。

**原因**: `showSplashScreen` toggle 会卸载/重新挂载子组件，如果之前有 DOM 层面的污染（见上条），React 的 reconciliation 会失败。

**解决**: 在两次语言截图之间用 `location.reload()` 彻底重置页面。reload 后需要：
1. 重新等待 `__BOBCORN_STORE__` 就绪
2. 重新加载 .icp 项目文件
3. 重新获取 CGWindowID（reload 可能改变窗口）

### 4. SingletonLock 残留

**问题**: 强制杀 Electron 进程后，`~/Library/Application Support/Bobcorn/SingletonLock` 残留，新实例会静默退出（exit code 0，无错误输出）。

**解决**: 启动前总是清理锁文件。已在 `screenshot.mjs` 的 `killApp()` 中实现。

### 5. macOS 获取窗口 ID

**问题**: 需要 CGWindowID 用于 `screencapture -l`。

| 方案 | 结果 |
|------|------|
| Python pyobjc | ❌ 不一定安装 |
| JXA (osascript -l JavaScript) | ❌ 无法调用 C 函数 |
| **Swift** | ✅ macOS 自带，直接调用 CoreGraphics |

**注意**: CGWindowID 可能在 `location.reload()` 或窗口重建后变化。每轮截图前需重新获取。

### 6. Electron 主进程日志

**问题**: electron-vite dev 的 main 进程 stdout 不转发到终端。

**解决**: 写文件日志到 `os.tmpdir()`，或使用 `updaterLog()` 发送到 renderer DevTools Console。

### 7. 数据库 API

- 加载项目: `db.initNewProjectFromData(data: Uint8Array)` （不是 `db.loadProject`）
- 获取图标列表: `db.getIconList()`
- 恢复后同步: `store.syncLeft()` + `store.selectGroup('resource-all')`
- API 参考: `src/renderer/database/README.md`

## 文件清单

| 文件 | 职责 |
|------|------|
| `scripts/screenshot.mjs` | 截图自动化脚本 |
| `src/renderer/bootstrap.tsx` | 暴露 `__BOBCORN_STORE__` / `__BOBCORN_I18N__` / `__BOBCORN_DB__` |
| `src/main/index.ts` | `NO_DEVTOOLS` / `WIN_WIDTH` / `WIN_HEIGHT` / `OPEN_FILE` 环境变量 |
| `src/main/menu.ts` | `NO_DEVTOOLS` 跳过 `openDevTools()` |
| `src/renderer/components/SideMenu/index.tsx` | `bobcorn:open-settings` / `bobcorn:open-export` 事件监听 |
| `src/renderer/components/SideEditor/index.tsx` | `bobcorn:open-move-dialog` / `bobcorn:open-copy-dialog` 事件监听 |

## 测试项目文件

截图使用 `sf-symbols-good.icp` 作为测试数据（~7000 图标）。
路径: `/Users/caldis/Desktop/sf-symbols-good.icp`

如需在其他设备上使用，请将此文件复制到对应位置并更新 `package.json` 中 `screenshot` 脚本的路径。
