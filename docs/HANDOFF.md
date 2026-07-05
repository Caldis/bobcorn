# Session Handoff — 2026-07-05

> 前一个 Claude Code session 的完整交接。新 session 请先读此文档 + AGENTS.md。

## 项目状态

**版本**: v1.15.0（下方 07-05 摘要已随 v1.15.0 发布，release 三平台产物+更新元数据齐全，官网 Pages 已同步） | **GitHub**: Caldis/bobcorn | **路径**: D:\Code\bobcorn (Windows) / ~/Code/bobcorn (Mac mini)

**分支**: `master`

## 2026-07-05 Session 摘要（全局排版规范化，**未发版**）

**问题**：全应用字体/字号/颜色/字重反复不统一（用户举证：编辑分组弹框「分组名称」比「描述/分组图标」更大更黑；字码区间「起始/结束」input 的中文 placeholder 掉等宽字体；侧栏详情「名称/字码」与「基本信息」不一致；底部筛选栏「图标名称/图标字码」不一致）。多代理审计确认是**框架层三缺失**（根因）：① 声明的 `Inter`/`SF Pro Display`/`Cascadia Code` 从未打包（无 `@font-face`），全靠系统 fallback 跨 OS 漂移；② 无排版 base 层（`globals.css` 只给 body 定 family+色）；③ 无排版原语/token，每组件手搓 `text-[Npx]`/`font-*`/`text-foreground-*/透明度`——同一「区块标题」跨弹框 6 种写法、字段标签 4 种、muted 透明度 6 档。

**方案（已落地）**：
- **字体资源**：`@fontsource/inter` + `@fontsource/cascadia-code`（仅 latin 子集，woff2 共 ~150KB）经 `entry.ts` 本地打包，**绝不引 CDN**；中文刻意回退系统字体（`tailwind.config.js` 显式列 CJK fallback）。
- **排版 token 层**：`globals.css` `@layer components` 新增 9 个语义类 `.t-title/.t-section/.t-label/.t-body/.t-note/.t-value/.t-caption/.t-help/.t-pill`（一个类带齐字号+字重+颜色）；标签统一 **13px/500/主色**（用户拍板）；muted 收敛到 `-muted`/`-subtle` 两档。
- **mono placeholder 守卫**：`input.font-mono::placeholder{font-family:sans}` 全局根治——中文 placeholder 再不掉等宽（`placeholder:` 只能改色不能改字族，无法脱离 mono，故需此守卫）。
- **全量改造**：4 波子代理改 ~25 文件（原语 `enhance/input`+`ui/*`、7 个弹框、9 个外壳、9 个漏审组件）到语义类；硬编码 `amber/violet` 文本色→`warning/accent` 语义 token（保留收藏星金色、AI 卡片装饰紫）。
- **守门**：`test/unit/typography-guard.test.js`——① 禁止 `text-<palette>-<n>` 文本色（当前 0）；② 裸 `text-[Npx]` 只允许 12 个 grandfathered 文件（ratchet 只减不增，含合法微观场景：深色底 tooltip、14px 圆内 `text-[7px]` 计数、响应式双尺寸）；③ 防陈旧。
- **文档**：新增 `docs/TYPOGRAPHY.md`；`AGENTS.md` 关键约定 + 文档索引固化（未来新功能挂 `.t-*` 即自动匹配）。

**验收全绿**：build ✓；vitest **845 passed**（新增 3 守门）；acceptance **22/22**；full-e2e **21/21**；三问题区域 E2E 截图逐一视觉确认（06 SideEditor、09 编辑分组+字码区间、13 工具栏）。**尚未 commit / 未发版**——下个 session 可按需走发版流程（注意 AGENTS.md 里 "169 tests" 已过期，实际 845）。

## 2026-07-05 Session 摘要（已随 v1.15.0 发布）

