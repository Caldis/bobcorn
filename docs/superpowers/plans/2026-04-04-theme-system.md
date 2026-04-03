# Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace blue-tinted dark mode with GitHub Desktop-style neutral gray, establish 24-token semantic color framework, migrate 35 files to eliminate hardcoded colors.

**Architecture:** Expand existing CSS variable pattern (globals.css `:root`/`.dark`) from 7 → 24 semantic tokens. Register in Tailwind config. Extract theme logic to shared `config/themes.ts`. Migrate all components from raw colors (`brand-*`, `red-*`, etc.) to semantic tokens (`accent`, `danger`, etc.), eliminating all `dark:` prefixes from component code.

**Tech Stack:** CSS Custom Properties, Tailwind CSS (class mode), Zustand, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-04-theme-system-design.md`

---

### Task 1: Foundation — Token Definitions & Tailwind Config

**Files:**
- Modify: `src/renderer/styles/globals.css`
- Modify: `tailwind.config.js`

- [ ] **Step 1: Update globals.css — expand `:root` from 7 → 24 tokens**

Replace the entire `@layer base` block containing `:root` and `.dark`:

```css
@layer base {
  :root {
    /* Surface */
    --surface: 0 0% 100%;
    --surface-muted: 210 20% 98%;
    --surface-accent: 214 32% 96%;
    --surface-elevated: 0 0% 100%;
    --surface-overlay: rgba(0, 0, 0, 0.4);
    --surface-inset: 210 20% 97%;
    /* Foreground */
    --foreground: 222 47% 11%;
    --foreground-muted: 215 16% 47%;
    --foreground-subtle: 215 14% 65%;
    /* Accent */
    --accent: 221 83% 53%;
    --accent-foreground: 0 0% 100%;
    --accent-subtle: 214 95% 96%;
    --accent-muted: 214 80% 92%;
    /* Status */
    --danger: 0 84% 60%;
    --danger-subtle: 0 86% 97%;
    --success: 142 71% 45%;
    --success-subtle: 142 76% 96%;
    --warning: 38 92% 50%;
    --warning-subtle: 38 92% 95%;
    --info: 213 94% 52%;
    --info-subtle: 214 95% 96%;
    /* Border */
    --border: 214 32% 91%;
    --border-muted: 214 32% 95%;
    --ring: 221 83% 53%;
    --radius: 8px;
  }

  .dark {
    /* Surface — GitHub Desktop neutral gray */
    --surface: 220 6% 10%;
    --surface-muted: 220 5% 13%;
    --surface-accent: 220 5% 17%;
    --surface-elevated: 220 5% 14%;
    --surface-overlay: rgba(0, 0, 0, 0.6);
    --surface-inset: 220 6% 8%;
    /* Foreground */
    --foreground: 220 9% 93%;
    --foreground-muted: 220 7% 56%;
    --foreground-subtle: 220 5% 40%;
    /* Accent — higher saturation than surface-accent for clear selection vs hover distinction */
    --accent: 213 94% 68%;
    --accent-foreground: 0 0% 100%;
    --accent-subtle: 215 50% 13%;
    --accent-muted: 215 25% 20%;
    /* Status */
    --danger: 0 72% 63%;
    --danger-subtle: 0 40% 15%;
    --success: 142 60% 50%;
    --success-subtle: 142 30% 14%;
    --warning: 38 80% 55%;
    --warning-subtle: 38 40% 14%;
    --info: 213 94% 68%;
    --info-subtle: 213 40% 14%;
    /* Border */
    --border: 220 5% 22%;
    --border-muted: 220 5% 18%;
    --ring: 213 94% 68%;
  }
}
```

Also update the scrollbar styles to use CSS variable references:

```css
/* Scrollbar — uses foreground token for automatic theme adaptation */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: hsl(var(--foreground) / 0.04); border-radius: 3px; }
::-webkit-scrollbar-thumb { background: hsl(var(--foreground) / 0.15); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: hsl(var(--foreground) / 0.3); }
```

Remove the separate `.dark ::-webkit-scrollbar-*` rules entirely.

- [ ] **Step 2: Update tailwind.config.js — register all 24 semantic colors**

Replace the `colors` object in `theme.extend`:

```javascript
colors: {
  brand: {
    50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
    400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
    800: '#1e40af', 900: '#1e3a8a',
  },
  surface: {
    DEFAULT: 'hsl(var(--surface))',
    muted: 'hsl(var(--surface-muted))',
    accent: 'hsl(var(--surface-accent))',
    elevated: 'hsl(var(--surface-elevated))',
    overlay: 'var(--surface-overlay)',
    inset: 'hsl(var(--surface-inset))',
  },
  foreground: {
    DEFAULT: 'hsl(var(--foreground))',
    muted: 'hsl(var(--foreground-muted))',
    subtle: 'hsl(var(--foreground-subtle))',
  },
  accent: {
    DEFAULT: 'hsl(var(--accent))',
    foreground: 'hsl(var(--accent-foreground))',
    subtle: 'hsl(var(--accent-subtle))',
    muted: 'hsl(var(--accent-muted))',
  },
  danger: {
    DEFAULT: 'hsl(var(--danger))',
    subtle: 'hsl(var(--danger-subtle))',
  },
  success: {
    DEFAULT: 'hsl(var(--success))',
    subtle: 'hsl(var(--success-subtle))',
  },
  warning: {
    DEFAULT: 'hsl(var(--warning))',
    subtle: 'hsl(var(--warning-subtle))',
  },
  info: {
    DEFAULT: 'hsl(var(--info))',
    subtle: 'hsl(var(--info-subtle))',
  },
  border: 'hsl(var(--border))',
  'border-muted': 'hsl(var(--border-muted))',
  ring: 'hsl(var(--ring))',
},
```

- [ ] **Step 3: Verify build succeeds**

Run: `npx electron-vite build`
Expected: Build completes without errors (existing classes still resolve).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles/globals.css tailwind.config.js
git commit -m "feat(theme): add 24 semantic color tokens with neutral dark palette"
```

