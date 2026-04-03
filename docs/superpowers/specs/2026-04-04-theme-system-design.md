# Theme System Design — Semantic Token Framework

**Date**: 2026-04-04
**Status**: Final (Rev.3 — 含 CodeX 两轮 review 修复)
**Goal**: 建立语义化、模块化的主题管理框架，修复暗色模式配色问题，确保未来新增功能自动适配所有主题。

---

## 1. 问题

### 1.1 暗色模式配色偏蓝

当前暗色 `--surface: 222 47% 11%` — hue 222 + 47% 饱和度 = 深海军蓝，不是真正的暗灰。
目标：对齐 GitHub Desktop 风格的中性深灰（hue ~220, 饱和度 3-6%）。

### 1.2 30+ 处颜色泄漏

组件中大量硬编码颜色缺少 `dark:` 适配：
- 侧边栏选中高亮用 `bg-brand-50`（亮白色底）在暗色下刺眼
- 批量选中背景 `bg-brand-50` 同上
- SettingsDialog 中 6 处 `text-red-500` / `bg-red-500` 无暗色变体
- switch.tsx 滑块 `bg-white` 无暗色变体
- dialog.tsx overlay `bg-black/40` 在暗色下对比度不足
- badge.tsx / progress.tsx 状态色无暗色变体

### 1.3 无强制机制

颜色全靠开发者手动写 `dark:` 变体，每个新功能都是暗色地雷。

---

## 2. 方案：CSS Variable Semantic Token System

扩展现有 `--surface` / `--foreground` CSS 变量模式为完整语义 token 系统。

### 核心原则

1. **组件代码零 `dark:` 前缀** — 暗色适配完全由 CSS 变量层处理
2. **禁止裸颜色** — 不在组件中直接使用 `bg-red-500`、`text-brand-600` 等
3. **新增主题 = 新增一个 CSS class block** — 只需定义同名变量的新值
4. **brand-\* 保留为 Tailwind 调色板** — 仅在 `globals.css` 的变量定义中引用，组件层不直接使用

---

## 3. Token 定义

### 3.1 Surface（背景层）— 6 tokens

| Token | 语义 | Light | Dark |
|-------|------|-------|------|
| `--surface` | 主内容区背景 | `0 0% 100%` | `220 6% 10%` |
| `--surface-muted` | 次要区域（侧边栏底色） | `210 20% 98%` | `220 5% 13%` |
| `--surface-accent` | 悬停/选中背景 | `214 32% 96%` | `220 5% 17%` |
| `--surface-elevated` | 弹窗/卡片/对话框 | `0 0% 100%` | `220 5% 14%` |
| `--surface-overlay` | 遮罩层背景 | — | — |
| `--surface-inset` | 输入框/代码块内凹 | `210 20% 97%` | `220 6% 8%` |

> `--surface-overlay` 比较特殊，需要带 alpha，定义方式为完整 rgba 值：
> - Light: `rgba(0, 0, 0, 0.4)`
> - Dark: `rgba(0, 0, 0, 0.6)`

### 3.2 Foreground（前景层）— 3 tokens

| Token | 语义 | Light | Dark |
|-------|------|-------|------|
| `--foreground` | 主文字 | `222 47% 11%` | `220 9% 93%` |
| `--foreground-muted` | 次要文字/标签 | `215 16% 47%` | `220 7% 56%` |
| `--foreground-subtle` | 占位符/禁用态 | `215 14% 65%` | `220 5% 40%` |

### 3.3 Accent（交互/品牌层）— 4 tokens

| Token | 语义 | Light | Dark |
|-------|------|-------|------|
| `--accent` | 主按钮/品牌强调 | `221 83% 53%` | `213 94% 68%` |
| `--accent-foreground` | 品牌色上的文字 | `0 0% 100%` | `0 0% 100%` |
| `--accent-subtle` | 选中项淡底色 | `214 95% 96%` | `215 50% 13%` |
| `--accent-muted` | 悬停高亮底色 | `214 80% 92%` | `215 25% 20%` |

### 3.4 Status（状态层）— 8 tokens

| Token | 语义 | Light | Dark |
|-------|------|-------|------|
| `--danger` | 错误/删除/破坏 | `0 84% 60%` | `0 72% 63%` |
| `--danger-subtle` | 错误淡底色 | `0 86% 97%` | `0 40% 15%` |
| `--success` | 成功 | `142 71% 45%` | `142 60% 50%` |
| `--success-subtle` | 成功淡底色 | `142 76% 96%` | `142 30% 14%` |
| `--warning` | 警告 | `38 92% 50%` | `38 80% 55%` |
| `--warning-subtle` | 警告淡底色 | `38 92% 95%` | `38 40% 14%` |
| `--info` | 信息提示 | `213 94% 52%` | `213 94% 68%` |
| `--info-subtle` | 信息淡底色 | `214 95% 96%` | `213 40% 14%` |

