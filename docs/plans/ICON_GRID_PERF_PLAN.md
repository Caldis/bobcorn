# Icon Grid Performance Optimization Plan

> Produced via 5-round collaborative review between Claude and Codex (GPT-5.4).
> Date: 2026-03-21

## Problem Statement

The icon grid panel (`IconGridLocal`) has severe performance issues with 3000+ icons:

| Metric | Current (3000 icons) | Target |
|--------|---------------------|--------|
| DOM nodes | ~50,000+ | <= 600 |
| Zustand subscriptions | ~12,000 (4 per icon) | <= 300 |
| Time to interactive | ~5-8s | <= 1.5s median |
| Scroll FPS | 10-20 | >= 50 |
| Batch operation latency | 1-3s | <= 200ms |
| JS heap (steady state) | Unconstrained growth | <= 120MB |

### Root Causes

1. **Zero virtualization** -- all 3000+ `IconBlock` components mounted simultaneously
2. **12,000 Zustand subscriptions** -- 4 selectors per icon, all fire on any state change
3. **Fake chunking** -- `CHUNK_SIZE=60` splits React tree but all chunks render simultaneously
4. **Callback identity churn** -- `handleIconClick` depends on `selectedIcons`, changes identity on every selection
5. **Store correctness gaps** -- `selectAllIcons`/`invertSelection` don't properly sync `batchMode`

## Architecture Decision: Why Virtualization First

Round 1 review established that `content-visibility: auto` (the original Phase 1) only reduces layout/paint work while leaving DOM nodes, React instances, event handlers, and Zustand subscriptions fully alive. Virtualization attacks all five costs simultaneously. Therefore:

- **Virtualization is the primary optimization** (not content-visibility)
- **`content-visibility` is dropped entirely** from the plan -- it is redundant after virtualization and can interfere with `@tanstack/react-virtual` measurement
- **`patchedIcons` stays in the main store** -- with virtualization capping mounted icons to ~50-100, fan-out cost is bounded; splitting stores adds complexity for limited payoff

## Key Files

| File | Role | Lines |
|------|------|-------|
| `src/renderer/components/IconGridLocal/index.tsx` | Main grid component | 642 |
| `src/renderer/components/IconBlock/index.tsx` | Individual icon | 131 |
| `src/renderer/store/index.ts` | Zustand state | 166 |
| `src/renderer/utils/sanitize.ts` | DOMPurify SVG cache | 35 |

## Interactions That Must Be Preserved

All 10 existing interactions were analyzed in Round 2:

| # | Interaction | Risk Level | Notes |
|---|------------|------------|-------|
| 1 | Single click selection (SideEditor) | SAFE | Props from data array, not DOM |
| 2 | Ctrl/Cmd+Click toggle | SAFE | Store-backed, works with partial mount |
| 3 | Shift+Click range selection | SAFE | Uses `flatIconIds` from data model, not DOM |
| 4 | Batch mode checkboxes | SAFE | Newly mounted rows read current store state |
| 5 | Search filtering (300ms throttle) | SAFE | Virtualizer handles dynamic count changes |
| 6 | Icon size slider (50-150px) | AT RISK | Need anchor-based scroll restoration |
| 7 | Drag-and-drop SVG import | SAFE | Dropzone wraps scroll container |
| 8 | "All Icons" grouped view | NEEDS REDESIGN | Flatten to discriminated row stream |
| 9 | Escape to clear batch | SAFE | Document-level listener, unaffected |
| 10 | Icon hot-patch | SAFE | Store-backed, remount reads patched content |
| -- | Scroll position preservation | AT RISK | Need explicit per-view scroll cache |

**Core principle**: virtualization must only reduce mounted DOM, not reduce the canonical data model. All interaction logic must be keyed by IDs and indexes from the ViewModel, never by mounted DOM.

---

## Phase 0: Pre-Migration Fixes

**Goal**: Fix correctness issues and stabilize callback identities before changing rendering architecture.

### Changes