---

### Task 2: Theme Infrastructure — themes.ts + Store + Bootstrap

**Files:**
- Create: `src/renderer/config/themes.ts`
- Modify: `src/renderer/store/index.ts:135-142`
- Modify: `src/renderer/bootstrap.tsx:10-18`

- [ ] **Step 1: Create config/themes.ts**

```typescript
// Pure data module — no imports, no side effects.
// Shared between bootstrap.tsx (synchronous, pre-render) and store.

export const THEME_CLASSES: Record<string, string> = {
  light: '',
  dark: 'dark',
};

export function resolveTheme(
  mode: 'light' | 'dark' | 'system'
): { resolved: string; isDark: boolean } {
  const resolved =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;
  return { resolved, isDark: resolved === 'dark' };
}

export function applyThemeClass(resolved: string): void {
  const el = document.documentElement;
  Object.values(THEME_CLASSES).forEach((cls) => {
    if (cls) el.classList.remove(cls);
  });
  const themeClass = THEME_CLASSES[resolved];
  if (themeClass) el.classList.add(themeClass);
}
```

- [ ] **Step 2: Update bootstrap.tsx**

Replace lines 10-18 with:

```typescript
import { resolveTheme, applyThemeClass } from './config/themes';

// Apply theme synchronously before first render to avoid flash
const opts = getOption() as { themeMode?: 'light' | 'dark' | 'system'; darkMode?: boolean };
const themeMode = opts.themeMode ?? (opts.darkMode ? 'dark' : 'light');
const { resolved } = resolveTheme(themeMode as 'light' | 'dark' | 'system');
applyThemeClass(resolved);
```

- [ ] **Step 3: Update store setThemeMode**

Replace lines 135-142 in `store/index.ts`:

```typescript
import { resolveTheme, applyThemeClass } from '../config/themes';

// ... in store actions:
setThemeMode: (mode) => {
  const { resolved, isDark } = resolveTheme(mode);
  applyThemeClass(resolved);
  set({ themeMode: mode, darkMode: isDark });
  setOption({ themeMode: mode, darkMode: isDark });
},
```

- [ ] **Step 4: Verify build**