### 3.5 Border/Ring（边界层）— 3 tokens

| Token | 语义 | Light | Dark |
|-------|------|-------|------|
| `--border` | 默认边框 | `214 32% 91%` | `220 5% 22%` |
| `--border-muted` | 细微分隔线 | `214 32% 95%` | `220 5% 18%` |
| `--ring` | 焦点环 | `221 83% 53%` | `213 94% 68%` |

**合计 24 个语义 token。**

---

## 4. Tailwind 配置

### 4.1 globals.css

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
    /* Surface — GitHub Desktop 风格中性深灰 */
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
    /* Accent — 暗色下 accent-subtle 用 13% 亮度 + 50% 饱和度, 与 surface-accent (17%, 5%) 形成明显蓝色调区分 */
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

### 4.2 tailwind.config.js colors 扩展

```javascript
colors: {
  // brand 调色板保留（仅用于变量定义层的色值参考，组件层不直接使用）
  brand: { /* 保持现有 50-900 */ },
  // 语义色
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

---

## 5. 迁移映射表

### 5.1 侧边栏选中 (GroupList.tsx, ResourceNav.tsx)

```
Before: bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400
After:  bg-accent-subtle text-accent
```

### 5.2 图标选中 (IconBlock/index.tsx)

```
// 单选
Before: border-brand-500 bg-surface-accent dark:border-brand-400 dark:bg-white/5
After:  border-accent bg-surface-accent

// 批量选中
Before: bg-brand-50 border-brand-300 dark:bg-brand-950/30 dark:border-brand-500/50
After:  bg-accent-subtle border-accent
```

### 5.3 危险操作 (SettingsDialog.tsx, button.tsx, dialog.tsx)

```
Before: bg-red-500 text-white hover:bg-red-600
After:  bg-danger text-accent-foreground hover:bg-danger/90

Before: text-red-500
After:  text-danger

Before: bg-red-500/5 border-red-500/20
After:  bg-danger-subtle border-danger/20
```

### 5.4 状态色 (badge.tsx, progress.tsx, ExportDialog.tsx)

```
Before: bg-green-500 → After: bg-success
Before: bg-red-500   → After: bg-danger
Before: bg-yellow-500 → After: bg-warning
Before: text-green-500 → After: text-success
Before: text-red-500   → After: text-danger
```

### 5.5 对话框遮罩 (dialog.tsx)

```
Before: bg-black/40
After:  bg-surface-overlay
```

### 5.6 Switch 滑块 (switch.tsx)

```
Before: bg-white
After:  bg-surface-elevated
```

### 5.7 TitleBar 按钮 (TitleBar/button/index.tsx)

```
Before: hover:bg-neutral-300 dark:hover:bg-neutral-600
After:  hover:bg-surface-accent
```

### 5.8 品牌色按钮 (通用)

```
Before: bg-brand-500 text-white hover:bg-brand-600
After:  bg-accent text-accent-foreground hover:bg-accent/90

Before: focus:ring-brand-300 dark:focus:ring-brand-700
After:  focus:ring-ring

Before: focus:border-brand-400 dark:focus:border-brand-500
After:  focus:border-accent
```

### 5.9 信息提示 (ExportDialog.tsx, alert.tsx)

```
Before: bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300
After:  bg-info-subtle text-info
```

### 5.10 Toast 命令式 DOM (toast.ts)

toast.ts 不使用 Tailwind class，而是通过 `document.createElement()` + inline style 设置颜色。
迁移方式：运行时读取 CSS 变量计算值。

```typescript
// 读取当前主题的 CSS 变量值
function getThemeColor(token: string): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${token}`).trim();
  return `hsl(${raw})`;
}

// 使用示例
el.style.backgroundColor = getThemeColor('surface-elevated');
el.style.color = getThemeColor('foreground');
el.style.borderColor = getThemeColor('border');
```

这样 toast 的颜色自动跟随当前主题，无需 `isDark()` 分支判断。

### 5.11 滚动条 (globals.css)

```
用 CSS 变量直接定义，不需要 .dark 选择器重复。
使用 hsl(var(--foreground) / 0.1) 等透明度叠加。
需在视觉验收中确认 ::-webkit-scrollbar 伪元素的 CSS 变量解析正常。
```

### 5.11 清理冗余 `dark:` 前缀

