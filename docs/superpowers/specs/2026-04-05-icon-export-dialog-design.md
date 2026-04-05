# Icon Export Dialog — Design Spec

> Figma-style 单图标/批量导出弹窗，支持多尺寸 + 多格式。

## 概述

替换 SideEditor 和 BatchPanel 现有的 "Export SVG" 单按钮，改为弹出独立对话框，支持用户添加多行导出配置（每行独立选尺寸模式和格式），并提供常用平台预设。

## 触发入口

| 入口 | 模式 | 数据源 |
|------|------|--------|
| SideEditor 底部 "Export" 按钮 | Single — 当前选中图标 | `iconData` |
| BatchPanel "Export" 按钮 | Batch — 所有选中图标 | `selectedIds` → `db.getIconData()` |

变体 (VariantPanel) 暂不接入，保留现有 hover 下载。

## UI 结构

```
┌─ IconExportDialog ──────────────────────────────┐
│                                                  │
│  ┌─ Preview ──────────────────────────────────┐  │
│  │ [icon] name · SVG · 24×24                  │  │
│  │   (batch: stacked cards + "N icons")       │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌─ Presets ──────────────────────────────────┐  │
│  │ [iOS] [Android] [Web @1x–2x] [Favicon]    │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌─ Export Rows ──────────────────────────────┐  │
│  │ [@|px] [1x ] [PNG ▾] home@1x.png      [✕] │  │
│  │ [@|px] [2x ] [PNG ▾] home@2x.png      [✕] │  │
│  │ [@|px] [3x ] [PNG ▾] home@3x.png      [✕] │  │
│  │         [+ Add export]                     │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌─ Format Settings (conditional) ────────────┐  │
│  │ JPG Background: [■ #FFFFFF]                │  │
│  │ Quality:        [━━━━━━━━━━━━━━○] 92%      │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌─ ICO Merge (conditional) ──────────────────┐  │
│  │ [✓] Merge ICO sizes into single .ico file  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ─────────────────────────────────────────────── │
│  3 files · ~12 KB              [Cancel] [Export] │
│                                                  │
└──────────────────────────────────────────────────┘
```

## Presets

点击预设**替换**所有当前行。

| Preset | Rows |
|--------|------|
| iOS | @1x PNG, @2x PNG, @3x PNG |
| Android | 48px PNG, 72px PNG, 96px PNG, 144px PNG, 192px PNG |
| Web | @1x PNG, @2x PNG |
| Favicon | 16px ICO, 32px ICO, 48px ICO (ICO merge ✓), 180px PNG, 192px PNG, 512px PNG |

## Export Row

每行包含：

| 元素 | 行为 |
|------|------|
| **@/px toggle** | Pill 切换。`@` = 倍率模式，`px` = 固定像素模式 |
| **Size value** | `@` 模式: 0.5x ~ 4x；`px` 模式: 自由输入像素值 |
| **Format dropdown** | SVG, PNG, JPG, WebP, PDF, ICO |
| **Filename preview** | 只读，实时计算（见命名规则） |
| **Delete button** | 移除该行 |

### 尺寸计算

- **倍率模式**: 输出像素 = viewBox 尺寸 × 倍率。例: viewBox 24×24, @2x → 48×48px
- **固定像素模式**: 直接使用输入值作为输出尺寸（方形）
- **非方形 viewBox**: 以长边为基准等比缩放，短边居中

### 格式特殊行为

- **SVG**: size 列灰显禁用，直接导出原始 SVG 内容
- **JPG**: 无透明通道，使用 Format Settings 中的背景色填充
- **ICO**: 当存在 2+ ICO 行时，底部显示 merge checkbox

### 文件命名

- 倍率模式: `{iconName}@{scale}x.{ext}` — 例: `home@2x.png`
- 像素模式: `{iconName}-{size}px.{ext}` — 例: `home-48px.png`
- SVG: `{iconName}.svg`（无尺寸后缀）
- ICO merged: `{iconName}.ico`

## Format Settings

仅当行列表中存在 JPG 或 WebP 行时显示。

| 设置 | 默认值 | 适用格式 |
|------|--------|----------|
| Background color | `#FFFFFF` | JPG |
| Quality | 92% | JPG, WebP |

