# Batch Icon Operations

## Overview

Add multi-select and batch operations to Bobcorn's icon management. Users can select multiple icons via Ctrl/Shift+Click or a batch mode toggle, then perform bulk actions through a dedicated panel replacing the right-side SideEditor.

## Selection Mechanism

### Store State

Add to Zustand store (`src/renderer/store/index.ts`):

```ts
selectedIcons: Set<string>    // batch-selected icon IDs
batchMode: boolean            // toolbar toggle for click-to-select mode
lastClickedIconId: string | null  // for Shift range selection
```

Actions:

```ts
toggleBatchMode()             // flip batchMode on/off, clear selectedIcons when off
toggleIconSelection(id)       // add/remove single icon from selectedIcons
setIconSelection(ids)         // replace entire selection (for range select)
selectAllIcons(ids)           // select all visible icons
invertSelection(visibleIds)   // invert selection within visible icons
clearSelection()              // clear selectedIcons + exit batchMode
```

### Interaction Rules

| Input | Behavior |
|---|---|
| Click (no modifier, batchMode off) | Single-select (existing behavior) |
| Ctrl+Click / Cmd+Click | Toggle icon in `selectedIcons` (auto-enters batch if selectedIcons.size >= 2) |
| Shift+Click | Range select from `lastClickedIconId` to clicked icon |
| Click (batchMode on) | Toggle icon in `selectedIcons` (no Ctrl needed) |
| Click empty area (batchMode off) | Deselect all |
| Escape | Exit batch mode, clear selection |

### Auto-enter/exit

- When `selectedIcons.size >= 2`, right panel switches to BatchPanel
- When `selectedIcons.size < 2` and `batchMode` is off, right panel reverts to SideEditor
- `batchMode` toggle in toolbar: when turned off, clears `selectedIcons`

## UI Components

### IconBlock Changes

- `checked` prop (already exists, currently unused) receives `selectedIcons.has(icon.id)`
- Batch mode: show checkbox overlay on each icon
- Selected state: blue semi-transparent overlay + checkmark, distinct from single-select border style

### IconGridLocal Changes

- Intercept `onClick` events: check `e.ctrlKey`, `e.metaKey`, `e.shiftKey`
- Maintain `lastClickedIndexRef` for Shift range selection
- Shift+Click: compute range from flat icon list, call `setIconSelection`
- Pass `checked` prop to IconBlock when `batchMode` or `selectedIcons.size > 0`

### IconToolbar Changes

Add batch controls:
- Batch mode toggle button (icon + "批量" text)
- When batch mode active, show: 全选 / 反选 / 取消全选 buttons

### BatchPanel (New Component)

Location: `src/renderer/components/BatchPanel/index.tsx`

Replaces SideEditor when `selectedIcons.size >= 2`. Layout:

**Header**
- "已选中 N 个图标"
- Thumbnail grid preview: show up to 9 icon SVGs, overflow shows "+N"

**Operations** (vertical button list)

| Button | Action |
|---|---|
| 移动到分组 | Group selector dropdown → `db.moveIcons(ids, group)` |
| 复制到分组 | Group selector dropdown → `db.duplicateIcons(ids, group)` |
| 删除 | Confirm dialog → `db.moveIcons(ids, 'resource-recycleBin')` |
| 导出 SVG | Directory picker → write each icon's SVG to file |
| 统一颜色 | Color picker → `db.updateIconsColor(ids, color)` |

**Footer**
- "取消选择" button → `clearSelection()`

### MainContainer Integration

```
{selectedIcons.size >= 2 ? <BatchPanel /> : <SideEditor />}
```

## Database Methods

Add to `src/renderer/database/index.ts`:

### `moveIcons(ids: string[], targetGroup: string)`

```sql
UPDATE iconData SET iconGroup = ? WHERE id IN (?, ?, ...)
```

Single SQL statement. Also used for batch recycle (targetGroup = 'resource-recycleBin').

### `delIcons(ids: string[])`

```sql
DELETE FROM iconData WHERE id IN (?, ?, ...)
```

For permanent deletion from recycle bin.

### `duplicateIcons(ids: string[], targetGroup: string)`

Loop in single transaction: for each icon, read data, generate new UUID + iconCode, insert copy.

### `updateIconsColor(ids: string[], targetColor: string)`

Loop in single transaction: for each icon, read `iconContent`, call `replaceSvgColor` to replace ALL colors with `targetColor`, update `iconContent`. Does NOT modify `iconContentOriginal` (preserving per-icon reset capability).

## File Structure

```
src/renderer/
├── store/index.ts              # + selectedIcons, batchMode, batch actions
├── components/
│   ├── BatchPanel/
│   │   └── index.tsx           # NEW — batch operations panel
│   ├── IconBlock/index.tsx     # + checked prop wiring, batch select styles
│   ├── IconGridLocal/index.tsx # + Ctrl/Shift/batch click handling
│   ├── IconToolbar/index.tsx   # + batch toggle, 全选/反选/取消
│   └── SideEditor/index.tsx    # (unchanged)
├── containers/MainContainer.tsx # + conditional BatchPanel vs SideEditor
└── database/index.ts           # + moveIcons, delIcons, duplicateIcons, updateIconsColor
```

## Edge Cases

- **Group change while batch selected**: clear selection (same as single select)
- **Search while batch selected**: preserve selection, but only show matched icons; batch panel still shows full count
- **Delete last icon in group**: group becomes empty, show empty state
- **Duplicate icon codes on batch copy**: `getNewIconCode()` called per icon in sequence, guaranteed unique
- **Mixed-color batch recolor**: all colors in each SVG replaced with target color; `iconContentOriginal` preserved for per-icon reset
