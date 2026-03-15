# UI 现代化 + 多色图标支持 — 实施方案

> 2026-03-16 | 基于 v1.1.2 | 增量迁移策略

## 不可变约束

1. **导出协议不变**: .svg/.ttf/.woff/.woff2/.eot/.css/.js 文件格式和内容结构不做任何改动
2. **数据库 schema 向后兼容**: .icp 项目文件必须可加载 (新增列用 ALTER TABLE + DEFAULT)
3. **字体生成管线不变**: svgicons2svgfont → svg2ttf → ttf2woff/woff2/eot
4. **IPC 通信模式不变**: contextBridge + ipcMain/ipcRenderer

## 架构分析

**antd 使用范围**: 8/12 组件使用 antd，但仅用浅层原语 (Button, Modal, Menu, Input, Slider, Checkbox, Dropdown, message)，无深度布局组件 (Form, Table, Grid, Layout)。有利于迁移。

**CSS 架构**: 13 个 CSS Module 文件 + 1 个 global CSS (含 antd 覆盖)。Vite 用 `localsConvention: camelCase`。

**导出管线完全隔离**: generators 只读 database + HTML 模板，零 UI 框架依赖。

**多色 SVG 差距**: `SVG.formatSVG()` 剥离内联样式。Font glyph 天然单色。但 Symbol 模式 (`iconfontSymbolGenerator`) 已保留 SVG 内部颜色属性。

## 策略: 增量迁移 (非大爆炸)

antd 5 CSS-in-JS 与 Tailwind 不冲突。shadcn/ui 是源码复制 (非包依赖)，天然共存。逐组件替换，每步可测试。

## Phase 0: 基础设施 ✅ 已完成

- Tailwind CSS 3 + PostCSS + autoprefixer
- shadcn/ui 依赖 (Radix, CVA, lucide-react)
- tailwind.config.js + globals.css + 设计 tokens (亮色/暗色)
- cn() 工具函数
- 构建验证通过

## Phase 1: 原语组件迁移 (可并行)

### 1a: Button + Badge
- shadcn Button 替换所有 antd.Button (SideMenu, SideEditor, SplashScreen, IconToolbar)
- shadcn Badge 替换 antd.Badge

### 1b: Input + Search
- shadcn Input 替换 antd.Input (enhance/input, IconToolbar 搜索栏)

### 1c: Slider
- Radix Slider 替换 antd.Slider (IconToolbar 缩放)

### 1d: Modal / Dialog (最复杂)
- Radix Dialog 替换 antd.Modal (SideMenu 8 个, SideEditor 1 个, MainContainer 1 个)
- Radix AlertDialog 替换 Modal.confirm() (SideMenu 删除分组, SideEditor 回收图标)
- sonner 或 shadcn Toast 替换 antd.message

### 1e: Checkbox + Radio
- shadcn Checkbox 替换 antd.Checkbox (IconBlock, SideMenu 导出分组)
- shadcn RadioGroup 替换 antd.Radio (SideEditor 分组选择)

### 1f: Dropdown
- shadcn DropdownMenu 替换 antd.Dropdown (SideMenu 导入下拉)

## Phase 2: 菜单系统 + 侧边栏重设计

- 自定义侧边栏替换 antd.Menu/SubMenu
- Radix Collapsible 用于分组折叠
- Radix ScrollArea 用于滚动列表
- lucide-react 替换 @ant-design/icons
- **依赖**: Phase 1d (Dialog)

## Phase 3: SideMenu 拆分 (867行 → 子组件)

| 子组件 | 职责 |
|--------|------|
| ResourceNav.tsx | 全部/未分组/回收站 |
| GroupList.tsx | 可滚动分组列表 |
| ImportExportBar.tsx | 导入/导出/设置按钮 |
| ExportDialog.tsx | 导出相关对话框 |
| GroupDialogs.tsx | 分组管理对话框 |
| PrefixDialog.tsx | 前缀编辑对话框 |

## Phase 4: Grid + IconBlock 重设计

- 现代卡片风格 IconBlock
- 精致的悬浮/选中过渡
- 工具栏 (搜索栏, 缩放滑块) 现代化
- 空状态插图升级
- 布局过渡动画

## Phase 5: Editor 面板 + Splash 重设计

- SideEditor: 现代属性检视器布局, 大预览区, 内联验证
- SplashScreen: 现代欢迎界面, 卡片式项目入口, 最近项目列表
- Splash 从 antd.Modal 迁移到 shadcn Dialog 或全屏覆盖

## Phase 6: TitleBar + 布局打磨

- 自定义窗口控制按钮 (macOS/Windows 自适应)
- 可调整大小的三栏布局 (react-resizable-panels)
- 折叠/展开动画

## Phase 7: 暗色模式

- CSS 变量 + `dark:` 前缀
- 主题切换按钮
- localStorage 持久化
- 全组件暗色适配

## Phase 8: antd 移除

- 确认零 antd/icons 导入
- 移除 antd, @ant-design/icons 依赖
- 清理 global CSS antd 覆盖
- 验证 bundle 减小 (~1MB+)

## Phase 9: 多色图标支持

### 9a: 颜色感知显示
- IconBlock 保留 SVG 原始颜色预览
- 单色/彩色预览切换

### 9b: 数据库元数据扩展
- `ALTER TABLE iconData ADD COLUMN iconColorMode varchar(255) DEFAULT 'mono'`
- 导入时自动检测颜色模式
- 旧 .icp 加载时动态迁移 (向后兼容)

### 9c: 颜色编辑器
- SideEditor 颜色区域 (多色图标时显示)
- SVG path 颜色提取
- react-colorful 调色板
- 修改后保存回 database

### 9d: 导出感知
- 导出对话框提示: 多色图标仅 Symbol 模式支持
- CSS 演示页标记多色图标
- Symbol JS 生成器已保留颜色属性 (无需修改)

## Phase 10: 导出 HTML 演示页重设计

- 现代排版和布局
- 卡片式图标展示
- 即时搜索过滤
- 点击复制 Toast (替代 alert)
- 响应式设计
- **完全独立**, 可在任何时候执行

## 依赖图和并行策略

```
Phase 0 (✅ 完成)
  │
  ├─→ Phase 1a-f (并行)  ──→ Phase 2 ──→ Phase 3 ──→ Phase 6
  │                         │
  │                         ├─→ Phase 4
  │                         └─→ Phase 5
  │
  ├─→ Phase 9a-d (独立并行)
  │
  └─→ Phase 10 (独立并行)

Phase 1-6 全完成 → Phase 7 (暗色模式) → Phase 8 (antd 移除)
```

## 测试策略

每个 Phase 完成后必须通过:
1. `npx electron-vite build` — 构建成功
2. `npx vitest run` — 158 单元测试
3. `node test/e2e/full-e2e.js` — 17 E2E (含导出内容验证)
4. 截图比对 — 无意外回归
5. ICP fixture (2949 icons) 性能验证

## 风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| CSS 优先级冲突 (antd vs Tailwind) | 中 | @layer 控制级联, 逐步移除 antd 覆盖 |
| E2E 选择器失效 | 中 | 每个 Phase 后更新选择器 |
| Modal.confirm() 命令式→声明式 | 中 | 已有 state boolean 模式可复用 |
| SVG 颜色解析复杂性 | 高 | fill 属性 + style.fill, 不处理 gradient/pattern |
| .icp 迁移 | 低 | ALTER TABLE ADD COLUMN + DEFAULT |
