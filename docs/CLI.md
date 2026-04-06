# CLI 维护指南

> 确保所有用户操作通过 Core → CLI 框架统一收口。

## 架构概览

```
用户/AI Agent
    │
    ├── GUI (React) ──→ Store (薄封装) ──→ src/core/operations/
    │                                           │
    └── CLI (commander.js) ─────────────────────┘
                                                │
                                          src/core/database/
                                          (sql.js, 纯 Node.js)
```

**核心原则**: 业务逻辑只存在于 `src/core/operations/`，GUI 和 CLI 是它的两个消费者。

## 新增功能的收口流程

**任何新增的用户操作，必须按以下顺序实现：**

### Step 1: Core 操作

在 `src/core/operations/<domain>.ts` 中实现纯逻辑函数：

```typescript
// src/core/operations/icon.ts
export async function newOperation(
  io: IoAdapter,          // 文件 I/O 抽象
  projectPath: string,    // .icp 项目路径
  opts: { ... }           // 操作参数
): Promise<Result> {
  const db = await openProject(io, projectPath);
  try {
    // 业务逻辑...
    await saveProject(io, projectPath, db);
    return result;
  } finally {
    db.close();
  }
}
```

**禁止**: `window`, `document`, `electronAPI`, `import.meta.env`, `Buffer`（用 `TextEncoder`）

### Step 2: 注册到 Registry

在 `src/core/registry.ts` 添加操作条目：

```typescript
{
  id: 'icon.new-operation',
  description: '描述这个操作做什么',
  status: OpStatus.Core,
  corePath: 'src/core/operations/icon.ts#newOperation',
  cliCommand: 'icon new-operation',  // 或 null（内部操作）
}
```

### Step 3: CLI 命令

在 `src/cli/index.ts` 添加命令：

```typescript
icon
  .command('new-operation [icp] <arg>')
  .description('详细描述，帮助 AI Agent 理解用途、参数、副作用。')
  .option('--flag <value>', '选项说明')
  .action(async (icpOrArg: string, maybeArg?: string) => {
    const { project, args } = resolveProjectOrExit(...);
    // 调用 core 操作 → 格式化输出
  });
```

**CLI 描述要求**:
- 说明功能、输入、输出
- 说明副作用（如"删除变体"、"移动到未分类"）
- AI Agent 只靠 `--help` 来理解你的命令

### Step 4: GUI Store 封装

在 `src/renderer/store/index.ts` 添加薄封装：

```typescript
newOperation: async (opts) => {
  await coreNewOperation(electronIo, currentProjectPath, opts);
  get().syncLeft(); // 刷新 UI 状态
}
```

### Step 5: 测试

在 `test/cli/` 添加集成测试，使用 sf-symbols fixture (`test/fixtures/sf-symbols/sf-symbols.icp`):

```typescript
it('new operation works on real project', async () => {
  const { icp, cleanup } = await copyFixture(SF_SYMBOLS_ICP);
  try {
    const { json } = await runJson(['icon', 'new-operation', icp, ...]);
    expect(json.ok).toBe(true);
    // 验证实际效果...
  } finally {
    await cleanup();
  }
});
```

### Step 6: 更新文档

- `docs/wiki/en/cli.html`（+ 15 语言翻译）中添加命令示例
- 运行 `python docs/wiki/seo-inject.py && python docs/wiki/validate.py`

## 修改功能

修改现有操作时：
1. 改 `src/core/operations/` 中的逻辑（GUI 和 CLI 同时生效）
2. 如果参数变了，同步更新 CLI 命令定义和 `registry.ts`
3. 更新对应测试
4. **不要**在组件中直接改 database 逻辑——那是绕过框架

## 删除功能

1. 从 `src/core/registry.ts` 移除条目
2. 从 `src/cli/index.ts` 移除命令
3. 从 `src/core/operations/` 移除函数（如果不被其他操作引用）
4. 移除对应测试
5. 如果 database 表结构变了，在 `src/core/database/index.ts` 的 migration 中处理

## 自动化守卫

| 守卫 | 位置 | 作用 |
|------|------|------|
| **ESLint boundary** | `.eslintrc.cjs` | 组件直接导入 `database/` 时警告 |
| **Boundary guard test** | `test/unit/core-boundary-guard.test.js` | CI 阻止未审批的 database 导入 |
| **Parity guard test** | `test/cli/parity-guard.test.ts` | Core 操作必须有 CLI 测试 |
| **Migration dashboard** | `node scripts/migration-status.js` | 查看迁移进度 |

## 项目自动发现

CLI 支持三种方式指定项目，优先级从高到低：

```bash
bobcorn icon list my-icons.icp          # 1. 显式路径
bobcorn --project my-icons.icp icon list # 2. 全局 --project flag
cd my-project/ && bobcorn icon list      # 3. 自动发现当前目录 .icp
```

## JSON 输出契约

所有 `--json` 输出遵循三态信封：

| 状态 | `ok` | `code` | `data` |
|------|------|--------|--------|
| 全部成功 | `true` | `null` | 非 null |
| 部分失败 | `false` | `PARTIAL_FAILURE` | 非 null（含成功+失败项） |
| 全部失败 | `false` | `<ERROR_CODE>` | `null` |

新增错误码在 `src/cli/output.ts` 的 CliOutput 类型中定义。

## 构建

```bash
npx tsup              # 构建 CLI (out/cli/index.cjs)
npx electron-vite build  # 构建 GUI
npx vitest run        # 全量测试
```

CLI 和 GUI 构建独立。改了 core 代码两边都要重新构建。

## 当前状态

- **30/36 操作已迁移到 Core (83%)**
- **647 测试通过**
- **6 个 Legacy**: 3 个 GUI 内部 + 3 个需要 Canvas/DOM（variant.generate, export.icon, export.demo-page）
- 运行 `node scripts/migration-status.js` 查看详情