Run: `npx electron-vite build`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/config/themes.ts src/renderer/bootstrap.tsx src/renderer/store/index.ts
git commit -m "refactor(theme): extract shared theme logic to config/themes.ts"
```

---

### Task 3: UI Component Library Migration (12 files)

**Files:**
- Modify: `components/ui/button.tsx` (lines 58, 60, 62)
- Modify: `components/ui/dialog.tsx` (lines 89, 200, 201, 221)
- Modify: `components/ui/switch.tsx` (lines 23, 30)
- Modify: `components/ui/badge.tsx` (lines 14-18, 49, 68)
- Modify: `components/ui/progress.tsx` (lines 21, 23, 24, 44, 46)
- Modify: `components/ui/radio.tsx` (lines 64, 92, 101, 106)
- Modify: `components/ui/alert.tsx` (lines 13-28)
- Modify: `components/ui/checkbox.tsx` (lines 40-41)
- Modify: `components/ui/slider.tsx` (lines 48, 53, 56)
- Modify: `components/ui/input.tsx` (lines 68-69)
- Modify: `components/ui/dropdown.tsx` (line 116)
- Modify: `components/ui/toast.ts` (lines 6-33, 44-68)

Each file migration follows the same pattern: replace hardcoded colors with semantic tokens, remove `dark:` prefixes.

**Mapping reference (applies to all files below):**

| Old | New |
|-----|-----|
| `bg-brand-500 text-white` | `bg-accent text-accent-foreground` |
| `hover:bg-brand-600` | `hover:bg-accent/90` |
| `border-brand-500` | `border-accent` |
| `bg-red-500 text-white` | `bg-danger text-accent-foreground` |
| `hover:bg-red-600` | `hover:bg-danger/90` |
| `border-red-500` | `border-danger` |
| `text-red-500` | `text-danger` |
| `bg-green-500` | `bg-success` |
| `text-green-500` | `text-success` |
| `bg-yellow-500` | `bg-warning` |
| `bg-blue-500` | `bg-info` |
| `bg-gray-400` | `bg-foreground-subtle` |
| `focus:border-brand-400 dark:focus:border-brand-500` | `focus:border-accent` |
| `focus:ring-brand-300 dark:focus:ring-brand-700` | `focus:ring-ring/30` |
| `focus:ring-brand-400/30` | `focus:ring-ring/30` |
| `bg-brand-50 dark:bg-brand-500/10` | `bg-accent-subtle` |
| `text-brand-600 dark:text-brand-400` | `text-accent` |
| `bg-black/40` | `bg-surface-overlay` |
| `bg-white` (switch thumb) | `bg-surface-elevated` |
| `dark:bg-white/20` (switch unchecked) | `bg-foreground-subtle` |
| `hover:border-brand-400 dark:hover:border-brand-500` | `hover:border-accent` |
| `accent-brand-500` (radio) | `accent-accent` |
| `hover:text-brand-500` | `hover:text-accent` |

**Alert status mappings:**

| Old (warning) | New |
|---|---|
| `border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/30` | `border-warning bg-warning-subtle` |
| `text-yellow-500` | `text-warning` |
| `text-yellow-800 dark:text-yellow-200` | `text-foreground` |
| `text-yellow-700 dark:text-yellow-300` | `text-foreground-muted` |

| Old (error) | New |
|---|---|
| `border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/30` | `border-danger bg-danger-subtle` |
| `text-red-500` | `text-danger` |
| `text-red-800 dark:text-red-200` | `text-foreground` |
| `text-red-700 dark:text-red-300` | `text-foreground-muted` |

| Old (info) | New |
|---|---|
| `border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30` | `border-info bg-info-subtle` |
| `text-blue-500` | `text-info` |
| `text-blue-800 dark:text-blue-200` | `text-foreground` |
| `text-blue-700 dark:text-blue-300` | `text-foreground-muted` |

**Toast migration (imperative DOM):**

Replace the entire `COLORS` object and `isDark()` branch in `showToast()` with runtime CSS variable reading:

```typescript
function getThemeColor(token: string): string {
  return `hsl(${getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim()})`;
}

// In showToast():
const STATUS_TOKENS: Record<ToastType, { text: string; border: string; subtleBg: string }> = {
  success: { text: 'success', border: 'success', subtleBg: 'success-subtle' },
  error: { text: 'danger', border: 'danger', subtleBg: 'danger-subtle' },
  warning: { text: 'warning', border: 'warning', subtleBg: 'warning-subtle' },
  info: { text: 'foreground', border: 'border', subtleBg: 'surface-elevated' },
};
```

- [ ] **Step 1: Migrate all 12 UI component files** using the mappings above
- [ ] **Step 2: Verify build**: `npx electron-vite build`
- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ui/
git commit -m "refactor(ui): migrate all UI components to semantic color tokens"
```

---

### Task 4: Business Component Migration (18 files)

**Files:**
- Modify: `components/IconBlock/index.tsx`
- Modify: `components/SideMenu/GroupList.tsx`
- Modify: `components/SideMenu/ResourceNav.tsx`
- Modify: `components/SideMenu/SettingsDialog.tsx`
- Modify: `components/SideMenu/UpdateIndicator.tsx`
- Modify: `components/SideMenu/ExportDialog.tsx`
- Modify: `components/SideMenu/FileMenuBar.tsx`
- Modify: `components/SideMenu/GroupDialogs.tsx`
- Modify: `components/SideMenu/index.tsx`
- Modify: `components/TitleBar/button/index.tsx`
- Modify: `components/SideEditor/index.tsx`
- Modify: `components/BatchPanel/index.tsx`
- Modify: `components/IconToolbar/index.tsx`
- Modify: `components/IconGridLocal/index.tsx`
- Modify: `containers/MainContainer/index.tsx`
- Modify: `components/enhance/input/index.tsx`
- Modify: `components/SplashScreen/index.tsx`
- Modify: `components/IconInfoBar/index.tsx`

