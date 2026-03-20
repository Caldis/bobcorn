# Batch Icon Operations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select and batch operations (delete, move, copy, export, recolor) to Bobcorn's icon management.

**Architecture:** Extend Zustand store with batch selection state. Ctrl/Shift+Click and toolbar toggle for multi-select. New BatchPanel component replaces SideEditor when 2+ icons selected. Database gets batch SQL methods.

**Tech Stack:** React + Zustand, sql.js, existing SVG color utilities.

**Spec:** `docs/superpowers/specs/2026-03-20-batch-operations-design.md`

---

## File Structure

```
Create:
  src/renderer/components/BatchPanel/index.tsx    — batch operations panel

Modify:
  src/renderer/store/index.ts                     — batch selection state + actions
  src/renderer/database/index.ts                  — batch SQL methods
  src/renderer/components/IconBlock/index.tsx      — batch select styling + checkbox
  src/renderer/components/IconGridLocal/index.tsx  — Ctrl/Shift/batch click handling
  src/renderer/components/IconToolbar/index.tsx    — batch mode toggle + 全选/反选
  src/renderer/containers/MainContainer/index.tsx  — conditional BatchPanel vs SideEditor
```

---

### Task 1: Store — Batch Selection State

**Files:**
- Modify: `src/renderer/store/index.ts`

- [ ] **Step 1: Add batch state to State interface (line ~7)**

After `selectedIcon: string | null;` add:

```typescript
  selectedIcons: Set<string>;
  batchMode: boolean;
  lastClickedIconId: string | null;
```

- [ ] **Step 2: Add batch actions to Actions interface (line ~26)**

```typescript
  toggleBatchMode: () => void;
  toggleIconSelection: (id: string) => void;
  setIconSelection: (ids: string[]) => void;
  selectAllIcons: (ids: string[]) => void;
  invertSelection: (visibleIds: string[]) => void;
  clearBatchSelection: () => void;
  setLastClickedIconId: (id: string | null) => void;
```

- [ ] **Step 3: Add initial state values (in create callback)**

```typescript
  selectedIcons: new Set<string>(),
  batchMode: false,
  lastClickedIconId: null,
```

- [ ] **Step 4: Implement batch actions**

```typescript
  toggleBatchMode: () => {
    const current = get().batchMode;
    set({
      batchMode: !current,
      selectedIcons: new Set<string>(),
      lastClickedIconId: null,
    });
  },
  toggleIconSelection: (id: string) => {
    const next = new Set(get().selectedIcons);
    if (next.has(id)) next.delete(id); else next.add(id);
    set({ selectedIcons: next, lastClickedIconId: id });
  },
  setIconSelection: (ids: string[]) => {
    set({ selectedIcons: new Set(ids) });
  },
  selectAllIcons: (ids: string[]) => {
    set({ selectedIcons: new Set(ids) });
  },
  invertSelection: (visibleIds: string[]) => {
    const current = get().selectedIcons;
    const inverted = visibleIds.filter((id) => !current.has(id));
    set({ selectedIcons: new Set(inverted) });
  },
  clearBatchSelection: () => {
    set({ selectedIcons: new Set<string>(), batchMode: false, lastClickedIconId: null });
  },
  setLastClickedIconId: (id: string | null) => {
    set({ lastClickedIconId: id });
  },
```

- [ ] **Step 5: Clear batch selection on group change**

In `selectGroup` action (line ~65), add `selectedIcons: new Set<string>(), batchMode: false, lastClickedIconId: null` to the `set()` call.

- [ ] **Step 6: Build and verify no type errors**

```bash
npx electron-vite build 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/store/index.ts
git commit -m "feat: add batch selection state to store"
```

---

### Task 2: Database — Batch Methods

**Files:**
- Modify: `src/renderer/database/index.ts`

- [ ] **Step 1: Add moveIcons method (after moveIconGroup ~line 858)**

```typescript
  moveIcons = (ids: string[], targetGroup: string, callback?: () => void): void => {
    dev && console.log('moveIcons');
    const group = targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup;
    const placeholders = ids.map(() => '?').join(',');
    this.db!.run(
      `UPDATE ${iconData} SET iconGroup = ? WHERE id IN (${placeholders})`,
      [group, ...ids]
    );
    callback && callback();
  };
```

