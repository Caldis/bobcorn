import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import { Dialog, Button } from '../ui';
import { message } from '../ui/toast';
import { cn } from '../../lib/utils';
import useAppStore from '../../store';
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): project.settings
import db from '../../database';
import { buildCoverageModel, normalizeIconCode } from './codeCoverage';
import CodeMatrix, { LegendSwatch } from '../CodeMatrix';
import type { ReservedRange } from '../CodeMatrix';

// reserved 图例斜纹 (与 CodeMatrix 内 RESERVED_STRIPE 视觉一致)
const RESERVED_STRIPE_STYLE: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(130,130,130,0.38) 0, rgba(130,130,130,0.38) 1.5px, transparent 1.5px, transparent 4px)',
};

interface CodeFixItem {
  id: string;
  iconName: string;
  oldCode: string;
  newCode: string;
  reason: 'duplicate' | 'invalid';
}

/**
 * 项目设置「字码覆盖」。共享 CodeMatrix (display 模式) 渲染网格,
 * 本壳负责数据获取 (db)、汇总统计、撞码/非法一键修复。
 */
function CodeCoverageMatrix() {
  const { t } = useTranslation();
  const [rawCodes, setRawCodes] = useState<string[] | null>(null);
  // 各分组声明的字码区间 (display 模式的 reserved 图层)
  const [groupRanges, setGroupRanges] = useState<ReservedRange[]>([]);
  // 修复预览弹窗: null = 关闭, 数组 = before/after 计划
  const [fixPlan, setFixPlan] = useState<CodeFixItem[] | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [showPuaHelp, setShowPuaHelp] = useState(false);

  // Radix Dialog 关闭即卸载, 挂载时查询一次 = 每次打开对话框自动刷新; 修复后 refreshTick 触发重查
  useEffect(() => {
    try {
      if (!(db as any)?.dbInited) return;
      setRawCodes((db as any).getAllIconCodes());
      const groups: any[] = (db as any).getGroupList() || [];
      setGroupRanges(
        groups
          .filter(
            (g) =>
              g.codeRangeStart !== null &&
              g.codeRangeStart !== undefined &&
              g.codeRangeEnd !== null &&
              g.codeRangeEnd !== undefined
          )
          .map((g) => ({
            id: g.id,
            name: g.groupName,
            start: Number(g.codeRangeStart),
            end: Number(g.codeRangeEnd),
          }))
      );
    } catch {
      /* db 未就绪时整行隐藏 */
    }
  }, [refreshTick]);

  const model = useMemo(() => (rawCodes ? buildCoverageModel(rawCodes) : null), [rawCodes]);

  // 由原始字码派生 CodeMatrix 所需的 Set (已用 / 撞码)
  const { usedCodes, duplicateCodes } = useMemo(() => {
    const used = new Set<number>();
    const occ = new Map<number, number>();
    if (rawCodes) {
      for (const raw of rawCodes) {
        const dec = normalizeIconCode(raw);
        if (dec !== null) {
          used.add(dec);
          occ.set(dec, (occ.get(dec) || 0) + 1);
        }
      }
    }
    const dup = new Set<number>();
    occ.forEach((n, dec) => {
      if (n > 1) dup.add(dec);
    });
    return { usedCodes: used, duplicateCodes: dup };
  }, [rawCodes]);

  const handleOpenFixPlan = useCallback(() => {
    try {
      const plan = (db as any).planIconCodeFixes() as CodeFixItem[];
      if (plan.length) setFixPlan(plan);
    } catch (err) {
      if ((err as Error)?.message === 'PUA_EXHAUSTED') {
        message.error(t('projectSettings.coverageFixExhausted'));
      }
    }
  }, [t]);

  const handleApplyFixes = useCallback(() => {
    if (!fixPlan) return;
    (db as any).applyIconCodeFixes(fixPlan, () => {
      message.success(t('projectSettings.coverageFixDone', { total: fixPlan.length }));
      setFixPlan(null);
      setRefreshTick((n) => n + 1);
      useAppStore.getState().syncLeft();
    });
  }, [fixPlan, t]);

  if (!model) return null;
  const { summary } = model;
  const hasIssues = summary.duplicateCodeCount > 0 || summary.invalidCodeCount > 0;

  return (
    <div className="flex items-start gap-2">
      <span className="relative flex items-center gap-1 t-caption shrink-0 min-w-[4rem] pt-0.5">
        {t('projectSettings.coverage')}
        <HelpCircle
          size={12}
          className="shrink-0 cursor-help text-foreground-muted/40 hover:text-foreground-muted/70 transition-colors"
          onMouseEnter={() => setShowPuaHelp(true)}
          onMouseLeave={() => setShowPuaHelp(false)}
        />
        {showPuaHelp && (
          <div
            className={cn(
              'absolute left-0 top-full mt-1.5 z-50 pointer-events-none',
              'w-[270px] rounded-md px-2.5 py-1.5 shadow-lg',
              'bg-foreground text-surface text-[11px] leading-relaxed whitespace-normal'
            )}
          >
            {t('projectSettings.coveragePuaHelp')}
          </div>
        )}
      </span>
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Summary */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 t-caption">
          <span>
            {t('projectSettings.coverageUsed', {
              used: summary.usedCount,
              total: summary.totalCount,
              percent: summary.usedPercent,
            })}
          </span>
          <span className="text-foreground-muted/30">·</span>
          {summary.nextFreeHex ? (
            <span>
              {t('projectSettings.coverageNextFree')}{' '}
              <span className="font-mono text-foreground">{summary.nextFreeHex}</span>
            </span>
          ) : (
            <span className="text-warning">{t('projectSettings.coverageAllUsed')}</span>
          )}
          <span className="text-foreground-muted/30">·</span>
          <span>
            {t('projectSettings.coverageMaxFreeRun', { length: summary.maxFreeRunLength })}
          </span>
        </div>

        {/* Matrix (共享 CodeMatrix, display 模式) */}
        <CodeMatrix
          mode="display"
          usedCodes={usedCodes}
          duplicateCodes={duplicateCodes}
          reservedRanges={groupRanges}
        />

        {/* Legend */}
        <div className="flex items-center justify-between gap-2 t-pill text-foreground-subtle">
          <div className="flex items-center gap-2.5">
            <LegendSwatch
              cls="h-2.5 w-2.5 rounded-[2px] bg-surface-inset border border-border/60"
              label={t('projectSettings.coverageLegendEmpty')}
            />
            <LegendSwatch
              cls="h-2.5 w-2.5 rounded-[2px] bg-accent/45"
              label={t('projectSettings.coverageLegendPartial')}
            />
            <LegendSwatch
              cls="h-2.5 w-2.5 rounded-[2px] bg-accent"
              label={t('projectSettings.coverageLegendFull')}
            />
            <LegendSwatch
              cls="h-[5px] w-[5px] rounded-full bg-danger"
              label={t('projectSettings.coverageLegendDuplicate')}
            />
            {groupRanges.length > 0 && (
              <span className="flex items-center gap-1">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px] border border-border/40"
                  style={RESERVED_STRIPE_STYLE}
                />
                {t('codeMatrix.legendReserved')}
              </span>
            )}
          </div>
          <span className="flex items-center gap-2 shrink-0">
            {summary.duplicateCodeCount > 0 && (
              <span className="text-danger">
                {t('projectSettings.coverageDuplicateWarning', { num: summary.duplicateCodeCount })}
              </span>
            )}
            {hasIssues && (
              <button
                onClick={handleOpenFixPlan}
                className={cn(
                  'px-1.5 py-px rounded text-[10px] font-medium',
                  'text-danger border border-danger/40',
                  'hover:bg-danger/10 transition-colors duration-100'
                )}
              >
                {t('projectSettings.coverageFixBtn')}
              </button>
            )}
          </span>
        </div>
        {summary.invalidCodeCount > 0 && (
          <div className="text-[10px] text-warning">
            {t('projectSettings.coverageInvalidWarning', { num: summary.invalidCodeCount })}
          </div>
        )}
      </div>

      {/* 修复预览弹窗 — 高信息密度 before/after 列表, 确认后执行 */}
      <Dialog
        open={!!fixPlan}
        onClose={() => setFixPlan(null)}
        title={t('projectSettings.coverageFixTitle')}
        footer={
          <>
            <Button onClick={() => setFixPlan(null)}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={handleApplyFixes}>
              {t('projectSettings.coverageFixConfirm')}
            </Button>
          </>
        }
      >
        {fixPlan && (
          <div className="space-y-2">
            <p className="t-help">
              {t('projectSettings.coverageFixSummary', {
                total: fixPlan.length,
                dup: fixPlan.filter((f) => f.reason === 'duplicate').length,
                invalid: fixPlan.filter((f) => f.reason === 'invalid').length,
              })}
            </p>
            <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border divide-y divide-border/60">
              {fixPlan.map((fix) => (
                <div key={fix.id} className="flex items-center gap-2 px-2.5 py-1 text-xs">
                  <span className="flex-1 min-w-0 truncate text-foreground" title={fix.iconName}>
                    {fix.iconName}
                  </span>
                  <span
                    className={cn(
                      't-pill shrink-0 px-1.5 py-px rounded-full',
                      fix.reason === 'duplicate'
                        ? 'bg-danger/10 text-danger'
                        : 'bg-warning/10 text-warning'
                    )}
                  >
                    {t(
                      fix.reason === 'duplicate'
                        ? 'projectSettings.coverageFixReasonDup'
                        : 'projectSettings.coverageFixReasonInvalid'
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-foreground-muted">
                    {fix.oldCode || '∅'}
                  </span>
                  <span className="shrink-0 text-foreground-muted/40">→</span>
                  <span className="shrink-0 font-mono text-accent">{fix.newCode}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default CodeCoverageMatrix;
