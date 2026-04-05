# Icon Export — 维护指南

> 单图标/批量导出弹窗，支持多格式 (SVG/PNG/JPG/WebP/PDF/ICO) × 多尺寸 (@倍率/固定像素) × 平台预设。
> 自 v1.10.0 起可用。

## 架构概览

```
用户点击 "导出图标文件"
        ↓
  IconExportDialog (Modal)
    ├─ 预设栏: iOS / RN / Android / Web / Favicon
    ├─ 导出行列表 (ExportRow × N)
    │    └─ 每行: [@/PX 切换] [尺寸] [格式] [文件名预览] [删除]
    ├─ 格式设置 (JPG 背景色 + 质量滑块，条件显示)
    └─ ICO 合并 checkbox (条件显示)
        ↓
  导出管线
    ├─ SVG → 直接写入原始内容
    ├─ PNG/JPG/WebP → Canvas 光栅化 → toBlob()
    ├─ PDF → Canvas → PNG → pdf-lib 嵌入
    └─ ICO → Canvas → 多个 PNG → 手写 ICO 二进制
        ↓
  electronAPI.writeFile() → 本地文件系统
```

## 文件结构

| 文件 | 职责 |
|------|------|
| `src/renderer/components/IconExportDialog/index.tsx` | 弹窗主组件 — 预览、预设、行列表、格式设置、导出逻辑 |
| `src/renderer/components/IconExportDialog/ExportRow.tsx` | 单行组件 — @/PX 切换、尺寸 stepper、格式下拉、文件名预览 |
| `src/renderer/utils/export/presets.ts` | 类型定义、预设常量、`buildFilename()`、`computeOutputSize()` |
| `src/renderer/utils/export/rasterize.ts` | `parseViewBox()`、`prepareSvgForRender()`、Canvas 光栅化管线 |
| `src/renderer/utils/export/formats.ts` | ICO 二进制编码器、PDF 生成器 (pdf-lib) |
| `src/renderer/workers/exportRaster.worker.ts` | 批量导出 Web Worker (OffscreenCanvas) |

### 触发入口

| 入口 | 模式 | 文件 |
|------|------|------|
| SideEditor "导出图标文件" 按钮 | Single — 当前选中图标 | `SideEditor/index.tsx` |
| BatchPanel "导出图标文件" 按钮 | Batch — 所有选中图标 | `BatchPanel/index.tsx` |

变体 (VariantPanel) 保留独立的 hover SVG 下载，不接入此弹窗。

## 支持的格式

| 格式 | 管线 | 透明度 | 备注 |
|------|------|--------|------|
| SVG | 直接写入 `iconContent` | N/A | 矢量，尺寸不适用 |
| PNG | `canvas.toBlob('image/png')` | 保留 | |
| JPG | 填充背景色 → `canvas.toBlob('image/jpeg', quality)` | 不支持 | 需要背景色 |
| WebP | `canvas.toBlob('image/webp', quality)` | 保留 | |
| PDF | Canvas → PNG → `pdf-lib` 嵌入单页 | 保留 | 保持 aspect ratio |
| ICO | Canvas → 多尺寸 PNG → 手写二进制 header + entries | 保留 | PNG-compressed entries |

## 预设

| 预设 | 行 | 说明 |
|------|-----|------|
| **iOS** | @1x/@2x/@3x PNG | App icon / asset catalog |
| **React Native** | @1x/@2x/@3x PNG | 文件名后缀约定 |
| **Android** | 48/72/96/144/192px PNG | mdpi → xxxhdpi |
| **Web** | @1x/@2x PNG | 标准 retina 适配 |
| **Favicon** | 16/32/48px ICO (合并) + 180/192/512px PNG | apple-touch-icon + PWA manifest |

点击预设**替换**所有当前行。Favicon 预设自动勾选 ICO 合并。

### 添加新预设

在 `src/renderer/utils/export/presets.ts` 的 `PRESETS` 数组中添加新条目：

```ts
{
  key: 'my-preset',
  labelKey: 'iconExport.preset.myPreset',  // i18n key
  rows: [
    { sizeMode: 'scale', scale: 1, pixelSize: 0, format: 'png' },
    { sizeMode: 'pixel', scale: 1, pixelSize: 64, format: 'png' },
  ],
  icoMerge: false,  // 可选: ICO 合并默认值
},
```

同时在 `src/locales/en.json` 和 `src/locales/zh-CN.json` 添加 `iconExport.preset.myPreset` key。

## 尺寸模式

### 倍率模式 (@)

输出像素 = viewBox 最长边 × 倍率。例: viewBox 24×24, @2x → 48×48px。

支持 0.5x ~ 4x，步进 0.5。