**打包版 CLI 完全不可用（P0，比上次"缺 CLI 产物"更深一层）**：v1.14.0 发布后用户点"安装 CLI 到 PATH"报 `Cannot find module 'commander'`。根因：tsup 默认把 package.json `dependencies` 全部 externalize，`out/cli/index.cjs` 顶层 `require("commander")` 等留在 bundle 里；dev 下 node 向上解析命中项目 node_modules，打包后 CLI 在 `app.asar.unpacked` 由系统 Node 运行，依赖在 asar 内普通 Node 读不到 → 启动即崩（不止安装按钮，终端 `bobcorn` 同样崩）。修复：`tsup.config.ts` 加 `noExternal: [/.*/]` 全量打包（11.69 MB，sql-asm.js 占大头；ttf2woff2 走 JS fallback 可打包），干净目录实证 `--version`/`export font` 全格式通过。附带修：`runCli`（main）与 install wrapper 补 `ELECTRON_RUN_AS_NODE=1`，覆盖无系统 Node 时 fallback 到 Electron 本体的场景。

**更新提示浮窗改造（UpdateIndicator）**：① 整卡限高视口 1/3（此前 v1.13.0 无任何限制导致长 changelog 飞出屏幕；v1.14.0 只在 ul 上有 240px 局部限制），header 固定 + body 滚动；② 点击卡片在 Dialog 弹窗中放大展示完整内容（`update.clickToExpand` i18n key 已加 zh/en）；③ 跨版本更新 changelog 聚合：拉取网站 changelog.json 后按 semver 过滤 `(已装版本, 目标版本]` 区间内全部条目倒序展示（`__APP_VERSION__` 做下界），卡片/弹窗标题显示 `v旧 → v新` 区间，找不到区间条目时回退精确匹配目标版本，网站不可达时回退 electron-updater releaseNotes 纯文本。**踩坑**：Dialog 若渲染在 hover 容器 JSX 内，Radix portal 的 React 合成 mouseEnter 会沿 React 树冒泡回容器把 hover 卡片重新唤出（截图实证）——已移出为兄弟节点并加回归断言。

**验收状态（发版前全绿）**：vitest 842 passed（含 CLI 188）；acceptance 22/22；full-e2e 21/21；security-audit 0 issue；docs:check 通过；临时 Playwright 验证脚本 12/12（限高/滚动/聚合/放大/卡片关闭回归）。发版小插曲：master 两次 push 相隔 26s 触发 Pages 部署竞态（"Deployment failed, try again later"），`gh api repos/{repo}/pages/builds -X POST` 重建即可。

## 2026-07-04 Session 摘要（多代理并行，已随 v1.14.0 发布）

**综合小优化（19 项）**：回收站字码占用提示条；字码分配 desc 随 append/fill 联动；字码覆盖 6400/PUA 科普 tooltip；项目名称(displayName)与图标字码前缀(projectName)拆分（双端 schema 迁移 + NewProjectDialog + 设置页可编辑 + CLI --display-name）；左下角 SlidersHorizontal 入口 = 显示+排序合并面板（排序真正接线：4 字段×升降序，store→viewModel）；批量按钮 grid-cols 过渡动画；搜索框/面板 text-xs；图标网格框选（基于虚拟化行几何命中 + 自动滚动 + Escape 还原）；图标右键菜单（IconContextMenu，普通/回收站两套菜单，variantGuard 全流程）；移动/复制弹窗统一为共享 GroupPickerDialog（未分组项带标签 + 分组封面图标，单选/批量/右键三路径共用）；批量收藏实时同步 + 混合态 StarHalf "收藏 (N/M)"；批量变体 beta 标；取色器改 portal 定位（单选/批量）；导入 toast 区分追加末尾/填充孔洞（addIcons 返回 appended/filled）；toast ✓✗! 换内联 SVG；项目选择器箭头收起指左展开指上。

**发版遗留清账**：seo-inject.py 默认只读校验 + `--force-seo-files`；electron-pixel-picker 打包"缺失"确认为过期问题（e9ba047 已修，A/B 打包实证）；CLI `--code-mode append|fill`（顺带修复 core 分配长期缺 append 语义的分叉）；full-e2e.js 系统性重写（20 步，两次全绿）；lint 63 warning 清零（门禁恢复）。

**临时发现修复**：更新卡片"无更新说明"（根因：只读线上 changelog.json 无兜底 + Release body 从不来自 changelog；现三层校验 + releaseNotes 纯文本兜底）+ 更新弹窗左缘截断（portal clamp）；设置弹窗 CLI 检测阻塞 3-5s（main 进程 execSync → 异步 + 缓存）；打包版缺 CLI 产物（release 构建作业漏 tsup，已挂进 build 链，本地实证产物在位）。

