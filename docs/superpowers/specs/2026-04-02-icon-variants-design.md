# Icon Variants (Auto Adapt) — Design Spec

> Inspired by Apple SF Symbols' Weight / Scale / Rendering Mode system.
> Users import a single SVG icon and generate multiple variants automatically.

## Scope

**Phase 1 (this spec):** Weight (9 levels) + Scale (3 levels) = up to 26 variants per icon
**Phase 2 (future):** Rendering Mode (Monochrome / Hierarchical / Palette / Multicolor)

## Data Model

### Schema Changes

`iconData` table gains 2 nullable columns:

| Column | Type | Description |
|--------|------|-------------|
| `variantOf` | `varchar(255) NULL` | Parent icon ID. NULL = normal icon. Non-NULL = variant |
| `variantMeta` | `TEXT NULL` | JSON string with variant parameters |

`variantMeta` structure:

```json
{
  "weight": "bold",
  "weightRadius": 0.6,
  "scale": "medium",
  "scaleFactor": 1.0,
  "renderingMode": null,
  "layers": null
}
```

### Migration

- **New projects** (`initNewProject()`): `CREATE TABLE iconData` includes `variantOf` and `variantMeta` columns from the start.
- **Existing projects** (`initNewProjectFromData()`): detect missing columns via `PRAGMA table_info(iconData)` and `ALTER TABLE ADD COLUMN ... DEFAULT NULL`. Old .icp files auto-migrate on open.
- **Backward compat**: Old Bobcorn versions ignore unknown columns — no crash.

### Behavior Rules

- Variants have independent `iconCode` (auto-assigned in PUA range)
- Variant `iconName`: `{parentName}.{weight}` or `{parentName}.{weight}.{scale}` (e.g., `home.bold`, `home.thin.small`). Medium scale omits `.medium` suffix. Regular weight uses just `.small` / `.large`.
- Delete parent icon: confirm dialog, cascade-delete all variants (`WHERE variantOf = ?`)
- Move parent to another group: variants follow (`UPDATE ... WHERE variantOf = ?`)
- Move parent to recycle bin: variants follow
- Variants cannot generate sub-variants (UI disables variant panel when a variant is selected)
- `getIconList()` / `getIconListFromGroup()` return variants alongside normal icons. UI distinguishes via `variantOf`.

## Weight Variant Engine

### 9 Weight Levels

| Level | Name | feMorphology | Radius (24px base) |
|-------|------|-------------|-------------------|
| 1 | Ultralight | erode | 0.8 |
| 2 | Thin | erode | 0.5 |
| 3 | Light | erode | 0.25 |
| 4 | Regular | — | 0 (original, no variant) |
| 5 | Medium | dilate | 0.15 |
| 6 | Semibold | dilate | 0.3 |
| 7 | Bold | dilate | 0.5 |
| 8 | Heavy | dilate | 0.7 |
| 9 | Black | dilate | 0.9 |

Radius scales with viewBox: `actualRadius = radius * (viewBoxSize / 24)`.

### Bake Pipeline

```
Input SVG
  |
  v
1. Inject feMorphology <filter> (DOM operation)           ~1ms
  |
  v
2. Render to OffscreenCanvas (256x256, black-on-white)    ~5-10ms
  |
  v
3. ImageData -> imagetracerjs vectorization               ~50-200ms
  |
  v
4. Clean path -> build SVG (single path, normalized viewBox)
  |
  v
5. Write to DB (new iconId, new iconCode, variantOf = parentId)
```

- Steps 2-4 run in a **Web Worker** (non-blocking)
- Regular weight = original icon, not generated (8 variants per scale level)
- imagetracerjs: MIT, ~30KB, pure JS, no WASM

### Real-time Preview (slider drag)

Preview does NOT use the bake pipeline. Instead:

```
User drags slider -> debounce 50ms
  |
  v
injectWeightFilter(svgContent, radius) -> SVG with <filter>
  |
  v
patchIconContent(iconId, filteredSvg) -> instant SideEditor preview
```