### 固定像素模式 (PX)

直接使用输入值作为输出尺寸。方形输出。

支持 1px ~ 4096px，步进 1。

### 模式切换

@→PX 时自动计算: `pixelSize = scale × viewBoxSize`
PX→@ 时自动计算: `scale = pixelSize / viewBoxSize` (四舍五入到 0.5 步进)

## 文件命名

| 模式 | 规则 | 示例 |
|------|------|------|
| 倍率 @1x | `{iconName}.{ext}` | `home.png` |
| 倍率 @Nx | `{iconName}@{N}x.{ext}` | `home@2x.png` |
| 像素 | `{iconName}-{size}px.{ext}` | `home-48px.png` |
| SVG @1x | `{iconName}.svg` | `home.svg` |
| SVG @Nx | `{iconName}@{N}x.svg` | `home@2x.svg` |
| ICO 合并 | `{iconName}.ico` | `home.ico` |

## 导出行为

### 单图标

- **单行**: 弹出 Save Dialog，用户选择完整文件路径
- **多行**: 弹出 Save Dialog，用户选择基础文件名，所有行自动添加 suffix 写入同目录

### 批量

始终弹出 Open Directory Dialog，所有图标 × 所有行平铺写入选定目录。

### ICO 合并

当存在 2+ ICO 行时显示 checkbox（默认勾选）。合并后所有 ICO 尺寸写入一个 `.ico` 文件。

### 格式设置

仅当行列表中包含 JPG 或 WebP 时显示：
- **JPG 背景色**: 颜色选择器，默认 `#FFFFFF`
- **质量**: 滑块 10%–100%，默认 92%，适用于 JPG 和 WebP

## 渲染管线细节

### Canvas 光栅化 (方案 A)

使用 Chromium Canvas API，与 app 内显示同一渲染引擎，WYSIWYG。

```
SVG content
  → sanitizeSVG() (DOMPurify)
  → prepareSvgForRender() — 移除原有 width/height，注入目标尺寸
  → new Image() + canvas.drawImage()
  → canvas.toBlob(mimeType, quality)
```

**非方形 viewBox**: 以长边为基准等比缩放，短边按 aspect ratio 计算。PDF 和 ICO 的页面/entry 尺寸也保持 aspect ratio。

**viewBox 解析**: 支持双引号和单引号 (`viewBox="..."` 和 `viewBox='...'`)。无 viewBox 时默认 24×24。

### ICO 编码

手写二进制编码 (~60 行)，使用 PNG-compressed entries (非旧式 BMP)：

```
ICO Header (6 bytes): reserved(2) + type=1(2) + count(2)
Dir Entry × N (16 bytes each): w + h + palette + reserved + planes + bpp + dataSize + dataOffset
PNG Data × N: 原始 PNG 字节
```

256px 宽/高在 directory entry 中编码为 0 (ICO 规范)。

### PDF 生成

使用 `pdf-lib`：创建单页 PDF，嵌入 PNG 图片。页面尺寸匹配图片实际像素（含 aspect ratio）。

## 测试

```bash
npx vitest run test/unit/export-presets.test.js      # 预设 + 文件名 + 尺寸计算
npx vitest run test/unit/export-rasterize.test.js    # viewBox 解析 + SVG 预处理
npx vitest run test/unit/export-ico-pdf.test.js      # ICO 二进制编码
npx vitest run test/unit/export-integration.test.js  # 跨模块集成测试
```

## 依赖

| 包 | 用途 | 大小 |
|---|------|------|
| `pdf-lib` | PDF 页面生成 + PNG 嵌入 | ~400KB (tree-shakeable) |

ICO 编码、Canvas 光栅化均无额外依赖。

## i18n

所有用户可见字符串使用 `iconExport.*` 命名空间。新增 key 时必须同时更新 `en.json` 和 `zh-CN.json`。

## 已知限制

1. **Worker 未集成**: `exportRaster.worker.ts` 已创建但当前导出逻辑在主线程执行。大批量导出 (100+ 图标 × 多尺寸) 可能阻塞 UI
2. **SVG 渲染依赖 Chromium**: 复杂 SVG (text/foreignObject/外部引用) 可能与浏览器显示有细微差异
3. **小尺寸发虚**: 16/20/24px 等小尺寸如果 SVG 路径不是像素对齐的，光栅化结果可能发虚 — 正常现象

## 未来扩展

- 接入 VariantPanel 导出
- 自定义命名模板 (e.g. `{format}/{name}-{size}.{ext}`)
- 批量导出进度条 + Worker 并行
- resvg-js 作为备用渲染引擎（如果 Canvas 对复杂 SVG 质量不足）