迁移后，以下模式的 `dark:` 前缀变为冗余，应全部删除：
- `dark:bg-surface` / `dark:text-foreground` / `dark:border-border` — 语义 token 自动适配
- `dark:hover:bg-white/5` / `dark:hover:bg-white/10` — 替换为 `hover:bg-surface-accent`
- `dark:bg-white/20` — 替换为具体语义 token

**保留不动**的 `dark:` 前缀：
- `TitleBar/button/index.tsx` 的 `hover:!bg-[#e81123]` — Windows 平台标准红色，亮暗相同

---

## 6. 受影响文件清单

### 6.1 基础设施（必须首先完成）

| # | 文件 | 变更内容 |
|---|------|---------|
| 1 | `styles/globals.css` | **更新现有暗色变量值为中性灰** + 新增 17 个 token，滚动条迁移 |
| 2 | `tailwind.config.js` | 注册所有新语义色 |
| 3 | `config/themes.ts` | **新建** — 共享 `THEME_CLASSES` 常量（纯数据模块，零副作用，零 import） |
| 4 | `store/index.ts` | `setThemeMode` 改用 `THEME_CLASSES` |
| 5 | `bootstrap.tsx` | 同步初始化改用 `THEME_CLASSES` |

### 6.2 UI 组件库（语义 token 迁移）

| # | 文件 | 变更内容 |
|---|------|---------|
| 6 | `ui/button.tsx` | primary → `bg-accent`, danger → `bg-danger`, outline hover |
| 7 | `ui/dialog.tsx` | overlay → `bg-surface-overlay`, danger ok → `bg-danger` |
| 8 | `ui/switch.tsx` | 滑块 `bg-white` → `bg-surface-elevated` |
| 9 | `ui/badge.tsx` | 状态色映射全部迁移 |
| 10 | `ui/progress.tsx` | 状态条颜色迁移 |
| 11 | `ui/radio.tsx` | 选中态迁移 |
| 12 | `ui/alert.tsx` | 4 种状态色统一为 token（已有 dark: 全部删除） |
| 13 | `ui/checkbox.tsx` | checked/indeterminate bg → `bg-accent` |
| 14 | `ui/slider.tsx` | range/thumb → `bg-accent` |
| 15 | `ui/input.tsx` | focus border → `border-accent` |
| 16 | `ui/toast.ts` | **命令式 DOM 颜色** — 改读 CSS 变量值 |
| 17 | `ui/dropdown.tsx` | hover text → `text-accent` |

### 6.3 业务组件（颜色迁移 + dark: 清理）

| # | 文件 | 变更内容 |
|---|------|---------|
| 18 | `IconBlock/index.tsx` | 选中/批量选中背景 → `accent-subtle` |
| 19 | `SideMenu/GroupList.tsx` | 选中高亮 → `accent-subtle`, hover → `surface-accent` |
| 20 | `SideMenu/ResourceNav.tsx` | 同 GroupList |
| 21 | `SideMenu/SettingsDialog.tsx` | 6+ 处红色 → `danger`, 品牌按钮 → `accent` |
| 22 | `SideMenu/UpdateIndicator.tsx` | 状态点 + emerald → `success` |
| 23 | `SideMenu/ExportDialog.tsx` | info 提示 → `info-subtle`, 日志色 → token |
| 24 | `SideMenu/FileMenuBar.tsx` | hover icon → `text-accent` |
| 25 | `SideMenu/GroupDialogs.tsx` | focus border/ring → `accent` / `ring` |
| 26 | `TitleBar/button/index.tsx` | hover bg → `surface-accent`（close 红色保留） |
| 27 | `SideEditor/index.tsx` | focus ring → `ring`, 选中 swatch ring |
| 28 | `BatchPanel/index.tsx` | hover/apply/focus → `accent-*` tokens |
| 29 | `IconToolbar/index.tsx` | active toggle/focus → `accent` |
| 30 | `IconGridLocal/index.tsx` | hover/active bg → `surface-accent` |
| 31 | `containers/MainContainer/index.tsx` | resize handle → `accent-muted` |
| 32 | `enhance/input/index.tsx` | accent text → `text-accent` |
| 33 | `SplashScreen/index.tsx` | 审查 25+ brand 引用 — 语义用途迁移（含 `hover:text-red-500` → `hover:text-danger`），品牌装饰保留 |
| 34 | `IconInfoBar/index.tsx` | 清理冗余 `dark:` 前缀（`dark:border-border`, `dark:text-foreground`） |
| 35 | `SideMenu/index.tsx` | 清理冗余 `dark:bg-surface` |

**合计 35 个文件。**

