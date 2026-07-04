# 分组字码区间 (Group Code Ranges) — 设计定稿

> 2026-07-04 与用户确认的设计决策，实现阶段以本文档为准。

## 背景

用户希望不同分类的图标落在不同的字码区间以便管理和记忆。为分组增加可选的字码区间配置：图标添加进该组时，自动在区间内分配字码（受全局 append/fill 分配模式影响）。

## 已确认的设计决策

| 决策点 | 结论 |
|---|---|
| 移动越界交互 | **移动时内联选择**：GroupPickerDialog 内加一行提示 + 单选（默认「重新分配到区间内」，可选「保持原字码」），整批一次选择，兼容批量/右键/框选路径。不弹独立确认框。 |
| 组内越界提示 | 字码不在所属分组区间内的图标，在网格分组视图中有**特殊样式标识**（参照 duplicateCodes 撞码标识模式），并纳入字码健康体系（一键修复）。 |
| 预留语义 | **预留**：分组声明的区间只留给该组。全局/未分组/无区间分组的字码分配自动跳过所有已声明区间。区间是可选配置。 |
| 区间重叠 | **禁止重叠**：矩阵框选时其他分组已占区间不可选中；直接输入重叠时校验报错拒绝保存。 |
| 区间耗尽 | 显式报错（`GROUP_RANGE_EXHAUSTED`），提示用户扩大区间，不静默溢出到区间外。 |
| 新导入 | 添加进有区间的分组时无需询问，直接在区间内按 append/fill 分配。 |

## 数据模型

- `groupData` 表新增可空列 `codeRangeStart` / `codeRangeEnd`（INTEGER，十进制码点，UI 显示十六进制）。core 与 renderer 双端 schema + 旧文件打开自动迁移（仿 `migrateProjectColumns` / `ensureGroupIconColumn` 模式）。
- 约束：`PUA_START(0xE000) ≤ start ≤ end ≤ PUA_END(0xF8FF)`；与其他分组区间不相交。

## 分配语义（core 与 renderer 必须逐行对齐，参照 core-code-allocation.test.ts 的对齐先例）

```
allocate(mode, targetGroup):
  if targetGroup 有区间 R:
    append: 取 R 内已用最高码之后的空闲码；R 尾部满则回退在 R 内填洞；R 全满 → GROUP_RANGE_EXHAUSTED
    fill:   取 R 内最小空闲码；全满 → GROUP_RANGE_EXHAUSTED
  else (全局池 = PUA − 所有分组已声明区间的并集):
    append/fill 语义同现状，但跳过预留码位；全局池耗尽 → PUA_EXHAUSTED
```

- 移动重新分配 = 对每个越界图标在目标区间内 allocate（同批次基准一次性取定）。
- 「保持原字码」= 移动不改码，事后靠健康标识提示。

## CLI-first 实现顺序（守门测试约束下的唯一合法路径）

1. **Wave A — core + CLI**：schema/迁移、`group.set-code-range`/`clear` core op + registry + CLI 命令（`group set-code-range <group> E100-E1FF`、`--clear`）、分配逻辑双端对齐、`icon move --reassign|--keep-codes`、`group inspect` 展示区间与占用、单测（区间分配/预留跳过/重叠校验/耗尽/移动重分配）。**GUI 对区间的写操作必须走 core op 的 store 薄封装**——renderer database 方法面已被 core-parity-guard 冻结，不允许新增方法（修改既有 getNewIconCode/addIcons/moveIcons* 属合法）。
2. **Wave B — 共享矩阵组件**：将 `CodeCoverageMatrix` 重构为**单一共享组件**（参数控制，两处使用，禁止复制粘贴）：
   - mode: `display`（项目设置现状，视觉零回归）| `range-select`（分组弹窗）
   - 缩放：每格代表的码位数可切换（如 256/64/16/1），让用户精细调节
   - 区间选择：拖拽框选，**吸附到格子边界**（整十六进制边界，满足"整数区间便于记忆"诉求）
   - 占用图层：图标已用码位、其他分组已声明区间（不可选中）、当前编辑中的区间
   - 直接输入：起止十六进制输入框，与矩阵双向同步，校验（PUA 范围/重叠/start≤end）
3. **Wave C — GUI 接线**：分组新建/编辑弹窗加"字码区间"可选区块；GroupPickerDialog 越界内联选择（单选/批量/右键三路径共用）；网格越界样式标识（store 加 outOfRangeCodes 缓存，仿 duplicateCodes）；字码健康/覆盖矩阵展示分组区间；i18n 双语。

## 验收

- 全量 vitest 0 失败（含新分配测试与守门测试）
- full-e2e / acceptance 全绿（视情况为区间流程补 e2e 步骤）
- 项目设置的覆盖矩阵视觉无回归