**CLI-first 机制落地**：`test/unit/core-parity-guard.test.js`（renderer database 94 方法冻结清单 + registry↔CLI 覆盖检查）；AGENTS/FEATURE_WORKFLOW/CONVENTIONS 文档硬化；`docs/MIGRATION.md` 新增 Renderer↔Core parity 矩阵与 13 条 backlog。已知机制盲区（绕过 database 直接在组件/store 写业务、行为等价性无自动验证）记录在该代理汇报中，靠 backlog 逐条对齐。

**新功能：分组字码区间（已完成）**：设计定稿 `docs/superpowers/specs/2026-07-04-group-code-ranges-design.md`（含用户确认的三决策：移动越界=弹窗内联选择默认重分配、预留语义=全局分配避开各组区间、禁止区间重叠）。三波交付：① core+CLI——`groupData` 双端加 `codeRangeStart/End` 列+迁移；**单一真相源 `src/core/code-allocation.ts` 纯函数，core 与 renderer 分配逻辑共用**（区间内 append/fill、GROUP_RANGE_EXHAUSTED、全局池跳过预留区）；CLI `group set-code-range <g> E100-E1FF|--clear`、`group inspect`（区间+占用）、`group check`（越界清单）、`icon move --reassign|--keep-codes`；② 共享矩阵——`components/CodeMatrix/`（display|range-select 双模式、缩放 64/16/4/1 码/格、拖选吸附 hex 边界遇预留截断、hex 输入双向同步、6400 格事件委托），CodeCoverageMatrix 变 display 薄壳零回归；③ GUI——分组新建/编辑弹窗区间区块（GroupDialogs，经扩展的 `setGroupInfo` 落库）、GroupPickerDialog 越界内联单选（SideEditor/BatchPanel/右键三路径统一透传 `opts.reassignOutOfRange`）、网格琥珀越界标识（store `outOfRangeCodes` 仿 duplicateCodes）、项目设置覆盖矩阵展示各组预留区。**后续项**：字码健康"一键修复"并入越界回填（需整条修复链 range-aware，已评估暂缓）；CLI wiki 16 语言文档。

**验收状态（最终）**：lint 0 warning；vitest 832 passed / 0 failed；acceptance 22/22；full-e2e 21/21（含区间流程新步骤）两连跑；security-audit 0 issue；三守门测试 59/59。

**本次教训**：lint 代理给 useEffect 补依赖时把组件内**声明在 hook 之后**的 useCallback 放进 deps 数组，触发 TDZ ReferenceError 导致工作区白屏——单测不渲染组件抓不到，靠 e2e 才拦截。未来清 exhaustive-deps 必须核对被补标识符的声明顺序。

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

1. **打包版持锁导致 dev/E2E 静默失败** — 安装版 `Bobcorn.exe` 运行时持有单实例锁，`electron-vite dev` 与 Playwright 启动会 exit 0 无报错退出；杀进程命令只匹配 `electron.exe` 杀不到它。先 `(Get-Process -Name Bobcorn).CloseMainWindow()` 优雅关闭再启动
2. **sf-symbols fixture 为本地生成物**（`test/fixtures/*` 除 icons/ 外全部 gitignore）— 用 `node test/fixtures/sf-symbols/generate-icp.js` 从旧 icp 重建；分组名需 PascalCase（generator 已处理），CI 上相关测试自动跳过

### 2026-07-04 已解决（原 #1–#4）

- ~~electron-pixel-picker 打包缺失~~ → 过期陈述：2026-03-28 commit `e9ba047`（移除 files 里的 `"!node_modules"`）已根治，本次 A/B 打包实证 EPP 在 `app.asar.unpacked` 在位
- ~~lint 门禁失效~~ → 63 warning 清零，`npm run lint` 退出码 0（exhaustive-deps 处理见 Session 摘要"本次教训"）
- ~~full-e2e.js 脱节~~ → 系统性重写为 20 步（Playwright + data-testid 策略，覆盖本次全部新交互），连续两轮全绿；详见 docs/TESTING.md
- ~~seo-inject.py 覆盖手工文件~~ → sitemap/robots 默认只读校验，覆盖需显式 `--force-seo-files`

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
