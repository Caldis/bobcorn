import React, { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Button } from '../ui';
import { message } from '../ui/toast';
import { cn } from '../../lib/utils';
import useAppStore from '../../store';
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): project.settings
import db from '../../database';
import {
  BLOCK_SIZE,
  GRID_COLS,
  CoverageBlock,
  CoverageModel,
  buildCoverageModel,
  partialLevel,
} from './codeCoverage';

interface CodeFixItem {
  id: string;
  iconName: string;
  oldCode: string;
  newCode: string;
  reason: 'duplicate' | 'invalid';
}

// partial 档位 1-4 → accent 透明度梯度 (类名需完整字面量, Tailwind JIT 才能扫描到)
const PARTIAL_CLS = ['bg-accent/25', 'bg-accent/45', 'bg-accent/65', 'bg-accent/85'];

const cellColorCls = (block: CoverageBlock): string => {
  if (block.state === 'empty') return 'bg-surface-inset border-border/60';
  if (block.state === 'full') return 'bg-accent border-transparent';
  return `${PARTIAL_CLS[partialLevel(block.count) - 1]} border-transparent`;
};

interface CellProps {
  block: CoverageBlock;
  hovered: boolean;
  onHover: (index: number | null) => void;
}

const Cell = memo(function Cell({ block, hovered, onHover }: CellProps) {
  const { t } = useTranslation();

  const stateLabel = t(
    block.state === 'empty'
      ? 'projectSettings.coverageStateEmpty'
      : block.state === 'full'
        ? 'projectSettings.coverageStateFull'
        : 'projectSettings.coverageStatePartial'
  );
  const usedLabel = t('projectSettings.coverageBlockUsed', {
    used: block.count,
    size: BLOCK_SIZE,
  });
  const rangeLabel = `${block.startHex} – ${block.endHex}`;

  // 边缘列的 tooltip 分别左/右对齐, 避免越出对话框
  const col = block.index % GRID_COLS;
  const tooltipPosCls =
    col <= 3 ? 'left-0' : col >= GRID_COLS - 4 ? 'right-0' : 'left-1/2 -translate-x-1/2';

  return (
    <div
      className="relative aspect-square cursor-default"
      role="img"
      aria-label={`${rangeLabel} · ${usedLabel} · ${stateLabel}`}
      onMouseEnter={() => onHover(block.index)}
      onMouseLeave={() => onHover(null)}
    >
      <span
        className={cn(
          'absolute inset-0 rounded-[3px] border transition-all duration-100',
          cellColorCls(block),
          hovered && 'scale-[1.35] z-10 shadow-md ring-1 ring-ring/60'
        )}
      />
      {block.hasDuplicates && (
        <span
          className={cn(
            'absolute -top-[2px] -right-[2px] z-20',
            'h-[5px] w-[5px] rounded-full bg-danger ring-1 ring-surface'
          )}
        />
      )}
      {hovered && (
        <div
          className={cn(
            'absolute bottom-full mb-1.5 z-50 pointer-events-none',
            'rounded-md px-2.5 py-1.5 shadow-lg',
            'bg-foreground text-surface whitespace-nowrap',
            tooltipPosCls
          )}
        >
          <div className="font-mono text-[11px] font-medium leading-tight">{rangeLabel}</div>
          <div className="text-[10px] opacity-80 leading-tight mt-0.5">
            {usedLabel}
            <span className="mx-1 opacity-60">·</span>
            {stateLabel}
          </div>
          {block.hasDuplicates && (
            <div className="text-[10px] text-danger leading-tight mt-0.5">
              {t('projectSettings.coverageHasDuplicates')}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function LegendSwatch({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('shrink-0', cls)} />
      {label}
    </span>
  );
}

function CodeCoverageMatrix() {
  const { t } = useTranslation();
  const [model, setModel] = useState<CoverageModel | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  // 修复预览弹窗: null = 关闭, 数组 = before/after 计划
  const [fixPlan, setFixPlan] = useState<CodeFixItem[] | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Radix Dialog 关闭即卸载, 挂载时查询一次 = 每次打开对话框自动刷新; 修复后 refreshTick 触发重查
  useEffect(() => {
    try {
      if (!(db as any)?.dbInited) return;
      setModel(buildCoverageModel((db as any).getAllIconCodes()));
    } catch {
      /* db 未就绪时整行隐藏 */
    }
  }, [refreshTick]);

  const handleHover = useCallback((index: number | null) => setHoveredIndex(index), []);

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
  const { blocks, summary } = model;
  const hasIssues = summary.duplicateCodeCount > 0 || summary.invalidCodeCount > 0;

  return (
    <div className="flex items-start gap-2">
      <span className="text-foreground-muted/50 shrink-0 w-16 text-[12px] pt-0.5">
        {t('projectSettings.coverage')}
      </span>
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Summary */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-foreground-muted">
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

        {/* Matrix */}
        <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-[3px]">
          {blocks.map((block) => (
            <Cell
              key={block.index}
              block={block}
              hovered={hoveredIndex === block.index}
              onHover={handleHover}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between gap-2 text-[10px] text-foreground-muted/60">
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
            <p className="text-xs text-foreground-muted">
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
                      'shrink-0 text-[10px] px-1.5 py-px rounded-full',
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
