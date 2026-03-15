# UI 现代化 + 多色图标支持 — 实施方案

> 2026-03-16 | 基于 v1.1.2

## 不可变约束

1. **导出协议不变**: .svg/.ttf/.woff/.woff2/.eot/.css/.js 文件格式和内容结构不做任何改动
2. **数据库 schema 不变**: .icp 项目文件保持向后兼容
3. **字体生成管线不变**: svgicons2svgfont → svg2ttf → ttf2woff/woff2/eot
4. **IPC 通信模式不变**: contextBridge + ipcMain/ipcRenderer

## Phase A: 基础设施 (前置)

### A1: Tailwind CSS 集成
- 安装 tailwindcss + postcss + autoprefixer
- 配置 electron-vite renderer 的 PostCSS
- 创建 tailwind.config.ts + globals.css
- antd 和 Tailwind 共存 (过渡期)

### A2: shadcn/ui 集成
- 安装 @radix-ui 基础组件 (dialog, dropdown, slider, checkbox, tooltip)
- 安装 class-variance-authority + clsx + tailwind-merge
- 创建 src/renderer/components/ui/ 目录放 shadcn 组件
- 创建 cn() 工具函数

### A3: 测试补全
- E2E: 导出文件内容验证 (CSS class 格式、JS symbol 格式、字体文件大小)
- E2E: 分组操作 (创建、重命名、删除)
- E2E: 图标操作 (选择、编辑名称/字码、回收、恢复)
- E2E: 导出 HTML 在浏览器中的渲染验证
- Unit: 生成器输出格式验证

## Phase B: 核心 UI 重构

### B1: 设计系统
- 定义设计 tokens (颜色、间距、圆角、阴影)
- 暗色模式 CSS 变量
- 创建主题 Provider

### B2: TitleBar 重构
- 自定义窗口控制按钮 (现代风格)
- 应用 logo + 标题
- macOS/Windows 自适应

### B3: Splash 重构
- 现代欢迎界面
- 最近项目列表卡片化
- 新建/打开项目按钮

### B4: 三栏布局重构
- SideMenu (侧栏): 分组导航 + 导入/导出
- IconGrid (主区域): 图标网格 + 工具栏
- SideEditor (编辑器): 图标详情编辑

### B5: SideMenu 拆分 (800行 → 子组件)
- GroupNav: 分组列表
- ActionBar: 导入/导出/设置按钮
- ExportDialog: 导出对话框
- GroupDialog: 分组管理对话框

### B6: IconBlock 升级
- 现代卡片设计
- 悬浮预览
- 批量选择

### B7: SideEditor 升级
- 图标预览区
- 属性编辑表单
- SVG 代码查看器

## Phase C: 多色图标支持

### C1: SVG 颜色保留
- 导入时保留 SVG 原始颜色
- 数据库已存储完整 SVG (iconContent)
- 预览时使用原始 SVG 而非 iconfont glyph

### C2: 颜色编辑器
- SVG path 颜色拾取
- 调色板
- 颜色历史

### C3: Symbol 导出增强
- 多色图标自动使用 Symbol 方式
- 单色图标保持 unicode/fontClass 兼容

## Phase D: 导出 HTML 升级

### D1: 现代视觉设计
- 深色/浅色主题
- 响应式布局
- 现代排版

### D2: 交互增强
- 图标搜索 (实时过滤)
- 代码片段一键复制 (Toast 替代 alert)
- 图标预览放大

## 执行顺序

```
A1 → A2 → A3 (基础设施 + 测试安全网)
  ↓
B1 → B2 → B3 (设计系统 + 顶部组件)
  ↓
B4 → B5 → B6 → B7 (核心三栏布局)
  ↓
C1 → C2 → C3 (多色图标)
  ↓
D1 → D2 (导出 HTML)
```
