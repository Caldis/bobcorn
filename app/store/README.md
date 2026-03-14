# Store — Zustand State Management

## Overview

Single Zustand store managing all shared UI state. Replaces the legacy `GlobalEvent` pub/sub system.

**File:** `app/store/index.js`

## State Tree

```
useAppStore
├── UI State
│   ├── splashScreenVisible: boolean     # Welcome dialog visibility
│   ├── contentVisible: 0 | 1            # Main content opacity (0=hidden, 1=visible)
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

## Data Flow

```
User action → store action → (optional: db mutation) → set() → React re-render
                                                    ↓
                                              syncLeft() refreshes groupData from db
```