**`src/renderer/store/index.ts`**:
- `selectAllIcons`: set `batchMode: ids.length > 0` (currently missing)
- `invertSelection`: set `batchMode: result.size > 0` (currently missing when result is empty)
- Both: maintain `lastClickedIconId` sanely

**`src/renderer/components/IconGridLocal/index.tsx`**:
- `handleIconClick`: read `batchMode`, `selectedIcons`, `lastClickedIconId` via `useAppStore.getState()` at event time instead of reactive hook dependencies
- `deselectIcon`: same pattern -- read `selectedIcons.size` from `getState()`
- Remove `batchMode`, `selectedIcons`, `lastClickedIconId` from `useCallback` dependency arrays

### Properties

| Property | Value |
|----------|-------|
| New dependencies | None |
| Risk | LOW |
| Rollback | Revert selection/store callback edits |
| Effort | 0.5-1.0 day |
| Perf impact | Small reduction in callback identity churn |
| Dependencies | None |

### Testing

- Add unit tests for `selectAllIcons` / `invertSelection` batchMode sync
- Test empty-result transitions
- Test shift/cmd click behavior after stabilization
- Run existing 169 unit tests + E2E suites

---

## Phase 1: ViewModel Extraction

**Goal**: Extract a pure, testable data transformation layer that converts raw icon data into a virtualization-ready row stream.

### Changes

**New file: `src/renderer/components/IconGridLocal/viewModel.ts`**:

```typescript
// Types
type VirtualRow =
  | { kind: 'header'; key: string; groupId: string; groupName: string; count: number }
  | { kind: 'row'; key: string; groupId: string; icons: IconItem[] }

interface IconGridViewModel {
  rows: VirtualRow[]
  flatIconIds: string[]
  idToIndex: Map<string, number>
  idToRowIndex: Map<string, number>
  totalIconCount: number
}

// Pure function -- fully testable without hooks
function computeIconGridViewModel(params: {
  iconData: Record<string, IconItem[]>
  selectedGroup: string
  searchKeyword: string | null
  columns: number
  groupList: GroupItem[]
}): IconGridViewModel
```

**`src/renderer/components/IconGridLocal/index.tsx`**:
- Replace `filteredIcons`, `iconChunks`, `allGroupChunks` memos with single `useMemo(() => computeIconGridViewModel(...))`
- Replace `flatIconIdsRef` update effect with ViewModel output
- Keep existing rendering (chunks) for now -- only the data model changes

### Properties

| Property | Value |
|----------|-------|
| New dependencies | None |
| Risk | MEDIUM |
| Rollback | Keep old memo path behind temporary flag |
| Effort | 1.0-1.5 days |
| Perf impact | Modest (removes redundant computation) |
| Dependencies | Phase 0 |

### Testing (~15 Vitest cases)

- Single group: N=0, N=1, exact column multiple, non-multiple, columns=1
- Column recompute: same icons with different column counts
- Search: case-insensitive regex, invalid regex fallback, empty result
- `resource-all`: multiple groups, empty groups filtered, uncategorized handling
- `resource-all` + search: groups with zero results disappear
- `idToIndex` correctness: first/middle/last IDs across groups
- `flatIconIds` stable ordering: same input twice produces same output
- Edge: container narrower than one icon clamps to columns=1

---

## Phase 2: Subscription Optimization

**Goal**: Reduce per-icon Zustand subscriptions from 4 to 1, lift volatile selection state to row level.

### Changes

**`src/renderer/components/IconBlock/index.tsx`**:
- Remove subscriptions for `selectedIcon`, `selectedIcons`, `batchMode`
- Keep only: `const patchedContent = useAppStore(s => s.patchedIcons?.[data.id])`
- Accept new props: `selected`, `batchSelected`, `showCheckbox`

**`src/renderer/components/IconGridLocal/index.tsx`** (row rendering):
- Subscribe once at row/list level for `selectedIcon`, `selectedIcons`, and `showCheckbox`
- For each icon in a row, compute `selected`/`batchSelected` and pass as props
- Optionally use `shallow` equality on the combined selector