> **注意**：`--surface-overlay` 使用完整 rgba 值而非 HSL 三元组，Tailwind 中配置为 `'var(--surface-overlay)'`。
> 该 token **不支持** Tailwind 透明度修饰符（如 `bg-surface-overlay/50`），因为变量本身已含 alpha。

---

## 7. Store 与 Bootstrap 变更

### 7.1 themeMode 扩展

当前 `setThemeMode` 只处理 `'light' | 'dark' | 'system'` 三种模式，操作 `dark` class。

扩展为通用主题切换：
- 移除 `dark` class 的硬编码切换
- 改为移除所有主题 class，再添加当前主题 class
- 预留 `themeClass` 映射以支持自定义主题

```typescript
const THEME_CLASSES: Record<string, string> = {
  light: '',      // 默认，无需 class
  dark: 'dark',
  // 未来: 'warm-gray': 'theme-warm-gray'
};

setThemeMode: (mode) => {
  const resolved = mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;
  const isDark = resolved === 'dark';
  // 移除所有主题 class
  Object.values(THEME_CLASSES).forEach(cls => {
    if (cls) document.documentElement.classList.remove(cls);
  });
  // 添加当前主题 class
  const themeClass = THEME_CLASSES[resolved];
  if (themeClass) document.documentElement.classList.add(themeClass);
  set({ themeMode: mode, darkMode: isDark });
  setOption({ themeMode: mode, darkMode: isDark });
},
```

### 7.2 Bootstrap 同步更新

`bootstrap.tsx` 的同步初始化逻辑同步调整，使用相同的 `THEME_CLASSES` 映射。

将 `THEME_CLASSES` 提取为共享常量 `src/renderer/config/themes.ts`。

**关键约束**：`themes.ts` 必须是**纯数据模块** — 不允许 import 任何其他模块，不允许副作用。这确保 bootstrap.tsx 中的同步引用不会触发异步加载或副作用。

```typescript
// src/renderer/config/themes.ts — 纯数据，无 import，无副作用
export const THEME_CLASSES: Record<string, string> = {
  light: '',
  dark: 'dark',
};

export function resolveTheme(
  mode: 'light' | 'dark' | 'system'
): { resolved: string; isDark: boolean } {
  const resolved = mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;
  return { resolved, isDark: resolved === 'dark' };
}

export function applyThemeClass(resolved: string): void {
  const el = document.documentElement;
  Object.values(THEME_CLASSES).forEach(cls => {
    if (cls) el.classList.remove(cls);
  });
  const themeClass = THEME_CLASSES[resolved];
  if (themeClass) el.classList.add(themeClass);
}
```

Bootstrap 同步调用：
```typescript
// bootstrap.tsx (同步，React mount 前)
import { THEME_CLASSES, resolveTheme, applyThemeClass } from './config/themes';
const opts = getOption();
const mode = opts.themeMode ?? (opts.darkMode ? 'dark' : 'light');
const { resolved } = resolveTheme(mode);
applyThemeClass(resolved);
```

Store 调用：
```typescript
// store/index.ts
import { resolveTheme, applyThemeClass } from '../config/themes';
setThemeMode: (mode) => {
  const { resolved, isDark } = resolveTheme(mode);
  applyThemeClass(resolved);
  set({ themeMode: mode, darkMode: isDark });
  setOption({ themeMode: mode, darkMode: isDark });
},
```

---

## 8. 测试策略

### 8.1 视觉验收

- 亮色/暗色模式下逐页面截图对比
- 重点检查：侧边栏选中态、图标批量选中、设置弹窗、对话框 overlay
- **accent-subtle vs surface-accent 区分度**：暗色下选中项必须与悬停项有明显视觉差异
- **滚动条**：三平台确认 `::-webkit-scrollbar` 伪元素正确解析 CSS 变量
- **toast 弹窗**：暗色模式下文字可读性和背景对比度
- **状态色在 subtle 背景上的对比度**：danger/success/warning 文字在各自 subtle 背景上对比度 ≥ 4.5:1 (WCAG AA)

### 8.2 单元测试

- `setThemeMode()` 正确切换 class
- `resolveTheme()` 对 light/dark/system 三种输入返回正确结果
- Bootstrap 初始化逻辑正确解析配置（含旧 `darkMode` boolean 迁移路径）

### 8.3 E2E 验收

- 现有 acceptance.js 和 full-e2e.js 继续通过
- 新增：主题切换后 UI 无白色闪烁

---

## 9. 非目标（不在本次范围内）

- 新增自定义主题（暖灰/高对比度等）— 框架支持但不实现
- ESLint 硬编码颜色检查规则 — 可后续添加，本次通过代码审查保证
- 品牌色 (`brand-*`) 调色板本身的调整 — 保持不变
