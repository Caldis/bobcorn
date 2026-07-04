# Session Handoff — 2026-04-04

> 前一个 Claude Code session 的完整交接。新 session 请先读此文档 + AGENTS.md。

## 项目状态

**版本**: v1.8.10 | **GitHub**: Caldis/bobcorn | **路径**: D:\Code\bobcorn (Windows) / ~/Code/bobcorn (Mac mini)

**分支**: `master`

## 本 Session 完成的工作

### 1. Icon Variants (Auto Adapt) — Phase 1

完整实现了 SF Symbols 风格的图标变体生成系统。用户选中图标后可在右侧面板调整粗细 (9 档) 和尺寸 (3 档)，生成最多 26 个变体。

#### 技术架构:
- **Weight**: SVG `feMorphology` 滤镜 (erode/dilate) 实时预览 + Canvas rasterize → imagetracerjs 矢量化 bake
- **Scale**: viewBox 缩放 (纯矢量，无需 bake)
- **数据模型**: `iconData` 表新增 `variantOf` + `variantMeta` 列，父子关系，向后兼容

#### 新增文件:
| 文件 | 职责 |
|------|------|
| `src/renderer/utils/svg/variants.ts` | Weight/Scale 常量、feMorphology 注入、viewBox 变换、命名 |
| `src/renderer/utils/svg/bake.ts` | Canvas 光栅化 + imagetracerjs 矢量化管线 |
| `src/renderer/workers/variantBake.worker.ts` | Web Worker (OffscreenCanvas + createImageBitmap) |
| `src/renderer/components/SideEditor/VariantPanel.tsx` | 变体 UI：滑块、Scale 切换、预览、生成、缩略图网格 |
| `src/renderer/utils/variantGuard.ts` | 统一变体检查层 (checkVariants + buildVariantWarning) |
| `test/unit/variants.test.js` | 20 tests — 常量、命名、filter 注入、scale 变换 |
| `test/unit/bake.test.js` | 3 tests — buildVariantMeta |
| `test/unit/database-variants.test.js` | 14 tests — CRUD、级联、迁移 |
| `test/unit/variant-guard.test.js` | 38 tests — 静态分析：扫描所有组件确保 db 写操作经过 variantGuard |

#### 修改文件:
| 文件 | 变更 |
|------|------|
| `src/renderer/database/index.ts` | Schema 迁移 + SQL 索引 + 8 个变体方法 + 批量预取 |
| `src/renderer/store/index.ts` | variantProgress + variantCounts + prefetchedContent |
| `src/renderer/components/SideEditor/index.tsx` | VariantPanel 集成 + 级联删除/移动 + section icons |
| `src/renderer/components/IconBlock/index.tsx` | 变体 badge + 性能优化 (stable selectors + idle loading) |
| `src/renderer/components/IconGridLocal/index.tsx` | 批量预取 + debounce |
| `src/renderer/components/BatchPanel/index.tsx` | 批量生成变体 + 进度条 |
| `src/locales/zh-CN.json` / `en.json` | 30+ variant.* i18n keys |
| `package.json` | imagetracerjs 依赖 |

#### 变体行为规则:
- 变体不出现在中央画布 (SQL WHERE variantOf IS NULL 过滤)
- 变体不参与字体导出 (getIconList 已过滤)
- 变体仅在 VariantPanel 缩略图区域管理 (按 weight 分组展示)
- 删除/回收/移动主图标 → 级联处理变体 + 琥珀色警告
- 复制主图标 → 不含变体 (提示)
- 替换主图标 → 清除变体 (确认弹窗)
- 变体支持单独导出 SVG (hover 下载按钮)
- variantGuard 静态分析测试确保所有 db 写操作不遗漏

### 2. 性能优化 (4 轮)

| 轮次 | 问题 | 修复 | 效果 |
|------|------|------|------|
| 1 | N+1 查询: 7000x getVariantCount() | SQL 索引 + GROUP BY 批量查询 + store 缓存 | 7000 查询 → 1 |
| 2 | groupData 级联: 全部 IconBlock 重渲染 | useCallback 稳定选择器 + 去掉 groupData 依赖 | 消除级联 |
| 3 | 逐个加载 SVG + 布局抖动 | 批量预取 + aspect-square 占位 + 交错淡入动画 | 波浪渐显 |
| 4 | 预取和滚动竞争主线程 | debounce(80ms) + requestIdleCallback 双保险 | 滚动丝滑 |