### Properties

| Property | Value |
|----------|-------|
| New dependencies | None |
| Risk | MEDIUM |
| Rollback | Restore store subscriptions in IconBlock |
| Effort | 0.5-1.0 day |
| Perf impact | Subscription count drops from O(N*4) to O(mounted_rows + mounted_icons*1) |
| Dependencies | Phase 1 |

### Testing

- Unit test row-level derived selection props
- Verify checkbox visibility on batch mode enter/exit
- Verify hot-patch still updates visible icons immediately
- Run existing E2E suites

---

## Phase 3: Virtual Rendering

**Goal**: Replace simultaneous rendering of all chunks with `@tanstack/react-virtual` 1D row virtualization. This is the primary performance win.

### Changes

**`package.json`**:
- Add `@tanstack/react-virtual` (MIT license, ~15KB, actively maintained)

**`src/renderer/components/IconGridLocal/index.tsx`** (major rewrite of rendering):

1. **Virtualizer setup**:
   ```typescript
   const scrollRef = useRef<HTMLDivElement>(null)
   const virtualizer = useVirtualizer({
     count: viewModel.rows.length,
     getScrollElement: () => scrollRef.current,
     estimateSize: (index) => viewModel.rows[index].kind === 'header' ? 42 : rowHeight,
     getItemKey: (index) => viewModel.rows[index].key,
     overscan: 3,
   })
   ```

2. **Dropzone migration**: Switch from `<Dropzone>` render prop to `useDropzone()` hook to share `scrollRef` between virtualizer and drop target

3. **Container + ResizeObserver**:
   ```typescript
   const [containerWidth, setContainerWidth] = useState(0)
   // ResizeObserver on scrollRef, RAF-batched
   const columns = useMemo(() => Math.max(1, Math.floor(containerWidth / colWidth)), [containerWidth, colWidth])
   ```

4. **Row rendering**: Each virtual row renders either a `GroupHeader` component or a flex/grid row of `IconBlock` components

5. **Remove**: `IconChunk` component, `CHUNK_SIZE` constant, `iconChunks` memo, `allGroupChunks` memo, `gridContent` memo

### Properties

| Property | Value |
|----------|-------|
| New dependencies | `@tanstack/react-virtual` |
| Risk | HIGH |
| Rollback | Feature flag or temporary prop to switch between virtual and pre-virtual renderer |
| Effort | 2.0-3.0 days |
| Perf impact | **PRIMARY WIN**: DOM 50,000 -> 300-600, mounted icons 3000 -> 50-100 |
| Dependencies | Phases 0-2 |

### Testing

**Playwright E2E** (real scroll/layout tests):
- Scroll rendering: no blank gaps, correct icon count
- Click/shift-click/cmd-click on virtual rows
- Drag-and-drop import with virtual container
- Grouped "All Icons" headers clickable
- DOM node count assertions (`[data-testid="icon-block"]` count <= visible window)

**Dev harness** (`window.__BOBCORN_PERF__`):
- `loadPerfFixture()` -- seed 3000-icon dataset
- `collectGridMetrics()` -- DOM count, subscription count, heap size

---

## Phase 4: Scroll UX Polish

**Goal**: Address the two AT RISK interactions: icon size slider scroll jumps and cross-view scroll position preservation.

### Changes

**`src/renderer/components/IconGridLocal/index.tsx`**:

1. **Icon size anchor restoration**:
   - Before size change: capture first visible icon ID + intra-row pixel offset
   - After size change + column recompute: look up new row index via `idToRowIndex`
   - Call `virtualizer.scrollToIndex(newRowIndex, { align: 'start' })`

2. **Per-view scroll cache**:
   - Cache key: `${selectedGroup}:${searchKeyword || ''}:${iconBlockWidth}`
   - Store `scrollOffset` on view exit (group switch, search change)
   - Restore via `virtualizer.scrollToOffset(cached)` on view entry
   - Policy: search clear restores pre-search offset; group navigation restores per-group offset

3. **Search scroll reset**: When search produces new results, reset to top

