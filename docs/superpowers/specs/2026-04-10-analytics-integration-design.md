# Analytics Integration Design

> Date: 2026-04-10
> Status: Approved
> Scope: GA4 集成 + Analytics Gateway Layer + 隐私合规

## 概述

为 Bobcorn 应用和官网集成 Google Analytics 4 统计，搜集用户下载信息和应用内最低限度的使用数据。通过一个 **Analytics Gateway Layer** 集中管控所有遥测事件，确保隐私合规、已有功能全覆盖、新增功能不遗漏。

## 目标

1. 了解用户下载量和活跃度（DAU/MAU）
2. 了解核心功能的使用频次，指导产品优先级
3. 了解用户环境分布（OS/版本/语言），指导兼容性决策
4. 建立完善的隐私合规机制（分层同意、隐私政策）
5. 建立强制接入框架，防止新功能遗漏遥测

## 非目标

- 使用统计可视化 UI（本轮不做，仅预留数据基础）
- 崩溃报告 / 错误追踪
- 用户画像 / 身份关联
- A/B 测试

---

## 架构总览

```
                    ┌─────────────────────────┐
                    │  Event Catalog (TS)      │
                    │  所有事件集中声明         │
                    │  类型 + 元数据 + 分层     │
                    └────────┬────────────────┘
                             │
                    ┌────────▼────────────────┐
                    │  Analytics Gateway       │
                    │  consent 检查 → 分发     │
                    ├──────────┬───────────────┤
                    │  GA4     │  Local SQLite  │
                    │  (远程)  │  (使用统计)    │
                    └──────────┴───────────────┘
```

所有组件/store 通过 `analytics.track()` 发送事件，Gateway 负责：
1. TypeScript 编译期校验事件名合法性
2. 运行时检查用户 consent 层级
3. 附加环境元数据
4. 双写到 GA4 (Measurement Protocol) 和 本地 SQLite

---

## 模块 1: Event Catalog

### 文件位置

`src/core/analytics/catalog.ts`

### 结构

```typescript
type ConsentTier = 'basic' | 'detailed'

interface EventDef {
  category: string        // 功能域
  tier: ConsentTier       // 同意层级
  description: string     // 人类可读描述
}

const EVENT_CATALOG = {
  // ── Basic 层 (opt-out) ──
  'app.launch':          { category: 'app',    tier: 'basic', description: 'App started' },
  'app.update_check':    { category: 'app',    tier: 'basic', description: 'Checked for updates' },
  'app.update_install':  { category: 'app',    tier: 'basic', description: 'Installed an update' },

  // ── Detailed 层 (opt-in) ──
  'project.create':      { category: 'project', tier: 'detailed', description: 'Created a project' },
  'project.open':        { category: 'project', tier: 'detailed', description: 'Opened a project' },
  'icon.import':         { category: 'icon',    tier: 'detailed', description: 'Imported icons' },
  'icon.export':         { category: 'export',  tier: 'detailed', description: 'Exported icon files' },
  'font.generate':       { category: 'export',  tier: 'detailed', description: 'Generated font files' },
  'group.create':        { category: 'project', tier: 'detailed', description: 'Created a group' },
  'search.execute':      { category: 'icon',    tier: 'detailed', description: 'Searched icons' },
  'cli.command':         { category: 'cli',     tier: 'detailed', description: 'Executed CLI command' },
} as const satisfies Record<string, EventDef>

type EventName = keyof typeof EVENT_CATALOG
```

### 扩展规则

新增事件时：
1. 在 `EVENT_CATALOG` 中添加条目
2. 在对应的 store action 或 core operation 中调用 `analytics.track()`
3. 如果是全新的 category，同步更新隐私政策

---

## 模块 2: Analytics Gateway

### 文件位置

`src/core/analytics/gateway.ts`

### 职责

```typescript
// 公开 API（唯一对外接口）
function track(event: EventName, params?: Record<string, unknown>): void

// 初始化（main 进程启动时调用）
function initAnalytics(consent: AnalyticsConsent): void

// 更新同意状态（用户在设置中切换时）
function updateConsent(consent: AnalyticsConsent): void
```

### 内部流程

```
track('icon.import', { count: 5 })
  │
  ├─ 1. 查 catalog → 取 tier (编译期已保证事件名合法)
  ├─ 2. 查 consent → tier='detailed' 且 detailedEnabled=false → 跳过 GA4
  ├─ 3. 附加 environmentMeta (OS/版本/语言/分辨率/架构)
  ├─ 4. GA4: POST /mp/collect (如果 consent 允许)
  └─ 5. Local SQLite: 始终写入 (不受 consent 影响)
```

### 环境元数据

```typescript
interface EnvironmentMeta {
  app_version: string    // "1.12.2"
  os: string             // "win32" | "darwin" | "linux"
  os_version: string     // "10.0.26100"
  locale: string         // "zh-CN"
  screen_res: string     // "2560x1440"
  arch: string           // "x64" | "arm64"
}
```