On slider release, original content is restored (preview is transient, not persisted). On "Generate", the bake pipeline runs and the result replaces the preview.

## Scale Variants

### 3 Scale Levels

| Level | Name | ViewBox Transform | Example (24x24 base) |
|-------|------|------------------|---------------------|
| S | small | Expand viewBox by 20% | `-2.4 -2.4 28.8 28.8` |
| M | medium | Original (no variant) | `0 0 24 24` |
| L | large | Shrink viewBox by 15% | `1.8 1.8 20.4 20.4` |

Pure vector operation — no bake needed. Preview = export (WYSIWYG).

### Weight x Scale Matrix

9 weights x 3 scales - 1 (original) = **26 variants per icon**.

Scale is applied AFTER weight bake (feMorphology radius is based on original viewBox).

```
Original SVG -> Weight bake (feMorphology + Canvas) -> Scale adjust (viewBox) -> DB
```

## Rendering Mode (Phase 2 — Interface Reserved)

### 4 Modes

| Mode | Effect | Implementation |
|------|--------|---------------|
| Monochrome | All paths same color | Existing behavior |
| Hierarchical | Primary 100% opacity, secondary 40% | Set `opacity` per layer |
| Palette | User-defined colors per layer | `replaceSvgColor()` per layer |
| Multicolor | Independent color per path | Per-path color assignment |

### Path Layer Interaction (Phase 2)

- User clicks paths in preview to assign Primary / Secondary layer
- Single-path icons: only Monochrome available (others disabled)
- Layer data stored in `variantMeta.layers`

### Phase 1 Reservation

`variantMeta` includes `renderingMode` and `layers` fields, both set to `null`. No UI or generation logic in Phase 1.

## UI Design

### SideEditor — Variant Panel (collapsible)

Collapsed:
```
| > Variants                 0/26 |
```

Expanded:
```
| v Variants                 3/26 |
|                                 |
| Weight                          |
| o-o-o-o-*-o-o-o-o               |
| UL Th Li Re Me Se Bo He Bl      |
|                                 |
| Scale                           |
| [S]  [*M]  [L]                  |
|                                 |
| +-------+-------+               |
| | orig  | curr  |  <- preview   |
| +-------+-------+               |
|                                 |
| [Generate Current] [All 26]     |
|                                 |
| Generated:                      |
|  home.thin            x         |
|  home.bold            x         |
|  home.bold.small      x         |
```

### Interaction Flow

**Single icon:**
1. Select icon -> expand Variants panel
2. Drag weight slider / toggle scale -> feMorphology preview (debounce 50ms)
3. "Generate Current" -> bake 1 variant
4. "Generate All 26" -> bake all (Worker + progress bar + cancelable)

**Batch (BatchPanel):**
1. Multi-select icons -> "Batch Generate Variants" button
2. Dialog: choose weight/scale combinations (checkboxes)
3. Confirm -> Worker bake with progress `"Generating variants (23/150)"`
4. Cancelable — already-generated variants are kept

**Generated variant management:**
- Listed at bottom of variant panel with name + delete button
- Click name to jump to that variant icon
- Duplicate-parameter detection: button shows "Already Generated" (disabled)

### IconBlock Variant Badge

Variant icons display a small dot indicator at bottom-right corner to distinguish from normal icons. Selecting a variant disables the Variant panel with message "Variants cannot generate sub-variants".

## Technical Architecture

### New Files

| File | Responsibility |
|------|---------------|
| `src/renderer/utils/svg/variants.ts` | Core engine: feMorphology injection, Canvas bake, Scale transform, weight/scale constants |
| `src/renderer/workers/variantBake.worker.ts` | Web Worker: receive SVG + params, run bake pipeline, return vectorized SVG |
| `src/renderer/components/SideEditor/VariantPanel.tsx` | UI: weight slider, scale toggle, preview, generate buttons, generated list |

