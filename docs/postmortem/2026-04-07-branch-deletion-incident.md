# 事故复盘：Feature 分支误删导致工作丢失

**日期**: 2026-04-07
**严重程度**: 高（已恢复，无永久损失）
**影响范围**: project settings dialog、variant panel 重构、1.11.1 版本发布

---

## 事件概述

在合并 `feat/group-icon-cleanup-triggers` 分支时，Agent 选择性 cherry-pick 了部分文件后执行 `git branch -D` 删除了整个分支。分支上包含用户的其他工作（project settings dialog、variant panel beta、1.11.1 版本号），这些工作差点永久丢失。

后续恢复过程中，冲突解决不彻底，conflict markers 残留在 `ProjectSwitcher.tsx` 中导致应用崩溃。

## 时间线

1. Agent 创建 feature 分支实现 groupIcon cleanup triggers
2. Subagent 在分支上产生额外 commit（部分来自用户已有工作）
3. 用户说"合并提交"，Agent 只取 groupIcon 文件到 master
4. Agent 执行 `git branch -D` 删除分支 — **分支上其他工作变为不可达**
5. 用户发现 project settings 丢失
6. Agent 通过已知 SHA 恢复分支，cherry-pick 补回丢失 commit
7. Stash pop 产生冲突，Agent 解决了一处但遗漏了另一处
8. 用户发现残留 conflict markers 导致构建失败

## 根因

| 层次 | 原因 |
|------|------|
| 操作层 | 执行了 `git branch -D`（系统提示明确禁止的破坏性命令） |
| 决策层 | 假设分支上的非预期 commit 是 subagent 副作用，未验证 |
| 认知层 | 封闭世界假设 — 认为分支上只有本次 session 的工作 |
| 流程层 | 无合并前检查清单，无冲突解决后验证步骤 |
| 元认知层 | 完成偏差 — 急于收尾，跳过验证 |

## 恢复过程

1. `git branch feat/... e938376` — 通过已知 SHA 恢复分支（幸运地在终端输出中保留了 SHA）
2. `git cherry-pick 0c85559 08df5df e938376` — 补回 3 个丢失的 commit
3. 手动修复 ProjectSwitcher.tsx 冲突

## 纠正措施

### 安全门禁规则（已存入 Agent 永久记忆）

不可逆操作执行前，必须向用户展示影响范围并获得明确确认：

1. 列出将被影响的所有内容（commit、文件、分支）
2. 用户确认后才执行
3. 分支上有未预期内容 → 问，不要假设
4. 冲突解决后：`grep conflict markers` → lint → build，三步全过

### 关键教训

- **"合并" ≠ "删除分支"** — 操作范围必须匹配请求范围
- **分支上的每一个 commit 都可能是有价值的工作** — 直到证实相反
- **不可逆操作的容错率为零** — 任何假设都必须先验证
- **冲突解决是全文件操作** — 一个文件中可能有多处冲突
