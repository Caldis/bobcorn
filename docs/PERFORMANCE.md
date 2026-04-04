# Icon Grid Performance — SOP & Checklist

> Reference manual for diagnosing and fixing rendering performance regressions
> in the central canvas area (IconGridLocal + IconBlock).

## Architecture Overview

```
Database (sql.js)
  │
  ├─ getIconListFromGroup()     ← meta-only query (no SVG content)
  ├─ getAllIconsGrouped()       ← meta-only, grouped by iconGroup
  ├─ getIconContentBatch(ids)   ← batch SVG content for visible rows
  └─ getIconContent(id)         ← single icon fallback
  │
  v
Store (Zustand)
  │
  ├─ groupData                  ← triggers IconGridLocal sync
  ├─ prefetchedContent          ← batch-loaded SVG cache
  ├─ patchedIcons               ← hot-patch for color editing
  └─ variantCounts              ← pre-computed Map from GROUP BY
  │
  v
IconGridLocal
  │
  ├─ sync() → setIconData()     ← loads meta from DB
  ├─ computeIconGridViewModel() ← pure function, rows + columns
  ├─ useVirtualizer()           ← @tanstack/virtual, overscan: 3
  ├─ prefetch effect            ← watches virtualItems, batch-loads
  └─ renders virtualItems only  ← ~20-30 DOM rows at any time
  │
  v
IconBlock (React.memo)
  │
  ├─ effectiveContent priority: patched > prefetched > content > lazy
  ├─ sanitizeSVG() with LRU cache (16k entries)
  ├─ requestIdleCallback for lazy fallback
  └─ CSS animation: staggered fade-in (GPU-accelerated)
```

## Performance Rules

### 1. Never query per-icon in a render loop

**Bad:**
```typescript
// Inside IconBlock — runs 7000x
const count = db.getVariantCount(data.id);
```

**Good:**
```typescript
// In store — runs 1x, cached
refreshVariantCounts: () => {
  const map = db.getAllVariantCounts(); // single GROUP BY
  set({ variantCounts: obj });
}
// In IconBlock — reads from cache
const count = useAppStore(state => state.variantCounts?.[iconId] ?? 0);
```

**Rule:** Any data needed by all icons must be batch-queried once and cached in the store. Never call database methods inside IconBlock's render or useMemo.

### 2. Always add SQL indexes for filtered columns

When adding a new column used in WHERE clauses:
```sql
CREATE INDEX IF NOT EXISTS idx_iconData_<column> ON iconData (<column>);
```

Current indexes:
- `idx_iconData_variantOf` — used by `WHERE variantOf IS NULL` (grid filtering) and `WHERE variantOf = ?` (variant queries)

**Checklist when adding a new iconData column:**
- [ ] Add to `CREATE TABLE` in `initNewProject()`
- [ ] Add `ALTER TABLE` migration in `migrateVariantColumns()`
- [ ] Add `CREATE INDEX IF NOT EXISTS` in both locations
- [ ] Add to `ICON_META_COLS` if needed in grid listing

### 3. Use stable Zustand selectors

**Bad:**
```typescript
// New reference every render → selector runs on every store update
const foo = useAppStore(state => state.bar?.[id]);
```

**Good:**
```typescript
// Stable reference → only runs when dependencies change
const foo = useAppStore(
  useCallback(state => state.bar?.[id] ?? null, [id])
);
```

**Rule:** Every `useAppStore()` call in IconBlock must use `useCallback` for its selector. IconBlock renders thousands of times — unstable selectors cause O(N) selector evaluations per store update.

### 4. Don't depend on groupData in IconBlock

`groupData` changes on every `syncLeft()` call. If IconBlock depends on it, ALL icons re-render on any group/icon change.

**Bad:**
```typescript
const groupData = useAppStore(state => state.groupData);
const value = useMemo(() => db.something(id), [id, groupData]);
```

**Good:**
```typescript
// Use a dedicated store field that only changes when needed
const value = useAppStore(
  useCallback(state => state.dedicatedCache?.[id] ?? 0, [id])
);
```

### 5. Batch prefetch for visible icons

The virtualizer only renders ~20-30 rows. When new rows become visible:
```typescript
// IconGridLocal watches virtualItems
useEffect(() => {
  const ids = collectVisibleIconIds(virtualItems);
  prefetchIconContent(ids); // single SELECT IN query
}, [virtualItems]);
```

**Rule:** Never rely on individual `getIconContent(id)` as the primary loading path. It's a fallback for edge cases.

### 6. Keep SVG loading off the main thread