通过 `process` 和 `screen` API 在 main 进程获取，Gateway 自动附加。

### 运行环境

- Gateway 放在 `src/core/`，纯 Node.js，零浏览器依赖
- Renderer 通过 IPC 调用 main 进程的 Gateway
- CLI 直接调用 Gateway（共享同一套代码）

---

## 模块 3: GA4 集成

### 网站端（已有，需补充）

- 现有 `docs/index.html` 已接入 GA4 `G-H1DCS6LF3S`
- 新增：下载按钮点击事件 `gtag('event', 'download_click', { platform: 'win'|'mac'|'linux' })`
- 新增：轻量 cookie consent banner
- 新增：`docs/privacy.html` 链接到 footer

### 应用端（新增）

使用 GA4 Measurement Protocol：

```
POST https://www.google-analytics.com/mp/collect
     ?measurement_id=G-H1DCS6LF3S
     &api_secret=<write-only-secret>

{
  "client_id": "<persistent-uuid>",
  "events": [{
    "name": "app_launch",
    "params": { ... environmentMeta, ...eventParams }
  }]
}
```

| 决策 | 方案 |
|------|------|
| client_id | 首次启动生成 UUID v4，存入 electron-store，不关联用户身份 |
| api_secret | 硬编码（Measurement Protocol secret 是 write-only，Google 官方允许嵌入客户端） |
| 发送时机 | 事件发生时立即发送，不做批量缓冲 |
| 离线处理 | 发送失败静默丢弃，不重试（本地 SQLite 已有完整记录） |
| 网络 | 使用 Electron main 进程 `net.fetch()`，不走 renderer |

---

## 模块 4: 本地 SQLite 存储

### Schema

```sql
CREATE TABLE analytics_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  event     TEXT NOT NULL,
  category  TEXT NOT NULL,
  project   TEXT,              -- 当前 .icp 项目名，NULL = 跨项目事件
  params    TEXT,              -- JSON
  ts        INTEGER NOT NULL   -- Unix timestamp (ms)
);

CREATE TABLE analytics_daily (
  date      TEXT NOT NULL,     -- "2026-04-10"
  event     TEXT NOT NULL,
  category  TEXT NOT NULL,
  project   TEXT,
  count     INTEGER DEFAULT 0,
  PRIMARY KEY (date, event, project)
);
```

- 明细表保留 90 天，Gateway 启动时清理过期数据
- 聚合表永久保留
- `project` 取自当前打开的 `.icp` 文件名
- 本地数据不受 consent 开关影响（这是用户自己的数据）
- 为将来的"使用统计"可视化预留基础

---

## 模块 5: 分层同意系统

### 数据分层

| 层级 | 内容 | 默认 | 控制方式 |
|------|------|------|----------|
| Basic (opt-out) | 匿名启动 ping、更新检查、OS/版本/语言/分辨率 | 开启 | 设置中关闭 |
| Detailed (opt-in) | 功能使用事件（导入/导出/生成/搜索/CLI 等） | 关闭 | 首次启动邀请 + 设置中开启 |

### 持久化

```typescript
interface AnalyticsConsent {
  basicEnabled: boolean      // 默认 true
  detailedEnabled: boolean   // 默认 false
  consentShownAt: string     // ISO 日期
  consentVersion: number     // 隐私政策版本号，更新时可触发重新展示
}
```

存储在 electron-store（与 update-preferences 同层），main 进程持有。

### 首次启动 Consent 弹窗

**时机**：首次启动，SplashScreen 展示后，数据库初始化完成后弹出。

**内容**：

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  📊 帮助改进 Bobcorn                             │
│                                                 │
│  为了改进产品体验，Bobcorn 会收集匿名的           │
│  基础使用数据（如启动次数、系统版本）。            │
│  不包含任何项目内容或个人信息。                    │
│                                                 │
│  ☐ 同时分享功能使用统计（如导入/导出次数）         │
│    帮助我们了解哪些功能最有价值                    │
│                                                 │
│  你可以随时在 设置 → 数据共享 中更改这些选项。     │
│  详见 隐私政策↗                                  │
│                                                 │
│                          [ 好的，我了解了 ]       │
│                                                 │
└─────────────────────────────────────────────────┘
```

**交互**：
- 不阻断使用，无"拒绝"按钮（Basic 层是 opt-out，用户事后在设置中关闭）
- 勾选复选框 → Detailed 层也开启
- 隐私政策链接通过 `shell.openExternal()` 跳转
- 弹窗设计需通过 /frontend-design 确保精美友好、不引起用户反感
- 弹窗与 SplashScreen 互不冲突（SplashScreen 是全屏欢迎页，consent 是浮层 Dialog）

### CLI 同意

首次运行 CLI 命令时在终端打印一行提示：
```
ℹ Bobcorn collects anonymous usage data. Run `bobcorn config analytics` to manage.
```
非交互式模式默认 basic only。

### 设置 → 数据共享 Section

在 SettingsDialog 现有分段结构中新增 section：

```
──────────────────────────────────────
📊 数据共享