### Modified Files

| File | Changes |
|------|---------|
| `src/renderer/database/index.ts` | ALTER TABLE migration + variant CRUD methods |
| `src/renderer/components/SideEditor/index.tsx` | Import VariantPanel |
| `src/renderer/components/IconBlock/index.tsx` | Variant badge rendering |
| `src/renderer/components/BatchPanel/index.tsx` | "Batch Generate Variants" button + dialog |
| `src/renderer/store/index.ts` | `variantProgress` state |
| `src/locales/zh-CN.json` / `en.json` | `variant.*` translation keys |
| `package.json` | Add `imagetracerjs` dependency |

### Database API

```typescript
// New methods
addVariant(parentId, variantData, meta, cb?)
getVariants(parentId): IconRecord[]
deleteVariants(parentId, cb?)       // cascade delete
hasVariant(parentId, weight, scale): boolean

// Modified methods
delIcon(id, cb?)            // check for variants, prompt cascade
moveIconGroup(id, group, cb?)  // variants follow parent
```

### Worker Protocol

```typescript
// Main -> Worker
interface BakeRequest {
  id: string;
  svgContent: string;
  weight: { name: string; operator: 'dilate' | 'erode'; radius: number };
  scale: { name: string; factor: number };
  canvasSize: number;  // 256 or 512
}

// Worker -> Main
interface BakeResponse {
  id: string;
  svgResult: string;
  success: boolean;
  error?: string;
}

// Cancel
interface BakeCancel { type: 'cancel'; id: string | 'all' }
```

### Dependencies

- **imagetracerjs** (MIT, ~30KB) — pure JS bitmap-to-vector. No WASM, Worker-compatible.

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Variant selected | Variant panel disabled, message shown |
| Parent color changed after variant generated | Variants unaffected (snapshot at bake time) |
| Parent deleted | Confirm dialog, cascade-delete variants |
| Parent moved to group / recycle bin | Variants follow |
| Duplicate parameters | `hasVariant()` check, button disabled |
| PUA code exhaustion (>6400 icons) | Alert user "Code slots insufficient, reduce variant count" |
| Old Bobcorn opens new .icp | Unknown columns ignored, variants show as normal icons |
| Worker bake failure | Skip failed variant, continue, report "2 of 26 failed" |
| Batch cancelled mid-way | Keep already-generated, discard pending, report count |

## Export Integration

Variants are regular icons with independent iconCode + SVG content. Existing export pipeline (SVG/TTF/WOFF/WOFF2/EOT/CSS/JS) requires **zero changes**.

CSS class names: `.` in iconName already converted to `-` by existing logic (e.g., `icon-home-bold-small`).

## i18n Keys

All user-visible strings use `t()` with `variant.` prefix:
- `variant.title`, `variant.weight`, `variant.scale`
- `variant.generateCurrent`, `variant.generateAll`
- `variant.alreadyGenerated`, `variant.batchGenerate`
- `variant.progress`, `variant.cannotNest`
- 9 weight names + 3 scale names

## Implementation Approach

### Phased delivery with cross-review:
- Each phase delivered after 2 rounds of cross-review (architect review + Codex detail review)
- User briefed before each phase: intent, scope, acceptance criteria
- Incremental — no large-batch irreversible changes

### Phase 1 scope boundary:

**Included:**
- Database schema migration + variant CRUD
- Weight 9 levels + Scale 3 levels preview + bake
- Single icon + batch generation (Worker + progress + cancel)
- SideEditor VariantPanel UI
- BatchPanel batch entry
- IconBlock variant badge
- Cascade delete / move / recycle bin
- imagetracerjs integration
- i18n (zh-CN + en)
- Unit tests: bake pipeline, database variant CRUD, edge cases

**Excluded (Phase 2):**
- Rendering Mode (path layer selection + 4 modes)
- Variant comparison view (side-by-side all variants)
- Variant parameter bulk-editing
