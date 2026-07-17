# Store — Zustand State Management

## Overview

Single Zustand store managing all shared UI state. Replaces the legacy `GlobalEvent` pub/sub system.

**File:** `src/renderer/store/index.js`

## State Tree

```
useAppStore
├── UI State
│   ├── splashScreenVisible: boolean     # Welcome screen visibility (inline, not dialog)
│   ├── selectedGroup: string            # Active group ID ("resource-all" default)
│   ├── selectedIcon: string | null      # Active icon ID
│   ├── selectedSource: "local" | "cloud"# Data source tab
│   ├── sideMenuVisible: boolean         # Left panel toggle
│   └── sideEditorVisible: boolean       # Right panel toggle
│
├── Data
│   └── groupData: Array<GroupRow>       # Cached group list from database
│
└── Actions
    ├── showSplashScreen(show)           # Toggle splash + content visibility
    ├── selectGroup(groupId)             # Set active group, reset icon selection
    ├── selectIcon(iconId)               # Set active icon
    ├── selectSource(source)             # Switch local/cloud, toggle editor
    ├── setSideMenuVisible(visible)      # Toggle left panel
    ├── setSideEditorVisible(visible)    # Toggle right panel
    ├── syncLeft()                       # Refresh groupData from database
    └── syncAll()                        # Refresh all panels (calls syncLeft)
```

## Usage Pattern

```jsx
import useAppStore from '../../store';

function MyComponent() {
  // Read state — use individual selectors to avoid unnecessary re-renders
  const selectedGroup = useAppStore(state => state.selectedGroup);
  const selectGroup = useAppStore(state => state.selectGroup);

  // Call actions
  const handleClick = (id) => selectGroup(id);
}
```

## Rules

1. **One store** — all shared state lives here
2. **Individual selectors** — never destructure the whole store (`useAppStore(s => s.field)`)
3. **No GlobalEvent** — the legacy event system is deleted; do not reintroduce
4. **Local state** — component-only state should use `useState`, not the store
5. **Database sync** — call `syncLeft()` / `syncAll()` after any database mutation that affects the UI
6. **Icon content writes need NO manual cache sync** — see below

## Data Flow

```
User action → store action → (optional: db mutation) → set() → React re-render
                                                    ↓
                                              syncLeft() refreshes groupData from db
```

## Icon Content Cache & Invalidation

IconBlock 的显示内容取自多级缓存 (优先级从高到低):

```
patchedIcons[id]        # 写入方主动注入的最新内容 (快路径)
→ prefetchedContent[id] # 虚拟滚动可见区批量预取
→ props.content         # 网格列表快照 (通常为空, 列表只带元数据)
→ lazyContent           # IconBlock 组件内 idle 查库的结果
```

失效收口在数据层, 写入 callsite 不需要 (也不应该) 手工同步:

```
db.setIconData / renewIconData / updateIconsColor (iconContent 写入)
  → db 层广播 registerOnIconContentChanged(ids)   # bootstrap.tsx 注册
  → store.invalidateIconContent(ids)              # 失效逻辑见 contentCache.ts
      ├── iconContentRevs[id]++    # IconBlock 订阅自己的 rev, 变化后 idle 重载
      ├── 删除 patchedIcons[id] / prefetchedContent[id]  # 旧内容不再遮住新内容
      └── iconContentVersion++     # SideEditor 重新 sync
```

高频路径 (取色拖拽) 可在写入后紧接 `patchIconContent(id, content)` 注入新内容,
IconBlock 见到 patched 即跳过重查库。项目打开/新建时 `resetIconContentCaches()`
清空全部缓存与 rev (复制出的 .icp 图标 id 相同, 防串内容)。

守门: `test/unit/content-cache.test.js` 覆盖失效纯函数行为, 并静态断言
数据层广播接线不被重构拆掉。