匿名基础数据（启动、系统信息）          [●─ 已开启]
ℹ️ 不含任何项目内容，帮助我们了解兼容性

功能使用统计                            [─○ 已关闭]
ℹ️ 分享导入/导出等操作频次，帮助改进功能

所有数据均匿名且不含项目内容。查看 隐私政策↗
──────────────────────────────────────
```

开关使用 Switch 组件，切换即时生效，通过 IPC 更新 main 进程 consent 状态。

---

## 模块 6: 隐私政策页面

### 文件位置

`docs/privacy.html` — 与 `docs/index.html` 同级，GitHub Pages 部署。

### 内容结构

1. **我们收集什么**：分两层列出（Basic / Detailed），具体事件名和描述
2. **为什么收集**：改进产品体验、了解兼容性
3. **如何收集**：GA4 Measurement Protocol、匿名 client_id
4. **如何退出**：设置 → 数据共享
5. **数据保留**：GA4 默认 14 个月、本地 90 天明细 + 永久聚合
6. **不收集什么**：项目内容、SVG 数据、文件名、个人信息
7. **联系方式**

### 语言

中英双语，复用现有网站的语言检测逻辑。

### 网站 Consent Banner

在 `docs/index.html` 底部新增轻量 cookie banner：
- 文案：本站使用 Google Analytics 收集匿名访问统计。继续浏览即表示同意。
- "我知道了"按钮，点击后 localStorage 记住状态
- 隐私政策链接

---

## 模块 7: 强制接入机制

### 编译期（主要手段）

`analytics.track()` 的参数类型为 `EventName`（从 EVENT_CATALOG 推导的 union type）。传入未注册的字符串 → TypeScript 编译失败。

### 规范级

在 `docs/CONVENTIONS.md` 新增 "Analytics" 章节：
> 新增用户可感知的操作（导入/导出/创建/删除等）必须在 Event Catalog 注册对应事件并调用 `analytics.track()`。

### 运行时提醒（dev 模式）

Gateway 在 dev 模式下，对没有对应 track 调用的 store action 打印 console.warn：
```
[analytics] action "xxx" has no tracking event — intentional?
```
仅作为开发提醒，不阻断执行。

---

## 文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/core/analytics/catalog.ts` | 新增 | 事件注册表 |
| `src/core/analytics/gateway.ts` | 新增 | 分发网关 (consent + GA4 + SQLite) |
| `src/core/analytics/environment.ts` | 新增 | 环境元数据采集 |
| `src/core/analytics/ga4.ts` | 新增 | GA4 Measurement Protocol 客户端 |
| `src/core/analytics/local-store.ts` | 新增 | 本地 SQLite 读写 |
| `src/core/analytics/types.ts` | 新增 | 共享类型 (ConsentTier, AnalyticsConsent, etc.) |
| `src/core/analytics/index.ts` | 新增 | 模块入口 (导出 track, init, updateConsent) |
| `src/main/analytics-consent.ts` | 新增 | electron-store consent 持久化 + IPC 注册 |
| `src/main/index.ts` | 修改 | 启动时初始化 analytics |
| `src/preload/index.ts` | 修改 | 暴露 analytics IPC bridge |
| `src/renderer/components/ConsentDialog/index.tsx` | 新增 | 首次启动 consent 弹窗 |
| `src/renderer/components/SideMenu/SettingsDialog.tsx` | 修改 | 新增"数据共享"section |
| `src/renderer/store/index.ts` | 修改 | 新增 consent 状态 + track 调用 |
| `src/renderer/containers/MainContainer/index.tsx` | 修改 | 首次启动弹窗逻辑 |
| `docs/privacy.html` | 新增 | 隐私政策页面 |
| `docs/index.html` | 修改 | cookie banner + 下载事件 + privacy 链接 |
| `docs/CONVENTIONS.md` | 修改 | 新增 Analytics 章节 |
| `src/locales/zh-CN.json` | 修改 | 新增 analytics 相关翻译 key |
| `src/locales/en.json` | 修改 | 新增 analytics 相关翻译 key |
| `test/unit/analytics/` | 新增 | Gateway + catalog 单元测试 |

---

## 测试策略

### 单元测试 (Vitest)

- Gateway: consent 过滤逻辑（basic 事件在 detailedOnly 关闭时仍发送）
- Gateway: 环境元数据正确附加
- Catalog: 所有事件均有合法的 category 和 tier
- GA4 client: 正确格式化 Measurement Protocol payload
- Local store: SQLite 写入和聚合逻辑
- Consent: 持久化和状态切换

### E2E (现有流程补充)

- 首次启动弹出 consent 弹窗
- 设置中数据共享开关可切换
- 隐私政策链接可跳转