- [ ] **Step 2: Add delIcons method (after delIcon ~line 747)**

```typescript
  delIcons = (ids: string[], callback?: () => void): void => {
    dev && console.log('delIcons');
    const placeholders = ids.map(() => '?').join(',');
    this.db!.run(`DELETE FROM ${iconData} WHERE id IN (${placeholders})`, ids);
    callback && callback();
  };
```

- [ ] **Step 3: Add duplicateIcons method (after duplicateIconGroup ~line 875)**

```typescript
  duplicateIcons = (ids: string[], targetGroup: string, callback?: () => void): void => {
    dev && console.log('duplicateIcons');
    const group = targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup;
    ids.forEach((id) => {
      const source = this.getIconData(id);
      const dataSet: DataSet = {
        id: sf(generateUUID()),
        iconCode: sf(this.getNewIconCode() as string),
        iconName: sf(source.iconName),
        iconGroup: sf(group),
        iconSize: source.iconSize,
        iconType: sf(source.iconType),
        iconContent: sf(source.iconContent),
        iconContentOriginal: sf(source.iconContentOriginal || source.iconContent),
      };
      this.addDataToTable(iconData, dataSet);
    });
    callback && callback();
  };
```

- [ ] **Step 4: Add updateIconsColor method**

```typescript
  updateIconsColor = (ids: string[], targetColor: string, callback?: () => void): void => {
    dev && console.log('updateIconsColor');
    ids.forEach((id) => {
      const icon = this.getIconData(id);
      let content = icon.iconContent;
      // Extract all colors and replace each with target
      const colors = extractSvgColors(content);
      colors.forEach((c: { color: string }) => {
        content = replaceSvgColor(content, c.color, targetColor);
      });
      const escaped = content.replace(/'/g, "''");
      this.setIconData(id, { iconContent: `'${escaped}'` });
    });
    callback && callback();
  };
```

Add imports at top of file:

```typescript
import { extractSvgColors, replaceSvgColor } from '../utils/svg/colors';
```

- [ ] **Step 5: Build and verify**

```bash
npx electron-vite build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/database/index.ts
git commit -m "feat: add batch database methods (move, delete, duplicate, recolor)"
```

---

### Task 3: IconBlock — Batch Selection Visuals

**Files:**
- Modify: `src/renderer/components/IconBlock/index.tsx`

- [ ] **Step 1: Add batch selection state from store (after line 40)**

```typescript
  const batchSelected = useAppStore((state: any) => state.selectedIcons.has(data.id));
  const batchMode = useAppStore((state: any) => state.batchMode);
  const showCheckbox = batchMode || useAppStore((state: any) => state.selectedIcons.size > 0);
```

- [ ] **Step 2: Update checkbox rendering (line 71-73)**

Replace:
```typescript
{checked !== undefined && (
  <Checkbox className="absolute -top-0.5 -right-1.5 z-10" checked={checked} />
)}
```

With:
```typescript
{showCheckbox && (
  <Checkbox className="absolute -top-0.5 -right-1.5 z-10" checked={batchSelected} />
)}
```

- [ ] **Step 3: Add batch-selected visual style (in className, line ~54)**

Add after the `selected &&` block:

```typescript
batchSelected && !selected && [
  'bg-brand-50 border-brand-300',
  'dark:bg-brand-950/30 dark:border-brand-500/50',
]
```

- [ ] **Step 4: Build and verify**

```bash
npx electron-vite build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/IconBlock/index.tsx
git commit -m "feat: batch selection visuals in IconBlock"
```

---

### Task 4: IconGridLocal — Multi-Select Click Handling

**Files:**
- Modify: `src/renderer/components/IconGridLocal/index.tsx`

- [ ] **Step 1: Add store subscriptions (after line 81)**

