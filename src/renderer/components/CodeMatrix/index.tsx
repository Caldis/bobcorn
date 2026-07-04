import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { partialLevel } from '../SideMenu/codeCoverage';
import {
  ZOOM_LEVELS,
  DEFAULT_ZOOM,
  DISPLAY_GRID_COLS,
  decToHex4,
  buildCells,
  selectRange,
  validateRange,
  toCodeSet,
  type MatrixCell,
  type CodeRange,
  type ReservedRange,
  type RangeError,
} from './rangeMath';

export type { CodeRange, ReservedRange } from './rangeMath';

export type MatrixMode = 'display' | 'range-select';

export interface CodeMatrixProps {
  mode: MatrixMode;
  /** 图标已占码位 (十进制)。Set 或数组皆可。 */
  usedCodes: Set<number> | number[];
  /** display 模式撞码高亮 (十进制)。 */
  duplicateCodes?: Set<number>;
  /** 其他分组已声明区间 (range-select 模式渲染为不可选图层)。 */
  reservedRanges?: ReservedRange[];
  /**
   * 本组已有图标的码位 (十进制, 编辑分组时警示用)。range-select 模式下,
   * 属于 ownCodes 但落在当前 value 区间之外的格子渲染琥珀色警示态。
   * 仅 range-select 生效; display 模式忽略此 prop。
   */
  ownCodes?: Set<number>;
  /** 当前选择的区间 (受控)。 */
  value?: CodeRange | null;
  onChange?: (range: CodeRange | null) => void;
  /** 每格码位数 (range-select 受控); 省略则组件内部管理。 */
  zoom?: number;
  onZoomChange?: (z: number) => void;
  /**
   * range-select 模式: 直接输入的校验状态变化回调 (null = 合法)。
   * 供弹窗层在存在行内错误时禁用确认按钮。请传稳定引用 (useCallback)。
   */
  onValidityChange?: (error: RangeError | null) => void;
  className?: string;
}

// partial 档位 1-4 → accent 透明度梯度 (类名需完整字面量, Tailwind JIT 才能扫描到)
const PARTIAL_CLS = ['bg-accent/25', 'bg-accent/45', 'bg-accent/65', 'bg-accent/85'];

const cellColorCls = (cell: MatrixCell): string => {
  if (cell.state === 'empty') return 'bg-surface-inset border-border/60';
  if (cell.state === 'full') return 'bg-accent border-transparent';
  return `${PARTIAL_CLS[partialLevel(cell.count) - 1]} border-transparent`;
};

// reserved 格斜纹 (主题中性灰, 半透明覆盖)
const RESERVED_STRIPE: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(130,130,130,0.38) 0, rgba(130,130,130,0.38) 1.5px, transparent 1.5px, transparent 4px)',
};

// range-select 网格固定格宽 (px), 缩放只改格数不改格宽
const RANGE_CELL_PX = 15;
// range-select 网格固定列数 = 与 display 模式 (项目设置字码覆盖) 完全一致 (20 列)。
// 各档位总格数 (100/200/400/800) 均为 20 的整数倍, 保证任何档位都不会有末行留空。
const RANGE_GRID_COLS = DISPLAY_GRID_COLS;

export function LegendSwatch({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('shrink-0', cls)} />
      {label}
    </span>
  );
}

// t 由父组件下传 (react-i18next 的 t 引用稳定, 不破坏 memo);
// 避免每个 Cell 各自 useTranslation — zoom=1 时 6400 格会产生 6400 个订阅。
type TFn = (key: string, options?: Record<string, unknown>) => string;

interface CellProps {
  cell: MatrixCell;
  mode: MatrixMode;
  hovered: boolean;
  selected: boolean;
  cols: number;
  onHover: (index: number | null) => void;
  t: TFn;
}