## 导出行为

### 文件保存

| 场景 | Dialog 类型 | 行为 |
|------|-------------|------|
| 单行 single mode | Save dialog | 选择文件路径 |
| 多行 single mode | Open directory dialog | 平铺写入选定目录 |
| Batch mode (任意行数) | Open directory dialog | 平铺写入选定目录 |

### ICO Merge

当 merge checkbox 勾选时，所有 ICO 行合并为一个 `.ico` 文件，内含多个 PNG-compressed entries。默认勾选。

### 进度

- 单图标少量行: 无进度 UI（毫秒级完成）
- Batch 或行数多: 底栏显示进度条 + `Exporting 3/15...`

### Footer 信息

- 实时计算: `{fileCount} files · ~{estimatedSize}`
- Batch: `{iconCount} icons × {rowCount} sizes = {totalFiles} files · ~{estimatedSize}`

## 技术管线

### 渲染引擎: Canvas (方案 A)

选择理由:
- 与 app 内显示使用同一 Chromium SVG 渲染器，WYSIWYG
- 零新原生依赖，复用现有 Canvas 基础设施
- 对图标级 SVG 质量完全足够
- Codex review 确认：质量瓶颈在变体系统的 imagetracerjs 重矢量化，不在 Canvas 光栅化

### 各格式管线

```
SVG content
  → sanitizeSVG() (DOMPurify, 复用现有)
  → 注入 width/height (from viewBox)
  → new Image() + canvas.drawImage()
  → format-specific output
```

| 格式 | 管线 |
|------|------|
| SVG | 跳过 Canvas，直接写 `iconContent` |
| PNG | `canvas.toBlob('image/png')` |
| JPG | 填充背景色 → `canvas.toBlob('image/jpeg', quality/100)` |
| WebP | `canvas.toBlob('image/webp', quality/100)` |
| PDF | Canvas → PNG dataURL → `pdf-lib` 嵌入单页 PDF |
| ICO | Canvas → 各尺寸 PNG ArrayBuffer → 手写 ICO 二进制 (header + PNG entries) |

### Worker 策略

| 场景 | 线程 |
|------|------|
| 单图标 ≤3 行 | 主线程直接处理 |
| 单图标 >3 行或 Batch | Web Worker (OffscreenCanvas) + postMessage 进度 |

## 新增依赖

| 包 | 用途 | 大小 |
|---|------|------|
| `pdf-lib` | PDF 页面生成 + PNG 嵌入 | ~400KB (tree-shakeable) |

ICO 编码手写 (~80 行)，零额外依赖。

## 文件变更

### 新增

| 文件 | 职责 |
|------|------|
| `src/renderer/components/IconExportDialog/index.tsx` | 弹窗主组件 — preview, presets, row list, format settings, footer |
| `src/renderer/components/IconExportDialog/ExportRow.tsx` | 单行组件 — @/px toggle, size input, format select, filename preview |
| `src/renderer/components/IconExportDialog/presets.ts` | Preset 定义常量 |
| `src/renderer/utils/export/rasterize.ts` | SVG → Canvas → Blob 核心管线 |
| `src/renderer/utils/export/formats.ts` | PDF 生成 (pdf-lib) + ICO 编码 |
| `src/renderer/workers/exportRaster.worker.ts` | 批量/多行导出 Worker |
| `test/unit/export-rasterize.test.js` | Canvas 管线测试 |
| `test/unit/export-formats.test.js` | PDF/ICO 格式测试 |

### 修改

| 文件 | 变更 |
|------|------|
| `src/renderer/components/SideEditor/index.tsx` | "Export SVG" → 打开 IconExportDialog (single) |
| `src/renderer/components/BatchPanel/index.tsx` | "Export SVG" → 打开 IconExportDialog (batch) |
| `src/locales/zh-CN.json` / `en.json` | 新增 `iconExport.*` keys |
| `package.json` | 新增 `pdf-lib` |

## 不变约束

- 字体导出 (ExportDialog) 不受影响
- 变体导出 (VariantPanel hover download) 保持现有 SVG-only 行为
- 导出的图标不包含变体 (一致于字体导出)
- `sanitizeSVG()` 安全路径不可跳过