```typescript
  const batchMode = useAppStore((state: any) => state.batchMode);
  const selectedIcons = useAppStore((state: any) => state.selectedIcons);
  const toggleIconSelection = useAppStore((state: any) => state.toggleIconSelection);
  const setIconSelection = useAppStore((state: any) => state.setIconSelection);
  const lastClickedIconId = useAppStore((state: any) => state.lastClickedIconId);
  const setLastClickedIconId = useAppStore((state: any) => state.setLastClickedIconId);
  const clearBatchSelection = useAppStore((state: any) => state.clearBatchSelection);
```

- [ ] **Step 2: Build flat icon list ref for Shift-select**

```typescript
  // Flat list of all visible icon IDs for Shift range selection
  const flatIconIdsRef = useRef<string[]>([]);
  useEffect(() => {
    if (selectedGroup === 'resource-all' && allGroupChunks) {
      flatIconIdsRef.current = allGroupChunks.flatMap(({ chunks }) =>
        chunks.flatMap((c) => c.map((icon) => icon.id))
      );
    } else {
      flatIconIdsRef.current = filteredIcons.map((icon) => icon.id);
    }
  }, [selectedGroup, allGroupChunks, filteredIcons]);
```

- [ ] **Step 3: Replace handleIconSelected with batch-aware version**

Replace the existing `handleIconSelected` prop usage. Wrap the parent's `handleIconSelected`:

```typescript
  const handleIconClick = useCallback(
    (id: string, data: any, e?: React.MouseEvent) => {
      const isCtrl = e && (e.ctrlKey || e.metaKey);
      const isShift = e && e.shiftKey;

      if (batchMode || isCtrl) {
        // Toggle single icon in batch selection
        toggleIconSelection(id);
        return;
      }

      if (isShift && lastClickedIconId) {
        // Range select
        const ids = flatIconIdsRef.current;
        const startIdx = ids.indexOf(lastClickedIconId);
        const endIdx = ids.indexOf(id);
        if (startIdx !== -1 && endIdx !== -1) {
          const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          const rangeIds = ids.slice(lo, hi + 1);
          setIconSelection(rangeIds);
        }
        return;
      }

      // Normal single click
      setLastClickedIconId(id);
      handleIconSelected(id, data);
    },
    [batchMode, lastClickedIconId, toggleIconSelection, setIconSelection, setLastClickedIconId, handleIconSelected]
  );
```

- [ ] **Step 4: Update IconChunk to forward mouse event**

Modify `IconChunk` component to pass `onClick` event through. Update the `handleIconSelected` prop type and usage in `IconBlock` to accept an optional `MouseEvent` parameter.

In `IconBlock/index.tsx`, change the click handler:

```typescript
  const handleSelected = useCallback((e: React.MouseEvent) => {
    handleIconSelected?.(data.id, data, e);
  }, [data.id]);
```

Update the `handleIconSelected` prop type:
```typescript
handleIconSelected?: (id: string, data: IconData, e?: React.MouseEvent) => void;
```

In `IconChunk`, pass `handleIconClick` instead of `handleIconSelected`.

- [ ] **Step 5: Clear batch on background click**

Update the deselect click handler (line ~243):

```typescript
  const deselectIcon = useCallback(() => {
    if (selectedIcons.size > 0) {
      clearBatchSelection();
    }
    handleIconSelected(null);
  }, [handleIconSelected, selectedIcons, clearBatchSelection]);
```

- [ ] **Step 6: Escape key to exit batch mode**

```typescript
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (batchMode || selectedIcons.size > 0)) {
        clearBatchSelection();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [batchMode, selectedIcons, clearBatchSelection]);
```

- [ ] **Step 7: Build and verify**

