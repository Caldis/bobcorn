# Database — sql.js Data Layer

## Overview

In-memory SQLite database powered by sql.js (ASM build). Manages project metadata, icon groups, and icons.

**File:** `src/renderer/database/index.js`

## Async Initialization

```
src/renderer/entry.js → src/renderer/bootstrap.jsx → await dbReady → createRoot().render()
```

The database must be initialized before any React component renders. `dbReady` is a Promise exported from `database/index.js`.

```js
import db from '../database';          // Singleton instance
import { dbReady } from '../database'; // Init promise
```

## Schema

### `projectAttributes`

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(255) | Always `'projectAttributes'` |
| projectName | varchar(255) | Font family prefix (default: `'iconfont'`) |
| createTime | datetime | Auto-set |
| updateTime | datetime | Auto-updated via trigger |

### `groupData`

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(255) | UUID |
| groupName | varchar(255) | Display name |
| groupOrder | int | Sort order |
| groupColor | varchar(255) | Color tag (unused) |
| createTime | datetime | Auto-set |
| updateTime | datetime | Auto-updated via trigger |

### `iconData`

| Column | Type | Description |
|--------|------|-------------|
| id | varchar(255) | UUID |
| iconCode | varchar(255) | Unicode PUA code (hex, e.g. `'E001'`) |
| iconName | varchar(255) | Display name |
| iconGroup | varchar(255) | Parent group ID |
| iconSize | int | File size in bytes |
| iconType | varchar(255) | File extension (e.g. `'svg'`) |
| iconContent | TEXT | SVG markup |
| createTime | datetime | Auto-set |
| updateTime | datetime | Auto-updated via trigger |

### Reserved Group IDs

| ID | Meaning |
|----|---------|
| `resource-all` | Virtual group — shows all icons |
| `resource-uncategorized` | Default group for ungrouped icons |
| `resource-deleted` | Soft-delete trash |

## CRUD API

### Project

| Method | Description |
|--------|-------------|
| `initNewProject(name?)` | Create tables and triggers |
| `initNewProjectFromData(data)` | Load from binary SQLite data |
| `resetProject(name?)` | Destroy and re-create |
| `exportProject(cb)` | Export as Uint8Array via callback |
| `getProjectName()` | Get font prefix |
| `setProjectName(name, cb?)` | Set font prefix |

### Groups

| Method | Description |
|--------|-------------|
| `addGroup(name, cb?)` | Create group (auto UUID + order) |
| `delGroup(id, cb?)` | Delete group and its icons |
| `getGroupList()` | Get all groups (returns `[]` if empty) |
| `getGroupName(id)` | Get name (handles reserved IDs) |
| `setGroupName(id, name, cb?)` | Rename group |

### Icons

| Method | Description |
|--------|-------------|
| `addIcons(filesData, group, cb?)` | Import from file paths |
| `addIconsFromData(data, group, cb?)` | Import from data objects |
| `delIcon(id, cb?)` | Delete icon |
| `getIconList()` | All icons (excludes deleted) |
| `getIconListFromGroup(group)` | Icons in group (accepts string or array) |
| `getIconCount()` | Total icon count |
| `setIconName(id, name, cb?)` | Rename icon |
| `setIconCode(id, code, cb?)` | Change Unicode code |
| `moveIconGroup(id, group, cb?)` | Move to another group |
| `duplicateIconGroup(id, group, cb?)` | Copy to another group |
| `getNewIconCode()` | Next available PUA code |
| `iconCodeCanUse(code)` | Check if code is available |

## Key Detail: String Quoting

SQL string values must be wrapped with `sf()` (adds single quotes):

```js
import { sf } from '../utils/tools';
const dataSet = { iconName: sf('my-icon') };
// Produces: iconName = 'my-icon' in SQL
```

This is handled automatically by the high-level API methods (`addGroup`, `setIconName`, etc.).
The low-level methods (`addDataToTable`, `setDataOfTable`) require manual `sf()` wrapping.
