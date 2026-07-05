# Typography — 排版规范

本项目的**唯一排版事实来源**。任何面向用户的文本，字号/字重/颜色都由 `src/renderer/styles/globals.css` 里 `@layer components` 定义的 `.t-*` 语义类统一承载。**新功能只要给文本节点挂对应的 `.t-*` 类即可自动匹配，无需再手写 `text-[Npx]` / `font-*` / `text-foreground-*`。**

## 为什么

早期各组件各自手写排版类，导致"同一语义、多种写法"：区块标题曾有 6 种写法、字段标签 4 种、muted 透明度 6 档混用。同一台机器上肉眼可见标签忽大忽小、深浅不一。根因是**缺少排版契约层**（详见 `docs/HANDOFF.md` 对应条目）。`.t-*` 类就是这层契约。

## 字体资源

- 应用字体在 `src/renderer/entry.ts` 中通过 `@fontsource/*` **本地打包**（Inter + Cascadia Code，仅 Latin 子集）。**绝不引 CDN 字体**（离线桌面应用会失败/闪烁）。
- Inter/Cascadia 只含 Latin，**中文刻意回退系统字体**（`tailwind.config.js` 的 `fontFamily.sans` 里显式列了 PingFang SC / Microsoft YaHei 等 CJK fallback）。不要打包 CJK 字体（体积过大）。
- `font-sans`（默认）用于一切 UI 文本；`font-mono`（Cascadia）**只**用于 hex 字码 / 数字 / 颜色值 / 文件路径 / ASCII 命令 / 快捷键。

## 语义排版类（`.t-*`）

给每个文本节点挂**恰好一个** `.t-*` 类，它一次性带齐字号+字重+颜色。保留布局类（`block` / `mb-*` / `flex` / `truncate` 等）。

| 类 | 规格 | 用途 |
|----|------|------|
| `.t-title`   | 18px / 600 / 主色 | 对话框、面板标题 |
| `.t-section` | 12px / 600 / 大写 tracking / muted | 区块/分组"眉头"标题 |
| `.t-label`   | 13px / 500 / 主色 | 表单/控件标签（input 上方标签、开关/单选文字） |
| `.t-body`    | 14px / 400 / 主色 | 正文段落、输入框内文字值、导航项主文字 |
| `.t-note`    | 14px / 400 / muted | 正文大小的次要文字：空状态、次要段落 |
| `.t-value`   | 12px / 500 / 主色 | 键值对的"值"、需强调的内联数据 |
| `.t-caption` | 12px / 400 / muted | 键值对的"键"、次要说明短语 |
| `.t-help`    | 11px / 400 / muted（leading-relaxed） | 帮助/描述/细则长文字 |
| `.t-pill`    | 10px / 500 | 徽标/胶囊/计数/tag |

### 颜色档位

muted 文本**只用两档**，不要再写 `/80 /70 /60 /50 /40 /30` 透明度：

- `text-foreground`（主色）— 由 `.t-title/.t-label/.t-body/.t-value` 自带
- `text-foreground-muted`（次要）— 由 `.t-section/.t-caption/.t-help` 自带
- `text-foreground-subtle`（更弱）— placeholder、禁用提示、图例等极弱文字

语义状态色用 token：`text-danger / text-warning / text-success / text-info / text-accent`。**禁止**硬编码调色板（`text-amber-600`、`text-violet-500` 等）。

## 规则

1. **看语义不看旧值**：一个字段标签即使历史上写成 12px muted，也应是 `.t-label`（13/500/主色）。
2. **一个节点一个 `.t-*`**：不要叠加多个排版类，也不要在 `.t-*` 之外再补 `text-xs`/`font-medium`。
3. **`font-mono` 只包 ASCII/hex/数字**。绝不用 `font-mono` 包中文——中文会掉进等宽 fallback。若等宽输入框的 placeholder 是中文，无需特殊处理：`globals.css` 里已有全局守卫 `input.font-mono::placeholder { font-family: sans }` 自动回落。
4. **基础组件已内建规范**：优先复用 `components/ui/*`（`Dialog` 标题、`Input`、`EnhanceInput` 标签等已挂好 `.t-*`）。用它们＝自动合规。
5. 新增字号需求时，**先问是否能归入现有 8 类**；确需扩展，改 `globals.css` 的 `@layer components` 增加新的 `.t-*`，并更新本表——绝不在组件里散写 `text-[Npx]`。

## 守门

`test/unit/typography-guard.test.js` 会扫描 `src/renderer/components`，拦截：
- 组件里新写的裸 `text-[Npx]`（应改用 `.t-*`）
- `font-mono` 直接包裹中文字符
违规将使 CI 变红。豁免清单在该测试文件顶部维护。