```bash
npx electron-vite build 2>&1 | tail -5
```

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/IconGridLocal/index.tsx src/renderer/components/IconBlock/index.tsx
git commit -m "feat: Ctrl/Shift/batch click selection in IconGridLocal"
```

---

### Task 5: IconToolbar — Batch Mode Toggle

**Files:**
- Modify: `src/renderer/components/IconToolbar/index.tsx`

- [ ] **Step 1: Add store subscriptions and imports**

```typescript
import { CheckSquare, CheckCircle, XCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import useAppStore from '../../store';
```

```typescript
  const batchMode = useAppStore((state: any) => state.batchMode);
  const selectedIcons = useAppStore((state: any) => state.selectedIcons);
  const toggleBatchMode = useAppStore((state: any) => state.toggleBatchMode);
  const selectAllIcons = useAppStore((state: any) => state.selectAllIcons);
  const invertSelection = useAppStore((state: any) => state.invertSelection);
  const clearBatchSelection = useAppStore((state: any) => state.clearBatchSelection);
```

- [ ] **Step 2: Accept `visibleIconIds` prop**

Add to props interface:

```typescript
  visibleIconIds?: string[];
```

- [ ] **Step 3: Add batch controls to toolbar JSX**

After the search input area, add:

```tsx
{/* Batch mode toggle */}
<button
  className={cn(
    'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
    batchMode
      ? 'bg-brand-500 text-white'
      : 'text-foreground-muted hover:text-foreground hover:bg-surface-accent'
  )}
  onClick={toggleBatchMode}
  title="批量选择模式"
>
  {batchMode ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
  批量
</button>

{/* Batch action buttons — visible when batch mode active */}
{(batchMode || selectedIcons.size > 0) && (
  <div className="flex items-center gap-1 ml-1">
    <button
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-foreground-muted hover:text-foreground hover:bg-surface-accent"
      onClick={() => selectAllIcons(visibleIconIds || [])}
      title="全选"
    >
      <CheckSquare size={12} /> 全选
    </button>
    <button
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-foreground-muted hover:text-foreground hover:bg-surface-accent"
      onClick={() => invertSelection(visibleIconIds || [])}
      title="反选"
    >
      <CheckCircle size={12} /> 反选
    </button>
    {selectedIcons.size > 0 && (
      <button
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-foreground-muted hover:text-foreground hover:bg-surface-accent"
        onClick={clearBatchSelection}
        title="取消全选"
      >
        <XCircle size={12} /> 取消
      </button>
    )}
  </div>
)}
```

- [ ] **Step 4: Pass visibleIconIds from IconGridLocal**

In `IconGridLocal`, pass `visibleIconIds={flatIconIdsRef.current}` to `<IconToolbar>`.

- [ ] **Step 5: Build and verify**

```bash
npx electron-vite build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/IconToolbar/index.tsx src/renderer/components/IconGridLocal/index.tsx
git commit -m "feat: batch mode toggle and select-all controls in toolbar"
```

---

### Task 6: BatchPanel — New Component

**Files:**
- Create: `src/renderer/components/BatchPanel/index.tsx`

- [ ] **Step 1: Create BatchPanel component**

```tsx
import React, { useCallback, useMemo } from 'react';
import { Trash2, FolderInput, Copy, Download, Palette } from 'lucide-react';
import { cn } from '../../lib/utils';
import { sanitizeSVG } from '../../utils/sanitize';
import { message, confirm } from '../ui';
import db from '../../database';
import useAppStore from '../../store';

function BatchPanel({ selectedGroup }: { selectedGroup: string }) {
  const selectedIcons = useAppStore((state: any) => state.selectedIcons);
  const clearBatchSelection = useAppStore((state: any) => state.clearBatchSelection);
  const syncLeft = useAppStore((state: any) => state.syncLeft);

  const selectedIds = useMemo(() => Array.from(selectedIcons), [selectedIcons]);

  // Fetch icon data for preview thumbnails
  const iconPreviews = useMemo(() => {
    return selectedIds.slice(0, 9).map((id: string) => {
      const data = db.getIconData(id);
      return { id, content: data?.iconContent || '' };
    });
  }, [selectedIds]);

  const groupList = useMemo(() => db.getGroupList(), []);

  // --- Operations ---

  const handleMove = useCallback((targetGroup: string) => {
    db.moveIcons(selectedIds, targetGroup);
    syncLeft();
    clearBatchSelection();
    message.success(`已移动 ${selectedIds.length} 个图标`);
  }, [selectedIds]);

  const handleCopy = useCallback((targetGroup: string) => {
    db.duplicateIcons(selectedIds, targetGroup);
    syncLeft();
    clearBatchSelection();
    message.success(`已复制 ${selectedIds.length} 个图标`);
  }, [selectedIds]);

  const handleDelete = useCallback(() => {
    confirm({
      title: '批量删除',
      content: `确定要将 ${selectedIds.length} 个图标移入回收站吗？`,
      okText: '删除',
      onOk() {
        db.moveIcons(selectedIds, 'resource-recycleBin');
        syncLeft();
        clearBatchSelection();
        message.success(`已删除 ${selectedIds.length} 个图标`);
      },
    });
  }, [selectedIds]);

  const handleExport = useCallback(async () => {
    const { electronAPI } = window as any;
    const result = await electronAPI.showSaveDialog({
      title: '选择导出目录',
      properties: ['openDirectory'],
    });
    if (!result || result.canceled) return;
    const dirPath = result.filePath || result.filePaths?.[0];
    if (!dirPath) return;

    selectedIds.forEach((id: string) => {
      const data = db.getIconData(id);
      if (data) {
        const fileName = `${data.iconName}.svg`;
        electronAPI.writeFileSync(`${dirPath}/${fileName}`, data.iconContent);
      }
    });
    message.success(`已导出 ${selectedIds.length} 个图标`);
  }, [selectedIds]);

  // Color picker state
  const [showColorPicker, setShowColorPicker] = React.useState(false);
  const [batchColor, setBatchColor] = React.useState('#000000');

  const handleApplyColor = useCallback(() => {
    db.updateIconsColor(selectedIds, batchColor);
    syncLeft();
    message.success(`已统一 ${selectedIds.length} 个图标颜色`);
    setShowColorPicker(false);
  }, [selectedIds, batchColor]);

  // Group selector for move/copy
  const [groupAction, setGroupAction] = React.useState<'move' | 'copy' | null>(null);

  return (
    <div className={cn(
      'relative w-full h-full flex flex-col',
      'border-l border-border',
      'bg-surface dark:bg-surface'
    )}>
      {/* Win32 title bar spacer */}
      <div className="h-[32px] shrink-0 [-webkit-app-region:drag]" />

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Header */}
        <div className="text-center py-4">
          <div className="text-lg font-semibold text-foreground">
            已选中 {selectedIds.length} 个图标
          </div>
        </div>

        {/* Thumbnail preview grid */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {iconPreviews.map((icon: any) => (
            <div
              key={icon.id}
              className="aspect-square rounded-lg bg-surface-muted dark:bg-surface-muted flex items-center justify-center p-2 [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: sanitizeSVG(icon.content) }}
            />
          ))}
          {selectedIds.length > 9 && (
            <div className="aspect-square rounded-lg bg-surface-muted dark:bg-surface-muted flex items-center justify-center text-sm text-foreground-muted font-medium">
              +{selectedIds.length - 9}
            </div>
          )}
        </div>

        {/* Group selector (for move/copy) */}
        {groupAction && (
          <div className="mb-4 p-3 rounded-lg border border-border bg-surface-muted dark:bg-surface-muted">
            <div className="text-sm font-medium mb-2">
              {groupAction === 'move' ? '移动到' : '复制到'}:
            </div>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {groupList.map((g: any) => (
                <button
                  key={g.id}
                  className={cn(
                    'text-left px-3 py-1.5 rounded text-sm',
                    'hover:bg-brand-50 dark:hover:bg-brand-950/40',
                    'text-foreground'
                  )}
                  onClick={() => {
                    if (groupAction === 'move') handleMove(g.id);
                    else handleCopy(g.id);
                    setGroupAction(null);
                  }}
                >
                  {g.groupName}
                </button>
              ))}
            </div>
            <button
              className="mt-2 text-xs text-foreground-muted hover:text-foreground"
              onClick={() => setGroupAction(null)}
            >
              取消
            </button>
          </div>
        )}

        {/* Color picker */}
        {showColorPicker && (
          <div className="mb-4 p-3 rounded-lg border border-border bg-surface-muted dark:bg-surface-muted">
            <div className="text-sm font-medium mb-2">统一颜色:</div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={batchColor}
                onChange={(e) => setBatchColor(e.target.value)}
                className="w-10 h-8 rounded cursor-pointer"
              />
              <input
                type="text"
                value={batchColor}
                onChange={(e) => setBatchColor(e.target.value)}
                className="flex-1 px-2 py-1 rounded border border-border bg-surface text-sm font-mono"
              />
              <button
                className="px-3 py-1 rounded bg-brand-500 text-white text-sm font-medium hover:bg-brand-600"
                onClick={handleApplyColor}
              >
                应用
              </button>
            </div>
            <button
              className="mt-2 text-xs text-foreground-muted hover:text-foreground"
              onClick={() => setShowColorPicker(false)}
            >
              取消
            </button>
          </div>
        )}

        {/* Operation buttons */}
        {!groupAction && !showColorPicker && (
          <div className="flex flex-col gap-2">
            <button
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-surface-accent dark:hover:bg-white/5 transition-colors"
              onClick={() => setGroupAction('move')}
            >
              <FolderInput size={18} className="text-foreground-muted" /> 移动到分组
            </button>
            <button
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-surface-accent dark:hover:bg-white/5 transition-colors"
              onClick={() => setGroupAction('copy')}
            >
              <Copy size={18} className="text-foreground-muted" /> 复制到分组
            </button>
            <button
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-surface-accent dark:hover:bg-white/5 transition-colors"
              onClick={handleDelete}
            >
              <Trash2 size={18} className="text-foreground-muted" /> 删除
            </button>
            <button
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-surface-accent dark:hover:bg-white/5 transition-colors"
              onClick={handleExport}
            >
              <Download size={18} className="text-foreground-muted" /> 导出 SVG
            </button>
            <button
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-surface-accent dark:hover:bg-white/5 transition-colors"
              onClick={() => setShowColorPicker(true)}
            >
              <Palette size={18} className="text-foreground-muted" /> 统一颜色
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 p-4 border-t border-border">
        <button
          className="w-full py-2 rounded-lg text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-surface-accent transition-colors"
          onClick={clearBatchSelection}
        >
          取消选择
        </button>
      </div>
    </div>
  );
}

export default BatchPanel;
```

- [ ] **Step 2: Build and verify**

```bash
npx electron-vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/BatchPanel/index.tsx
git commit -m "feat: BatchPanel component with all batch operations"
```

---

### Task 7: MainContainer — Conditional Panel Rendering

**Files:**
- Modify: `src/renderer/containers/MainContainer/index.tsx`

- [ ] **Step 1: Import BatchPanel and store**

```typescript
import BatchPanel from '../components/BatchPanel';
```

Add store subscription:

```typescript
const selectedIcons = useAppStore((state: any) => state.selectedIcons);
```

- [ ] **Step 2: Replace SideEditor rendering (line ~185)**

Replace:
```tsx
<SideEditor selectedGroup={selectedGroup} selectedIcon={selectedIcon} />
```

With:
```tsx
{selectedIcons.size >= 2 ? (
  <BatchPanel selectedGroup={selectedGroup} />
) : (
  <SideEditor selectedGroup={selectedGroup} selectedIcon={selectedIcon} />
)}
```

- [ ] **Step 3: Build and verify**

```bash
npx electron-vite build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/containers/MainContainer/index.tsx
git commit -m "feat: conditional BatchPanel vs SideEditor in MainContainer"
```

---

### Task 8: Integration Test & Polish

- [ ] **Step 1: Build full app**

```bash
npx electron-vite build
```

- [ ] **Step 2: Launch and test manually**

```bash
npx electron-vite preview
```

Test scenarios:
1. Ctrl+Click two icons → BatchPanel appears with thumbnails
2. Shift+Click range → range selected
3. Toolbar "批量" toggle → checkboxes appear, click to select
4. 全选 / 反选 / 取消全选 buttons
5. Batch move to group
6. Batch copy to group
7. Batch delete (recycle)
8. Batch export SVG
9. Batch recolor → all icons get same color
10. Escape exits batch mode
11. Switch group clears selection
12. Search preserves selection

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "polish: batch operations integration fixes"
```