const Cell = memo(function Cell({ cell, mode, hovered, selected, cols, onHover, t }: CellProps) {
  const isRangeSelect = mode === 'range-select';
  // reserved 图层现在两种模式都渲染 (display = 项目设置展示分组区间, range-select = 不可选)。
  const reserved = cell.reserved;
  // range-select: reserved 格不可框选 (占用底色); display: 仍显示占用色, reserved 仅叠加斜纹。
  const blockSelect = isRangeSelect && reserved;
  // 本组越界警示 (仅 range-select 编辑分组场景生效, display 模式忽略)。
  const ownOutside = isRangeSelect && cell.ownOutside;

  const stateLabel = t(
    cell.state === 'empty'
      ? 'projectSettings.coverageStateEmpty'
      : cell.state === 'full'
        ? 'projectSettings.coverageStateFull'
        : 'projectSettings.coverageStatePartial'
  );
  const usedLabel = t('projectSettings.coverageBlockUsed', {
    used: cell.count,
    size: cell.cellSize,
  });
  const rangeLabel = `${cell.startHex} – ${cell.endHex}`;
  const ownOutsideLabel = ownOutside ? ` · ${t('codeMatrix.ownOutsideTooltip')}` : '';

  // 边缘列的 tooltip 分别左/右对齐, 避免越出对话框 (仅 display 用)
  const col = cell.index % cols;
  const tooltipPosCls =
    col <= 3 ? 'left-0' : col >= cols - 4 ? 'right-0' : 'left-1/2 -translate-x-1/2';

  const cursorCls = !isRangeSelect
    ? 'cursor-default'
    : blockSelect
      ? 'cursor-not-allowed'
      : 'cursor-pointer';

  // display: 逐格 hover 事件 (与原实现一致); range-select: 事件委托到容器, 仅标记 data-idx
  const interactiveProps = isRangeSelect
    ? { 'data-idx': cell.index }
    : {
        onMouseEnter: () => onHover(cell.index),
        onMouseLeave: () => onHover(null),
      };

  return (
    <div
      className={cn('relative aspect-square', cursorCls)}
      role="img"
      aria-label={`${rangeLabel} · ${usedLabel} · ${stateLabel}${ownOutsideLabel}`}
      {...interactiveProps}
    >
      <span
        className={cn(
          'absolute inset-0 rounded-[3px] border transition-all duration-100',
          blockSelect
            ? 'bg-surface-inset/70 border-border/40'
            : ownOutside
              ? 'bg-warning/80 border-warning/50'
              : cellColorCls(cell),
          hovered && 'scale-[1.35] z-10 shadow-md ring-1 ring-ring/60'
        )}
      />
      {reserved && (
        <span
          className="absolute inset-0 rounded-[3px] z-[5] pointer-events-none"
          style={RESERVED_STRIPE}
        />
      )}
      {isRangeSelect && selected && !reserved && (
        <span className="absolute inset-0 rounded-[3px] z-[6] pointer-events-none bg-accent/25 ring-2 ring-accent ring-inset" />
      )}
      {cell.hasDuplicates && (
        <span
          className={cn(
            'absolute -top-[2px] -right-[2px] z-20',
            'h-[5px] w-[5px] rounded-full bg-danger ring-1 ring-surface'
          )}
        />
      )}
      {!isRangeSelect && hovered && (
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
          {reserved && cell.reservedName && (
            <div className="text-[10px] opacity-80 leading-tight mt-0.5">
              {t('codeMatrix.reservedBy', { name: cell.reservedName })}
            </div>
          )}
          {cell.hasDuplicates && (
            <div className="text-[10px] text-danger leading-tight mt-0.5">
              {t('projectSettings.coverageHasDuplicates')}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const ERROR_KEY: Record<RangeError, string> = {
  format: 'codeMatrix.errorFormat',
  range: 'codeMatrix.errorRange',
  order: 'codeMatrix.errorOrder',
  overlap: 'codeMatrix.errorOverlap',
};

/**
 * 共享字码矩阵。display = 项目设置字码覆盖 (只读, 视觉零回归);
 * range-select = 分组字码区间选择 (缩放 + 拖选吸附 + reserved 图层 + 直接输入)。
 */
function CodeMatrix({
  mode,
  usedCodes,
  duplicateCodes,
  reservedRanges,
  ownCodes,
  value = null,
  onChange,
  zoom,
  onZoomChange,
  onValidityChange,
  className,
}: CodeMatrixProps) {
  const { t } = useTranslation();
  const isRangeSelect = mode === 'range-select';

  const usedSet = useMemo(() => toCodeSet(usedCodes), [usedCodes]);

  // 缩放: display 固定 64; range-select 受控 (zoom/onZoomChange) 或内部管理
  const [internalZoom, setInternalZoom] = useState<number>(DEFAULT_ZOOM);
  const effZoom = !isRangeSelect ? DEFAULT_ZOOM : (zoom ?? internalZoom);
  const setZoom = useCallback(
    (z: number) => {
      if (onZoomChange) onZoomChange(z);
      else setInternalZoom(z);
    },
    [onZoomChange]
  );

  // ownOutside 只在提供 ownCodes 时才需要感知 value 变化; 未提供 ownCodes 时
  // (如 display 模式 / 新建分组弹窗) 恒为 null, 避免拖拽时对 cells 做多余重算。
  const ownOutsideValue = ownCodes ? value : null;

  const cells = useMemo(
    () =>
      buildCells({
        usedCodes: usedSet,
        duplicateCodes,
        // 两种模式都传入 reservedRanges: range-select = 不可选图层; display = 分组区间展示图层。
        reservedRanges,
        ownCodes,
        value: ownOutsideValue,
        zoom: effZoom,
      }),
    [usedSet, duplicateCodes, reservedRanges, ownCodes, ownOutsideValue, effZoom]
  );

  const blockedIdx = useMemo(() => {
    const s = new Set<number>();
    if (isRangeSelect) for (const c of cells) if (c.reserved) s.add(c.index);
    return s;
  }, [cells, isRangeSelect]);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const handleHover = useCallback((i: number | null) => setHoveredIndex(i), []);

  // ── 拖拽框选 (事件委托到容器) ───────────────────────────────
  const anchorRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const dragLastIdxRef = useRef<number | null>(null);

  const cellIndexFromEvent = useCallback((e: React.MouseEvent): number | null => {
    const el = (e.target as HTMLElement).closest?.('[data-idx]') as HTMLElement | null;
    if (!el) return null;
    const raw = el.getAttribute('data-idx');
    return raw == null ? null : Number(raw);
  }, []);

  const handleGridMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const idx = cellIndexFromEvent(e);
      if (idx == null || blockedIdx.has(idx)) return;
      anchorRef.current = idx;
      draggingRef.current = true;
      dragLastIdxRef.current = idx;
      onChange?.(selectRange(idx, idx, effZoom, blockedIdx));
      e.preventDefault();
    },
    [cellIndexFromEvent, blockedIdx, effZoom, onChange]
  );

  const handleGridMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const idx = cellIndexFromEvent(e);
      setHoveredIndex((prev) => (prev === idx ? prev : idx));
      if (
        draggingRef.current &&
        anchorRef.current != null &&
        idx != null &&
        idx !== dragLastIdxRef.current
      ) {
        dragLastIdxRef.current = idx;
        onChange?.(selectRange(anchorRef.current, idx, effZoom, blockedIdx));
      }
    },
    [cellIndexFromEvent, blockedIdx, effZoom, onChange]
  );

  const handleGridMouseLeave = useCallback(() => setHoveredIndex(null), []);

  // 全局 mouseup 结束拖拽 (释放在网格外也生效)
  useEffect(() => {
    if (!isRangeSelect) return;
    const onUp = () => {
      draggingRef.current = false;
      anchorRef.current = null;
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [isRangeSelect]);

  // ── 直接输入 (十六进制起止, 与矩阵双向同步) ─────────────────
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const [rangeError, setRangeError] = useState<RangeError | null>(null);

  useEffect(() => {
    setStartText(value ? decToHex4(value.start) : '');
    setEndText(value ? decToHex4(value.end) : '');
    setRangeError(null);
  }, [value]);

  // 校验状态外抛 (弹窗层据此禁用确认按钮)。用 ref 持有回调, 仅在 rangeError 翻转时触发,
  // 避免父组件传入不稳定引用时的重渲染循环。
  const onValidityChangeRef = useRef(onValidityChange);
  onValidityChangeRef.current = onValidityChange;
  useEffect(() => {
    onValidityChangeRef.current?.(rangeError);
  }, [rangeError]);

  const commitInputs = useCallback(
    (sText: string, eText: string) => {
      if (!sText.trim() || !eText.trim()) {
        // 两个都空 → 清除区间; 只填一个 → 静默等待另一个
        if (!sText.trim() && !eText.trim()) onChange?.(null);
        setRangeError(null);
        return;
      }
      const res = validateRange(sText, eText, reservedRanges ?? []);
      if (res.ok) {
        setRangeError(null);
        onChange?.(res.range);
      } else {
        setRangeError(res.error);
      }
    },
    [onChange, reservedRanges]
  );

  const handleStartChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setStartText(v);
      commitInputs(v, endText);
    },
    [commitInputs, endText]
  );

  const handleEndChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setEndText(v);
      commitInputs(startText, v);
    },
    [commitInputs, startText]
  );

  const handleClear = useCallback(() => {
    setStartText('');
    setEndText('');
    setRangeError(null);
    onChange?.(null);
  }, [onChange]);

  // ── display 模式: 只输出裸网格 (与原 CodeCoverageMatrix 完全一致) ──
  if (!isRangeSelect) {
    return (
      <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-[3px]">
        {cells.map((cell) => (
          <Cell
            key={cell.index}
            cell={cell}
            mode="display"
            hovered={hoveredIndex === cell.index}
            selected={false}
            cols={DISPLAY_GRID_COLS}
            onHover={handleHover}
            t={t}
          />
        ))}
      </div>
    );
  }

  // ── range-select 模式 ────────────────────────────────────
  const hoveredCell = hoveredIndex != null ? cells[hoveredIndex] : null;
  const zoomInput = (
    <span className="flex items-center gap-1">
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded border border-border text-foreground-muted hover:bg-surface-muted disabled:opacity-40"
        disabled={effZoom >= ZOOM_LEVELS[0]}
        title={t('codeMatrix.zoomOut')}
        aria-label={t('codeMatrix.zoomOut')}
        onClick={() => {
          const i = ZOOM_LEVELS.indexOf(effZoom as (typeof ZOOM_LEVELS)[number]);
          if (i > 0) setZoom(ZOOM_LEVELS[i - 1]);
        }}
      >
        <Minus size={13} />
      </button>
      <span className="flex items-center gap-0.5">
        {ZOOM_LEVELS.map((z) => (
          <button
            key={z}
            type="button"
            title={t('codeMatrix.zoomPerCell', { n: z })}
            className={cn(
              'min-w-[26px] rounded px-1 py-0.5 text-[11px] font-mono tabular-nums transition-colors',
              effZoom === z
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground-muted hover:bg-surface-muted'
            )}
            onClick={() => setZoom(z)}
          >
            {z}
          </button>
        ))}
      </span>
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded border border-border text-foreground-muted hover:bg-surface-muted disabled:opacity-40"
        disabled={effZoom <= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
        title={t('codeMatrix.zoomIn')}
        aria-label={t('codeMatrix.zoomIn')}
        onClick={() => {
          const i = ZOOM_LEVELS.indexOf(effZoom as (typeof ZOOM_LEVELS)[number]);
          if (i < ZOOM_LEVELS.length - 1) setZoom(ZOOM_LEVELS[i + 1]);
        }}
      >
        <Plus size={13} />
      </button>
    </span>
  );

  const hexInput = (
    v: string,
    onCh: (e: React.ChangeEvent<HTMLInputElement>) => void,
    ph: string,
    testId: string
  ) => (
    <input
      type="text"
      spellCheck={false}
      maxLength={4}
      value={v}
      onChange={onCh}
      placeholder={ph}
      data-testid={testId}
      className={cn(
        'w-[68px] h-7 px-2 rounded-md border bg-surface text-sm font-mono uppercase text-foreground',
        'placeholder:text-foreground-muted/40 outline-none transition-colors',
        'focus:border-accent focus:ring-2 focus:ring-ring/30',
        rangeError ? 'border-danger/60' : 'border-border'
      )}
    />
  );

  return (
    <div className={cn('space-y-2', className)}>
      {/* 控件行: 缩放 + 直接输入 + 清除 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
          <span className="shrink-0">{t('codeMatrix.zoomLabel')}</span>
          {zoomInput}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
          {hexInput(startText, handleStartChange, t('codeMatrix.rangeStart'), 'code-range-start')}
          <span className="text-foreground-muted/50">–</span>
          {hexInput(endText, handleEndChange, t('codeMatrix.rangeEnd'), 'code-range-end')}
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded px-1.5 py-0.5 text-[11px] text-foreground-muted hover:bg-surface-muted"
            >
              {t('codeMatrix.rangeClear')}
            </button>
          )}
        </span>
      </div>

      {rangeError && <div className="text-[11px] text-danger">{t(ERROR_KEY[rangeError])}</div>}

      {/* 网格 (滚动容器) */}
      <div className="max-h-[280px] overflow-auto rounded-md border border-border/60 bg-surface-inset/30 p-1.5">
        <div
          className="grid gap-[2px] select-none"
          style={{ gridTemplateColumns: `repeat(${RANGE_GRID_COLS}, ${RANGE_CELL_PX}px)` }}
          onMouseDown={handleGridMouseDown}
          onMouseMove={handleGridMouseMove}
          onMouseLeave={handleGridMouseLeave}
        >
          {cells.map((cell) => (
            <Cell
              key={cell.index}
              cell={cell}
              mode="range-select"
              hovered={hoveredIndex === cell.index}
              selected={!!value && cell.endDec >= value.start && cell.startDec <= value.end}
              cols={RANGE_GRID_COLS}
              onHover={handleHover}
              t={t}
            />
          ))}
        </div>
      </div>

      {/* 状态行: hover 明细 或 当前选区 或 提示 */}
      <div className="min-h-[16px] text-[11px] text-foreground-muted">
        {hoveredCell ? (
          <span>
            <span className="font-mono text-foreground">
              {hoveredCell.startHex} – {hoveredCell.endHex}
            </span>
            <span className="mx-1.5 opacity-40">·</span>
            {t('projectSettings.coverageBlockUsed', {
              used: hoveredCell.count,
              size: hoveredCell.cellSize,
            })}
            {hoveredCell.reserved && hoveredCell.reservedName && (
              <>
                <span className="mx-1.5 opacity-40">·</span>
                <span className="text-foreground-muted">
                  {t('codeMatrix.reservedBy', { name: hoveredCell.reservedName })}
                </span>
              </>
            )}
            {hoveredCell.ownOutside && (
              <>
                <span className="mx-1.5 opacity-40">·</span>
                <span className="text-warning">{t('codeMatrix.ownOutsideTooltip')}</span>
              </>
            )}
          </span>
        ) : value ? (
          <span>
            {t('codeMatrix.rangeSelectedInfo', {
              start: decToHex4(value.start),
              end: decToHex4(value.end),
              count: value.end - value.start + 1,
            })}
          </span>
        ) : (
          <span className="text-foreground-muted/60">{t('codeMatrix.rangeHint')}</span>
        )}
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-foreground-muted/60">
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
        <span className="flex items-center gap-1">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-[2px] border border-border/40"
            style={RESERVED_STRIPE}
          />
          {t('codeMatrix.legendReserved')}
        </span>
        <LegendSwatch
          cls="h-2.5 w-2.5 rounded-[2px] bg-accent/25 ring-2 ring-accent ring-inset"
          label={t('codeMatrix.legendSelected')}
        />
        {cells.some((c) => c.ownOutside) && (
          <LegendSwatch
            cls="h-2.5 w-2.5 rounded-[2px] bg-warning/80"
            label={t('codeMatrix.legendOwnOutside')}
          />
        )}
      </div>
    </div>
  );
}

export default CodeMatrix;