### Properties

| Property | Value |
|----------|-------|
| New dependencies | None |
| Risk | MEDIUM |
| Rollback | Disable restoration while keeping virtualization |
| Effort | 1.0-1.5 days |
| Perf impact | UX quality improvement, no raw speed gain |
| Dependencies | Phase 3 |

### Testing

**Playwright E2E**:
- Icon size slider at top/middle/deep scroll positions
- Search while deep-scrolled (resets to top)
- Search clear (restores previous position)
- Group switch and return (restores position)
- Resize window while deep-scrolled

---

## Phase 5: Performance Validation

**Goal**: Verify all performance targets are met and establish regression baselines.

### Changes

1. **ViewModel test suite**: `test/unit/viewModel.test.ts` (~15 tests from Phase 1)
2. **Virtualization E2E suite**: `test/e2e/virtual-grid.js` (~10 edge case tests)
3. **Performance harness**: Exposed via `window.__BOBCORN_PERF__` in dev builds
4. **Golden interaction script**: 8-10 user actions run before/after each migration step

### Performance Harness Metrics

| Metric | Collection Method |
|--------|------------------|
| TTI | `performance.mark/measure` around load -> first paint |
| DOM nodes | `document.querySelectorAll('*').length` + `[data-testid="icon-block"]` count |
| Subscriptions | Instrumented store selectors in test mode |
| Scroll FPS | `requestAnimationFrame` sampler during scripted scroll |
| Batch FPS | RAF sampler during select-all/invert/clear |
| JS heap | `performance.memory.usedJSHeapSize` |

### Virtualization Edge Case Tests

1. Rapid scroll fling to bottom and back (no blank gaps)
2. Data mutation while deep-scrolled (icons added/removed)
3. Group switch while batch mode active (selection clears)
4. Search while deep-scrolled (scroll resets, correct count)
5. Import into `resource-all` (new headers appear correctly)
6. Patch icon in different group (no re-render storm)
7. Last row partial mount (checkbox state correct)
8. Resize causing column-count change around anchor
9. Empty result after search from deep scroll
10. Switching between cached views restores distinct offsets

### Properties

| Property | Value |
|----------|-------|
| New dependencies | None |
| Risk | LOW |
| Rollback | Keep instrumentation, roll back failing phase |
| Effort | 1.0-1.5 days |
| Perf impact | Validation only |
| Dependencies | Phases 0-4 |

---

## Summary

```
Phase 0  ──>  Phase 1  ──>  Phase 2  ──>  Phase 3  ──>  Phase 4  ──>  Phase 5
 Fixes       ViewModel     Subscriptions  Virtualize     Scroll UX     Validate
 (0.5-1d)    (1-1.5d)      (0.5-1d)       (2-3d)         (1-1.5d)      (1-1.5d)
 LOW risk    MEDIUM risk   MEDIUM risk    HIGH risk      MEDIUM risk   LOW risk
```

**Total estimated effort: 6.0-8.5 developer-days**

### Expected Results (3000 icons)

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| DOM nodes | ~50,000 | 300-600 | ~99% reduction |
| Zustand subscriptions | ~12,000 | ~300 | ~97.5% reduction |
| Time to interactive | 5-8s | <= 1.5s | ~75-80% faster |
| Scroll FPS | 10-20 | >= 50 | 2.5-5x improvement |
| Batch operations | 1-3s | <= 200ms | 5-15x faster |
| JS heap | Unbounded growth | <= 120MB stable | No leaks |

### Key Technical Decisions

1. **`@tanstack/react-virtual` with 1D rows** (not 2D grid, not hand-rolled IO)
2. **`useDropzone()` hook** (not `<Dropzone>` render prop) for ref sharing
3. **Fixed row heights** with explicit anchor restoration (not dynamic measurement)
4. **Hybrid subscription model**: selection state lifted to row level, patch state per-icon
5. **Pure `computeIconGridViewModel()`** function for testability
6. **Incremental migration** with feature flag fallback at Phase 3
