# Project Settings Dialog — Design Spec

## Overview

Add a dedicated per-project settings dialog accessible from the ProjectSwitcher popover. Introduces display name, description, and color as first-class project metadata stored inside the .icp file. Migrates font prefix editing from the app-level SettingsDialog into this new project-scoped dialog.

## Data Layer

### DB Schema Changes — `projectAttributes` table

| Column | Type | Default | Purpose |
|---|---|---|---|
| `displayName` | `varchar(255)` | `NULL` | Human-readable name for switcher, title bar |
| `description` | `TEXT` | `NULL` | Optional project notes |
| `projectColor` | `varchar(32)` | `NULL` | Avatar color override (e.g. `#6366f1`) |

### Migration

Follow existing pattern in `initDatabases()`:

```
PRAGMA table_info(projectAttributes) → check for missing columns → ALTER TABLE ADD COLUMN
```

Also update `initNewProject()` CREATE TABLE statement to include the new columns for fresh projects.

`NULL` means "not set" — UI uses fallback logic:
- `displayName ?? projectName` (font prefix)
- `projectColor ?? hash-based auto color`

### New Database API

Thin wrappers over `getProjectAttributes` / `setProjectAttributes`:

```
getProjectDisplayName(): string | null
setProjectDisplayName(name: string | null, cb?)
getProjectDescription(): string | null
setProjectDescription(desc: string | null, cb?)
getProjectColor(): string | null
setProjectColor(color: string | null, cb?)
getProjectStats(): { iconCount: number, groupCount: number, createTime: string, updateTime: string }
```

## Store Layer

`store/index.ts` State additions:

```typescript
projectDisplayName: string | null  // synced from DB
projectColor: string | null        // synced from DB
```

Synced in `syncLeft()` alongside existing `projectName`.

## UI Component

### ProjectSettingsDialog

**File**: `src/renderer/components/SideMenu/ProjectSettingsDialog.tsx`
**Props**: `{ visible: boolean; onClose: () => void }`
**Trigger**: ProjectSwitcher popover "Project Settings" entry

### Section 1 — Identity

```
[Avatar(32, live preview)]  [Name input                    ]
                            [Description textarea, 2 rows  ]
[● ● ● ● ● ● ● ● ● ●]  color palette  [⃠ Auto]
```

- Name input: placeholder shows font prefix as fallback hint
- Description: optional 2-row textarea
- Color palette: 10 preset colors from `AVATAR_COLORS` + "Auto" reset button
- Selected color: ring highlight indicator
- All edits save to DB immediately (onBlur / onChange), no confirm button needed

### Section 2 — Font Prefix

```
┌─ danger border ──────────────────────────┐
│ [prefix input] [Apply button]             │
│ Warning: changing prefix affects all...   │
└──────────────────────────────────────────┘
```

Migrated from SettingsDialog "Advanced" section. Same styling, same validation logic, same confirm dialog on apply. SettingsDialog "Advanced" section is removed entirely.

### Section 3 — Project Info (read-only)

```
File path    D:\...\project.icp   [Copy] [Show in Folder]
Icons        42  ·  Groups  5
Created      2026-03-14
Modified     2026-04-07
```

- All read-only
- Copy: `navigator.clipboard.writeText(path)`
- Show in Folder: `electronAPI.showItemInFolder(path)`
- Unsaved project (no filePath): show "Not saved" with "Save As" button

## Side-Effect Changes

| Location | Change |
|---|---|
| **ProjectAvatar** (`components/ProjectItem.tsx`) | Accept optional `color` prop; use it when present, otherwise hash |
| **ProjectSwitcher** | Button + popover header read `displayName ?? projectName`; pass `projectColor` to Avatar |
| **Title bar** (`MainContainer`) | `document.title` uses `displayName ?? pathBasename ?? 'Untitled'` |
| **SettingsDialog** | Remove "Advanced" section (font prefix area) |
| **ProjectSwitcher popover** | "Project Settings" click opens ProjectSettingsDialog instead of SettingsDialog |
| **SideMenu** | Manage ProjectSettingsDialog visible state |

## i18n Keys

```
projectSettings.title / 项目设置 / Project Settings
projectSettings.identity / 项目身份 / Identity
projectSettings.name / 项目名称 / Project Name
projectSettings.namePlaceholder / 使用字体前缀作为名称 / Uses font prefix as name
projectSettings.description / 项目描述 / Description
projectSettings.descPlaceholder / 添加项目备注... / Add project notes...
projectSettings.color / 项目颜色 / Project Color
projectSettings.colorAuto / 自动 / Auto
projectSettings.fontPrefix / 字体前缀 / Font Prefix
projectSettings.info / 项目信息 / Project Info
projectSettings.filePath / 文件路径 / File Path
projectSettings.unsaved / 未保存 / Not saved
projectSettings.saveAs / 另存为 / Save As
projectSettings.copyPath / 复制路径 / Copy Path
projectSettings.showInFolder / 打开目录 / Show in Folder
projectSettings.icons / 图标 / Icons
projectSettings.groups / 分组 / Groups
projectSettings.created / 创建于 / Created
projectSettings.modified / 修改于 / Modified
```

## Backward Compatibility

- **Old .icp → new Bobcorn**: Migration adds columns with NULL defaults. Fallback logic handles missing values.
- **New .icp → old Bobcorn**: SQLite ignores unknown columns. Old code reads `projectName` only, works fine. New columns preserved for next open in new version.
- **histProj**: Unchanged (`string[]`). Metadata caching deferred to separate work.

## Out of Scope

- Free color picker (10-preset palette is sufficient)
- histProj metadata cache (separate work item)
- Unicode start range / default export path (tier 3, later)