**Key mappings for business components (beyond Task 3's general mappings):**

| Component | Old | New |
|---|---|---|
| IconBlock selected | `border-brand-500 bg-surface-accent shadow-sm dark:border-brand-400 dark:bg-white/5 dark:shadow-brand-900/20` | `border-accent bg-surface-accent shadow-sm` |
| IconBlock batch | `bg-brand-50 border-brand-300 dark:bg-brand-950/30 dark:border-brand-500/50` | `bg-accent-subtle border-accent` |
| GroupList/ResourceNav selected | `bg-brand-50 text-brand-600 font-medium dark:bg-brand-950/40 dark:text-brand-400` | `bg-accent-subtle text-accent font-medium` |
| GroupList add hover | `hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-950/40` | `hover:bg-accent-subtle hover:text-accent` |
| TitleBar normal | `hover:bg-neutral-300 dark:hover:bg-neutral-600 active:bg-neutral-400 dark:active:bg-neutral-500` | `hover:bg-surface-accent active:bg-surface-accent` |
| TitleBar close | Keep `hover:!bg-[#e81123]` — Windows platform standard |
| SettingsDialog red section | `text-red-500/70` → `text-danger/70`; `bg-red-500/5` → `bg-danger-subtle`; `border-red-500/20` → `border-danger/20`; `text-red-400` → `text-danger` |
| UpdateIndicator emerald | `bg-emerald-500` → `bg-success`; `text-emerald-500` → `text-success` |
| ExportDialog info | `bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300` → `bg-info-subtle text-info` |
| ExportDialog code badge | `bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300` → `bg-accent-subtle text-accent` |
| ExportDialog action buttons | `text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30` → `text-accent hover:bg-accent-subtle` |
| SideEditor selected swatch | `border-brand-500 ring-2 ring-brand-300 dark:ring-brand-700` → `border-accent ring-2 ring-ring/30` |
| SideEditor/BatchPanel error input | `border-red-400 focus:ring-red-300` → `border-danger focus:ring-danger/30` |
| SideEditor/BatchPanel focus ring | `focus:ring-brand-300 dark:focus:ring-brand-700` → `focus:ring-ring/30` |
| BatchPanel hover | `hover:bg-brand-50 dark:hover:bg-brand-950/40` → `hover:bg-accent-subtle` |
| IconGridLocal scrollbar line | `bg-brand-500 dark:bg-brand-400` → `bg-accent` |
| MainContainer resize | `hover:bg-brand-400/40 active:bg-brand-400/60` → `hover:bg-accent/40 active:bg-accent/60` |
| enhance/input accent | `!text-brand-500 dark:!text-brand-400` → `!text-accent` |
| FileMenuBar hover icon | `group-hover:text-brand-500` → `group-hover:text-accent` |
| GroupDialogs focus | `focus:border-brand-400 focus:ring-brand-400/30` → `focus:border-accent focus:ring-ring/30` |
| IconInfoBar cleanup | Remove redundant `dark:border-border`, `dark:text-foreground` |
| SideMenu/index cleanup | Remove redundant `dark:bg-surface` |

**SplashScreen special handling:**
Brand gradients and decorative colors are preserved but simplified:
| Old | New |
|---|---|
| `border-brand-200 dark:border-brand-800` | `border-accent/30` |
| `bg-gradient-to-b from-brand-50 to-white dark:from-brand-950/40 dark:to-surface` | `bg-gradient-to-b from-accent-subtle to-surface` |
| `hover:border-brand-400 dark:hover:border-brand-600` | `hover:border-accent` |
| `hover:shadow-brand-100/60 dark:hover:shadow-brand-900/30` | `hover:shadow-accent/15` |
| `bg-brand-100 dark:bg-brand-900/50` | `bg-accent-subtle` |
| `text-brand-600 dark:text-brand-400` | `text-accent` |
| `group-hover:bg-brand-200 dark:group-hover:bg-brand-800/60` | `group-hover:bg-accent-muted` |
| `hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-900/30 dark:hover:text-brand-300` | `hover:bg-accent-subtle hover:text-accent` |

- [ ] **Step 1: Migrate all 18 business component files**
- [ ] **Step 2: Verify build**: `npx electron-vite build`
- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ src/renderer/containers/ src/renderer/enhance/
git commit -m "refactor(components): migrate all business components to semantic color tokens"
```

---

### Task 5: Verification & Cleanup

- [ ] **Step 1: Full build**

```bash
npx electron-vite build
```

- [ ] **Step 2: Run unit tests**

```bash
npx vitest run
```

- [ ] **Step 3: Grep for remaining hardcoded colors**

Search for any remaining `brand-` (excluding tailwind.config.js), `red-`, `green-`, `yellow-`, `blue-`, `emerald-`, `neutral-`, `amber-` color references in component files. Also search for remaining `dark:` prefixes (excluding TitleBar close button).

- [ ] **Step 4: Fix any remaining issues found in Step 3**

- [ ] **Step 5: Final commit if any cleanup was needed**

```bash
git commit -m "fix(theme): clean up remaining hardcoded color references"
```
