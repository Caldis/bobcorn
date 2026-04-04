# Session Handoff — 2026-04-04

> 前一个 Claude Code session 的完整交接。新 session 请先读此文档 + AGENTS.md。

## 项目状态

**版本**: v1.8.8+ | **GitHub**: Caldis/bobcorn | **路径**: D:\Code\bobcorn (Windows) / ~/Code/bobcorn (Mac mini)

**分支**: `master`

## 本 Session 完成的工作

### Wiki 知识库 (Feature: merged to master)

在官网 (bobcorn.caldis.me) 新增 Wiki 知识库栏目，科普图标字体格式的基本知识，并与应用导出功能做关联。

#### 架构:
- 纯静态 HTML，按语言分目录，GitHub Pages 部署
- 共享 CSS/JS 基础设施 + nav.json 导航数据
- 16 语言 × 9 页面 = 144 个 HTML 文件
- Editorial 文档风格，继承 landing page 品牌 DNA

#### 新增文件:
1. **`docs/wiki/shared/wiki.css`** — Wiki 样式 (品牌变量 + 文档适配)
2. **`docs/wiki/shared/wiki.js`** — 侧边栏、语言切换、动画
3. **`docs/wiki/shared/nav.json`** — 导航结构 + 16 语言翻译
4. **`docs/wiki/index.html`** — 语言检测入口页
5. **`docs/wiki/{lang}/*.html`** — 144 个内容页 (16 语言 × 9 页面)
6. **`docs/wiki/manifest.json`** — 页面注册表 (版本/翻译状态)
7. **`docs/wiki/validate.py`** — 一致性校验脚本 (5 项检查)
8. **`docs/wiki/MAINTENANCE.md`** — AI Agent 维护手册
9. **`docs/wiki/seo-inject.py`** — SEO 元数据批量注入脚本
10. **`docs/sitemap.xml`** — 站点地图 (145 个 URL)
11. **`docs/robots.txt`** — 爬虫引导

#### 9 个内容页:
| 页面 | 内容 |
|------|------|
| Icon Fonts 101 (`index.html`) | 概览 + 格式对比表 + 卡片入口 |
| SVG Font (`svg-font.html`) | 指纹卡 + XML 结构 + 管线源格式 |
| TTF (`ttf.html`) | 指纹卡 + 核心中间格式 + 桌面场景 |
| WOFF (`woff.html`) | 指纹卡 + zlib 压缩 + 兼容性回退 |
| WOFF2 (`woff2.html`) | 指纹卡 + Brotli + 推荐首选 |
| EOT (`eot.html`) | 指纹卡 + IE 遗留 + 弃用警告 |
| CSS @font-face (`css-font-face.html`) | 字体栈 + 图标类 + 性能优化 |
| SVG Symbol (`svg-symbol.html`) | Symbol vs Font + 加载策略 |
| Export Guide (`export-guide.html`) | Bobcorn 导出全流程 + 推荐配置 |

#### SEO:
每个页面注入: canonical URL + 17 hreflang + OG + Twitter Card + JSON-LD (Article + BreadcrumbList)

#### 修改文件:
- **`docs/index.html`** — landing page 导航栏添加 Wiki 链接
- **`docs/locales/*.json`** (16 个) — 添加 `nav.wiki` i18n key
- **`src/renderer/components/SideMenu/ExportDialog.tsx`** — 格式标签可点击跳转 Wiki，底部 Wiki 链接条
- **`src/locales/en.json` + `zh-CN.json`** — 添加 `export.wikiHint` + `export.wikiLink` i18n keys

#### 维护系统:
- `manifest.json` 跟踪所有页面的版本号和翻译状态
- `validate.py` 校验文件完整性、SEO 结构、交叉引用、manifest 同步
- `MAINTENANCE.md` 提供新增/更新页面的完整 SOP
- `seo-inject.py` 可重复运行注入 SEO 元数据

#### 测试状态:
- 358 tests passing (pre-existing 12 fail in database-variants.test.js)
- Build: electron-vite build clean
- Wiki validation: 5/5 checks pass

## 待做 / 待验收

1. **database-variants.test.js** — 12 个测试失败 (pre-existing，非本次引入)
2. **Windows 代码签名** — 未做
3. **Wiki 内容审校** — 16 语言翻译质量可进一步人工审校

## 已知问题

1. **sf-symbols-fixture.test.js** — 已从 vitest 默认 suite exclude (corrupt fixture)
2. **database-variants.test.js** — 12 tests failing (variant schema/CRUD)
3. **electron-pixel-picker 打包** — macOS/Linux/Windows 分发包缺失 EPP 模块
4. **ESLint warnings** — 已降级为 warn

## Wiki 维护文档

- **维护手册**: `docs/wiki/MAINTENANCE.md`
- **页面注册表**: `docs/wiki/manifest.json`
- **校验脚本**: `python docs/wiki/validate.py`
- **SEO 注入**: `python docs/wiki/seo-inject.py`

## 测试命令

```bash
FNM="/c/Users/mail/AppData/Local/Microsoft/WinGet/Packages/Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe/fnm.exe"
eval "$("$FNM" env --shell bash)" && "$FNM" use 18

npx vitest run                    # 358 passing (12 pre-existing fail)
npx electron-vite build           # clean build
python docs/wiki/validate.py      # 5/5 checks pass
npx electron-vite dev             # dev mode
```

## United Memory ID

`20260314-bobcorn-project` — 项目状态
`20260328-gh-macos-codesign` — 签名流程
