/**
 * Command warning → UI 单点映射层 (Stage C)
 *
 * core 命令体 (src/core/commands) 返回的 CommandWarning DTO 在这里统一换算为
 * 既有 i18n key 的警告 JSX (TriangleAlert + 文案, 形态复刻 SideEditor 的
 * buildGroupPickerWarning / utils/variantGuard 的高亮警告条)。
 *
 * 同一 warning type 在不同操作语境下 key 不同 (variant-follow: 移动→moveNote /
 * 回收→recycleNote; variant-cascade-delete: 删除→deleteConfirm / 替换→replaceWarn),
 * 所以映射签名带语境 ctx。
 *
 * codes-reassigned 不在此映射内 (返回 null): 它是操作后结果而非操作前预警,
 * 组件用 MoveOutcome.reassigned 拼装 toast (batch.movedReassigned)。
 *
 * 只映射、不取词条: 所有文案经组件传入的 t() 走既有 i18n key, 本层不新增 key、
 * 不硬编码文案。
 */
import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { CommandWarning } from '@core/commands';

/** 操作语境 — 决定同一 warning type 映射到哪个既有 i18n key */
export type WarningContext = 'move' | 'recycle' | 'delete' | 'replace' | 'copy';

/** react-i18next TFunction 的结构子集 — 保持本层可被轻量 mock */
type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/** (warning type, ctx) → 既有 i18n key; 无预警语义的 type 返回 null */
function warningKey(type: CommandWarning['type'], ctx: WarningContext): string | null {
  switch (type) {
    case 'variant-follow':
      // 变体跟随父图标 — 移动/回收两种语境
      return ctx === 'recycle' ? 'variant.recycleNote' : 'variant.moveNote';
    case 'variant-cascade-delete':
      // 变体被级联硬删 — 删除/替换两种语境
      return ctx === 'replace' ? 'variant.replaceWarn' : 'variant.deleteConfirm';
    case 'variant-not-copied':
      return 'variant.copyNote';
    case 'codes-reassigned':
      // 操作后结果 (toast 由组件用 Outcome.reassigned 拼装), 非操作前预警
      return null;
  }
}

/**
 * 单条 warning → 高亮警告条 JSX。
 * 形态与 SideEditor.buildGroupPickerWarning 一致 (语义 token, 无硬编码调色板)。
 */
export function warningToNode(w: CommandWarning, ctx: WarningContext, t: TranslateFn): ReactNode {
  const key = warningKey(w.type, ctx);
  if (!key) return null;
  return (
    <p
      key={w.type}
      className="mb-2 flex items-start gap-1.5 rounded-md bg-warning-subtle px-2.5 py-1.5 text-xs font-medium text-warning"
    >
      <TriangleAlert size={13} className="mt-px shrink-0" />
      <span>{t(key, { count: w.count })}</span>
    </p>
  );
}

/** 批量映射 — 过滤掉无预警语义的条目 (如 codes-reassigned) */
export function warningsToNodes(
  warnings: CommandWarning[],
  ctx: WarningContext,
  t: TranslateFn
): ReactNode[] {
  return warnings.map((w) => warningToNode(w, ctx, t)).filter((n) => n !== null);
}