#### 新增文档:
- **`docs/PERFORMANCE.md`** — 性能 SOP、8 条规则、回归 checklist、性能预算、优化历史

### 3. UI 改进

- SideEditor section headers 加图标 (Info/Palette/Layers/Wrench/Download)
- "高级操作" → "操作" (Wrench icon)
- 导出独立 section 置底
- 变体区块始终展开 (去掉折叠)
- 移动分组弹窗美化 (主次按钮 + Radio 高亮)
- SVG 颜色编辑器: fill="currentColor" 支持

### 4. SF Symbols 测试 Fixture

- 7007 个真实 SF Symbols SVG (via sf-symbols-svg MIT)
- 28 个分类 (via Rspoon3/SFSymbols MIT)
- 27MB .icp fixture + categories.json
- 56 个验证测试

## 设计文档

| 文件 | 内容 |
|------|------|
| `docs/superpowers/specs/2026-04-02-icon-variants-design.md` | 变体功能设计 spec |
| `docs/superpowers/plans/2026-04-04-icon-variants-phase1.md` | Phase 1 实施计划 (12 tasks) |
| `docs/PERFORMANCE.md` | 性能 SOP + 回归 checklist |

## 待做 (Phase 2)

1. **Rendering Mode** — 路径点选分层 + 4 种渲染模式 (Mono/Hierarchical/Palette/Multicolor)
2. **变体对比视图** — 并排查看所有变体
3. **变体参数批量调整** — 修改已生成变体的参数

## 已知问题 (2026-07-04 更新)

1. **electron-pixel-picker 打包** — macOS/Linux/Windows 分发包缺失 EPP 模块
2. **lint 门禁失效** — `npm run lint` (`--max-warnings 0`) 有 60+ 存量 warning 无法通过
3. **full-e2e.js 与当前 UI 严重脱节** — 10/17 步失败（断言已被移入 FileMenuBar 的"导入"工具栏按钮、旧设置对话框触发方式、不存在的 fixture 路径），失败在 master 上同样存在，需系统性重写；acceptance.js 的同类漂移已修复（22/22）
4. **seo-inject.py 与站点结构脱节** — 每次运行会用过时硬编码模板覆盖手工维护的 `docs/sitemap.xml` / `docs/robots.txt`（Content-Signal/AI 爬虫规则/Schemamap 等）。运行后务必 `git diff` 检查这两个文件；根治需同步脚本模板
5. **打包版持锁导致 dev 静默退出** — 安装版 `Bobcorn.exe` 运行时持有单实例锁，`electron-vite dev` 会 exit 0 无报错退出；杀进程命令只匹配 `electron.exe` 杀不到它。先 `(Get-Process -Name Bobcorn).CloseMainWindow()` 优雅关闭再启动 dev
6. **sf-symbols fixture 为本地生成物**（`test/fixtures/*` 除 icons/ 外全部 gitignore）— 用 `node test/fixtures/sf-symbols/generate-icp.js` 从旧 icp 重建；分组名需 PascalCase（generator 已处理），CI 上相关测试自动跳过

### v1.13.0 已修复

- CLI sf-symbols 测试失败 → fixture 重新生成（28 组 PascalCase / 7007 图标）
- AGENTS.md/本文档 fnm 路径过时 → 已更新为 `~/AppData/Roaming/fnm/node-versions/v18.20.8/installation`
- 字码耗尽静默重复分配 + 码表 off-by-one → 耗尽显式报错（PUA_EXHAUSTED），F8FF 可分配
- 重复字码全链路静默导致导出产物损坏 → 字码覆盖可视化 + 导出审计 + 导入审计 + 一键修复 + 网格/编辑器标识 + CLI `code fix` 全链路落地；回收站图标不再被导出

## 测试命令

```bash
# Node 18 (fnm 的 WinGet 安装路径已失效, 直接用版本目录)
export PATH="$HOME/AppData/Roaming/fnm/node-versions/v18.20.8/installation:$PATH"

npx vitest run                    # 725 tests
npx electron-vite build           # clean build
npx electron-vite dev             # dev mode
```

## United Memory ID

`20260314-bobcorn-project` — 项目状态
`20260328-gh-macos-codesign` — 签名流程