```typescript
// requestIdleCallback — only fires when browser is idle
const handle = requestIdleCallback(() => {
  const loaded = db.getIconContent(iconId);
  if (loaded) setLazyContent(loaded);
});
return () => cancelIdleCallback(handle);
```

**Rule:** Any synchronous DB query that could block scrolling must be deferred to `requestIdleCallback`.

### 7. GPU-accelerated animations only

```css
/* GOOD — only transform + opacity, GPU-composited */
@keyframes iconReveal {
  from { opacity: 0; transform: scale(0.9) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.iconFadeIn {
  animation: iconReveal 0.2s ease-out both;
  will-change: opacity, transform;
}

/* BAD — triggers layout recalculation */
@keyframes bad {
  from { height: 0; margin-top: 10px; }
  to   { height: 100px; margin-top: 0; }
}
```

### 8. Fixed placeholder dimensions

```tsx
// aspect-square ensures the icon cell has correct height before SVG loads
<div className="aspect-square" style={{ width }}>
  <div className={hasContent ? style.iconFadeIn : 'opacity-0'}>
    {/* SVG content */}
  </div>
</div>
```

**Rule:** Icon containers must have a fixed height (via `aspect-square`) to prevent layout shifts during lazy loading.

## Performance Regression Checklist

Run this checklist when the icon grid feels slow:

### Quick diagnosis
- [ ] Open DevTools → Performance tab → record a scroll
- [ ] Check for long tasks (>50ms bars) — what function dominates?
- [ ] Check React DevTools → Profiler → how many IconBlocks re-rendered?

### Common culprits
- [ ] **New per-icon DB query?** Search for `db.get*` or `db.exec` inside `IconBlock` or its dependencies
- [ ] **New store dependency in IconBlock?** Check all `useAppStore` calls — any without `useCallback`?
- [ ] **groupData dependency leak?** Search IconBlock for `groupData` — it should NOT appear
- [ ] **Missing SQL index?** Run `EXPLAIN QUERY PLAN` on slow queries — look for `SCAN TABLE`
- [ ] **DOMPurify cache miss?** Check `sanitizeCache.size` in console — if near 16384, cache is thrashing
- [ ] **Animation on layout properties?** Search CSS for `height`, `width`, `margin`, `padding` in `@keyframes`

### Benchmark commands
```bash
# Profile startup + initial render
npx electron-vite dev
# In console:
performance.mark('grid-start'); 
// scroll to bottom
performance.mark('grid-end');
performance.measure('grid-scroll', 'grid-start', 'grid-end');

# Check DB query count
window.__BOBCORN_PERF__ = { mark: console.time, measure: console.timeEnd };
```

### Performance budget
| Metric | Target | How to measure |
|--------|--------|---------------|
| Initial grid render (7000 icons) | < 500ms | Performance tab, first paint |
| Scroll to new section | < 16ms/frame (60fps) | Performance tab, frame timing |
| Icon content load (visible batch) | < 50ms | Console: time `prefetchIconContent` |
| Single variant generation | < 1s | Console: time `bakeSvgVariant` |
| Batch variant generation (26) | < 10s | VariantPanel progress bar |

## Optimization History

| Date | Issue | Root Cause | Fix | Impact |
|------|-------|-----------|-----|--------|
| 2026-04-04 | Grid laggy after variant feature | N+1 query: 7000x `getVariantCount()` per render | Batch GROUP BY + store cache | 7000 queries → 1 |
| 2026-04-04 | groupData cascade | IconBlock `useMemo` depended on `groupData` | Dedicated `variantCounts` store field | Eliminated full re-render |
| 2026-04-04 | No SQL index on variantOf | Full table scan on `WHERE variantOf IS NULL` | `CREATE INDEX idx_iconData_variantOf` | ~100x faster filter |
| 2026-04-04 | Selector churn | Unstable Zustand selectors in IconBlock | `useCallback` wrapped selectors | Eliminated O(N) selector runs |
| 2026-04-04 | Blocking lazy load | `getIconContent` in useEffect blocked scroll | `requestIdleCallback` deferral | Smooth scroll |
| 2026-04-04 | Individual SVG queries | Each icon loaded content separately | `getIconContentBatch` + `prefetchedContent` store | N queries → 1 batch |
| 2026-04-04 | Layout shift on load | No placeholder height before SVG load | `aspect-square` on container | No CLS |
| 2026-04-04 | Abrupt icon appearance | Icons popped in instantly | Staggered fade-in animation (30ms/col) | Polished wave reveal |
