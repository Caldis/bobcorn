import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { HexColorPicker } from 'react-colorful';
import {
  Trash2,
  FolderInput,
  Copy,
  Download,
  Palette,
  Star,
  StarOff,
  StarHalf,
  Layers,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { sanitizeSVG } from '../../utils/sanitize';
import { parseCssColor } from '../../utils/svg/colors';
import { message, confirm } from '../ui';
import { allVariantCombinations, buildVariantName } from '../../utils/svg/variants';
import { bakeSvgVariant, buildVariantMeta } from '../../utils/svg/bake';
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): icon.move, icon.copy, icon.delete, icon.set-color, group.move-icons
import db from '../../database';
import useAppStore, { analyticsTrack } from '../../store';
import { IconExportDialog } from '../IconExportDialog';
import type { IconExportTarget } from '../IconExportDialog';
import { GroupPickerDialog } from '../GroupPickerDialog';
import type { GroupPickerGroup } from '../GroupPickerDialog';
import { parseHex } from '../CodeMatrix/rangeMath';

const { electronAPI } = window;

function BatchPanel({ selectedGroup: _selectedGroup }: { selectedGroup: string }) {
  const { t } = useTranslation();
  const selectedIcons = useAppStore((state: any) => state.selectedIcons);
  const clearBatchSelection = useAppStore((state: any) => state.clearBatchSelection);
  const syncLeft = useAppStore((state: any) => state.syncLeft);
  const syncIconContent = useAppStore((state: any) => state.syncIconContent);

  const variantProgress = useAppStore((s: any) => s.variantProgress);

  const selectedIds = useMemo(() => Array.from(selectedIcons) as string[], [selectedIcons]);

  const iconPreviews = useMemo(() => {
    return selectedIds.slice(0, 9).map((id: string) => {
      const data = db.getIconData(id);
      return { id, content: data?.iconContent || '' };
    });
  }, [selectedIds]);

  // 收藏状态统计 —— 依赖 [selectedIds, groupData] 而非仅 [selectedIds]：
  // groupData 由 syncLeft() 更新，而所有收藏切换路径（本面板的 handleToggleFavorite、
  // IconBlock 单个图标的收藏切换）都会调用 syncLeft()，因此把 groupData 纳入依赖即可让
  // 收藏统计在“面板开着时收藏状态被改变”后也能实时刷新（bug 修复）。
  // 注：Zustand store 目前并没有按 groupId 存放 IconItem[] 的 `iconData` record——那其实是
  // IconGridLocal 组件内部的本地 state（且该文件本次不允许改动），因此无法采用“从 store.iconData
  // 派生”的方案 (a)；这里改为复用已存在的 groupData 作为响应式刷新信号，配合 db.getIconData()
  // 实时读取，效果上覆盖了 (a)/(b) 两种方案的诉求，且不新增 local counter。
  const groupData = useAppStore((state: any) => state.groupData);
  const favStats = useMemo(() => {
    const total = selectedIds.length;
    if (total === 0) return { total: 0, favCount: 0 };
    const favCount = selectedIds.reduce((count: number, id: string) => {
      const data = db.getIconData(id);
      return data?.isFavorite === 1 ? count + 1 : count;
    }, 0);
    return { total, favCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- groupData intentionally used as a refresh signal only (not read in the callback), see comment above
  }, [selectedIds, groupData]);
  const allFavorited = favStats.total > 0 && favStats.favCount === favStats.total;
  const partiallyFavorited = favStats.favCount > 0 && favStats.favCount < favStats.total;

  const groupList = useMemo(() => db.getGroupList(), []);
  const groupPickerGroups: GroupPickerGroup[] = useMemo(
    () => groupList.map((g: any) => ({ id: g.id, groupName: g.groupName, groupIcon: g.groupIcon })),
    [groupList]
  );

  // 目标分组区间 + 待移动图标码位 → 移动越界内联选择
  const groupRangeById = useMemo(() => {
    const m = new Map<string, { start: number; end: number }>();
    for (const g of groupList as any[]) {
      if (g.codeRangeStart != null && g.codeRangeEnd != null) {
        m.set(g.id, { start: Number(g.codeRangeStart), end: Number(g.codeRangeEnd) });
      }
    }
    return m;
  }, [groupList]);
  const pendingCodesDec = useMemo(() => {
    const out: number[] = [];
    for (const id of selectedIds) {
      const d = db.getIconData(id);
      const dec = parseHex(String(d?.iconCode ?? ''));
      if (dec !== null) out.push(dec);
    }
    return out;
  }, [selectedIds]);
  const getMoveOutOfRangeCount = useCallback(
    (targetGroupId: string): number => {
      const r = groupRangeById.get(targetGroupId);
      if (!r) return 0;
      return pendingCodesDec.filter((c) => c < r.start || c > r.end).length;
    },
    [groupRangeById, pendingCodesDec]
  );

  // --- State for sub-panels ---
  const [groupPickerMode, setGroupPickerMode] = useState<'move' | 'copy' | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [batchColor, setBatchColor] = useState('#000000');
  const [colorInputValue, setColorInputValue] = useState('#000000');
  const [colorInputError, setColorInputError] = useState(false);
  const [exportDialogVisible, setExportDialogVisible] = useState(false);
  // 取色器弹窗定位 —— 面板经 portal 渲染到 document.body，用 fixed 定位紧邻触发按钮，
  // 避免像之前那样以 inline 方式插入滚动内容流，导致弹窗出现的位置与点击的按钮相距很远
  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  const [colorPickerPos, setColorPickerPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // --- Operations ---
  const handleMove = useCallback(
    (targetGroup: string, opts?: { reassignOutOfRange: boolean }) => {
      db.moveIconsWithVariants(
        selectedIds,
        targetGroup,
        (reassignedCount) => {
          syncLeft();
          clearBatchSelection();
          if (reassignedCount && reassignedCount > 0) {
            message.success(
              t('batch.movedReassigned', {
                count: selectedIds.length,
                reassigned: reassignedCount,
              })
            );
          } else {
            message.success(t('batch.moved', { count: selectedIds.length }));
          }
          analyticsTrack('batch.operation', { operation: 'move' });
        },
        opts
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` intentionally omitted: only recreated on language switch, adding it would needlessly recreate this callback then; clearBatchSelection/syncLeft are stable store references
    [selectedIds, clearBatchSelection, syncLeft]
  );

  const handleCopy = useCallback(
    (targetGroup: string) => {
      db.duplicateIcons(selectedIds, targetGroup, (result) => {
        syncLeft();
        clearBatchSelection();
        if (result && result.failed > 0) {
          message.warning(
            t('batch.copyCodeExhausted', { added: result.added, failed: result.failed })
          );
        } else {
          message.success(t('batch.copied', { count: selectedIds.length }));
        }
        analyticsTrack('batch.operation', { operation: 'copy' });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` intentionally omitted (see handleMove above); clearBatchSelection/syncLeft are stable store references
    [selectedIds, clearBatchSelection, syncLeft]
  );

  const handleGroupPickerConfirm = useCallback(
    (targetGroupId: string, opts?: { reassignOutOfRange: boolean }) => {
      if (groupPickerMode === 'move') handleMove(targetGroupId, opts);
      else if (groupPickerMode === 'copy') handleCopy(targetGroupId);
      setGroupPickerMode(null);
    },
    [groupPickerMode, handleMove, handleCopy]
  );

  const handleDelete = useCallback(() => {
    confirm({
      title: t('batch.deleteTitle'),
      content: t('batch.deleteConfirm', { count: selectedIds.length }),
      okText: t('batch.deleteOk'),
      onOk() {
        db.moveIconsWithVariants(selectedIds, 'resource-recycleBin');
        syncLeft();
        clearBatchSelection();
        message.success(t('batch.deleted', { count: selectedIds.length }));
        analyticsTrack('batch.operation', { operation: 'delete' });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` intentionally omitted (see handleMove above); clearBatchSelection/syncLeft are stable store references
  }, [selectedIds, clearBatchSelection, syncLeft]);

  const handleExport = useCallback(() => {
    setExportDialogVisible(true);
    analyticsTrack('batch.operation', { operation: 'export' });
  }, []);

  const exportIcons: IconExportTarget[] = useMemo(
    () =>
      selectedIds
        .map((id: string) => {
          const data = db.getIconData(id);
          return data ? { id, iconName: data.iconName, iconContent: data.iconContent } : null;
        })
        .filter(Boolean) as IconExportTarget[],
    [selectedIds]
  );

  const handleToggleFavorite = useCallback(() => {
    const newValue = allFavorited ? 0 : 1;
    db.setIconsFavorite(selectedIds, newValue);
    syncLeft();
    message.success(
      newValue === 1
        ? t('batch.favorited', { count: selectedIds.length })
        : t('batch.unfavorited', { count: selectedIds.length })
    );
    analyticsTrack('batch.operation', { operation: 'favorite' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` intentionally omitted (see handleMove above); syncLeft is a stable store reference
  }, [selectedIds, allFavorited, syncLeft]);

  // 打开取色器 —— 在隐藏触发按钮之前，先同步读取其屏幕位置，用于定位 portal 面板
  // （下方优先展示，空间不足时翻转到上方，并 clamp 在视口内，避免超出可视区）
  const handleOpenColorPicker = useCallback(() => {
    const el = colorTriggerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const gap = 6;
      const estimatedHeight = 300;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const placeAbove = spaceBelow < estimatedHeight + gap && spaceAbove >= estimatedHeight + gap;
      let top = placeAbove ? rect.top - estimatedHeight - gap : rect.bottom + gap;
      top = Math.min(Math.max(top, gap), Math.max(gap, window.innerHeight - estimatedHeight - gap));
      const maxLeft = window.innerWidth - rect.width - gap;
      const left = Math.min(Math.max(rect.left, gap), Math.max(gap, maxLeft));
      setColorPickerPos({ top, left, width: rect.width });
    }
    setShowColorPicker(true);
  }, []);

  const handleApplyColor = useCallback(() => {
    db.updateIconsColor(selectedIds, batchColor);
    syncLeft();
    syncIconContent();
    message.success(t('batch.colorApplied', { count: selectedIds.length }));
    setShowColorPicker(false);
    analyticsTrack('batch.operation', { operation: 'unifyColor' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` intentionally omitted (see handleMove above); syncIconContent/syncLeft are stable store references
  }, [selectedIds, batchColor, syncIconContent, syncLeft]);

  const handleBatchGenerateVariants = useCallback(async () => {
    const combos = allVariantCombinations();
    const total = selectedIds.length * combos.length;

    confirm({
      title: t('variant.batchGenerate'),
      content: t('variant.batchConfirm', {
        icons: selectedIds.length,
        variants: total,
      }),
      onOk: async () => {
        const setVariantProgress = useAppStore.getState().setVariantProgress;
        setVariantProgress({ current: 0, total, active: true });
        let done = 0;
        let failed = 0;
        let codeExhausted = false;

        for (const iconId of selectedIds) {
          const iconData = db.getIconData(iconId);
          if (!iconData || db.isVariant(iconId)) continue;

          for (const { weight, scale } of combos) {
            const state = useAppStore.getState();
            if (!state.variantProgress?.active) break;

            if (db.hasVariant(iconId, weight.key, scale.key)) {
              done++;
              continue;
            }

            try {
              const svg = await bakeSvgVariant(iconData.iconContent, weight, scale);
              const name = buildVariantName(iconData.iconName, weight, scale);
              const meta = buildVariantMeta(weight, scale);
              db.addVariant(iconId, svg, name, meta);
              done++;
            } catch (err) {
              failed++;
              if ((err as Error)?.message === 'PUA_EXHAUSTED') {
                // 码点用尽, 后续生成必然全部失败, 提前终止
                codeExhausted = true;
                break;
              }
            }
            setVariantProgress({ current: done + failed, total, active: true });
          }

          if (codeExhausted) break;
          if (!useAppStore.getState().variantProgress?.active) break;
        }

        setVariantProgress(null);
        syncLeft();
        clearBatchSelection();

        if (codeExhausted) {
          message.error(t('variant.codeExhausted'));
        } else if (failed > 0) {
          message.warning(t('variant.batchFailed', { failed, total }));
        } else {
          message.success(t('variant.generated', { count: done }));
        }
        analyticsTrack('batch.operation', { operation: 'generateVariants' });
      },
    });
  }, [selectedIds, syncLeft, clearBatchSelection, t]);

  // Sync HexColorPicker changes to both state and input
  const handlePickerChange = useCallback((color: string) => {
    setBatchColor(color);
    setColorInputValue(color);
    setColorInputError(false);
  }, []);

  // Confirm text input — supports hex/rgb/hsl/hwb
  const handleColorInputConfirm = useCallback(() => {
    const parsed = parseCssColor(colorInputValue);
    if (parsed) {
      setBatchColor(parsed);
      setColorInputValue(parsed);
      setColorInputError(false);
    } else {
      setColorInputError(true);
    }
  }, [colorInputValue]);

  // Eye dropper
  const handleEyeDropper = useCallback(async () => {
    try {
      const color = await electronAPI.pickScreenColor();
      if (color) {
        setBatchColor(color);
        setColorInputValue(color);
        setColorInputError(false);
      }
    } catch {
      // picker cancelled or unavailable
    }
  }, []);

  const btnClass = cn(
    'flex items-center gap-3 w-full px-4 py-3 rounded-lg',
    'text-sm font-medium text-foreground',
    'hover:bg-surface-accent transition-colors'
  );

  return (
    <div
      className={cn('relative w-full h-full flex flex-col', 'border-l border-border', 'bg-surface')}
    >
      {/* Win32 title bar spacer */}
      <div className="h-[32px] shrink-0 [-webkit-app-region:drag]" />

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Header */}
        <div className="text-center py-4">
          <div className="t-title">{t('batch.selected', { count: selectedIds.length })}</div>
        </div>

        {/* Thumbnail preview */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {iconPreviews.map((icon) => (
            <div
              key={icon.id}
              className={cn(
                'aspect-square rounded-lg',
                'bg-surface-muted',
                'flex items-center justify-center p-2',
                '[&>svg]:w-full [&>svg]:h-full'
              )}
              dangerouslySetInnerHTML={{ __html: sanitizeSVG(icon.content) }}
            />
          ))}
          {selectedIds.length > 9 && (
            <div
              className={cn(
                'aspect-square rounded-lg',
                'bg-surface-muted',
                'flex items-center justify-center',
                'text-sm text-foreground-muted font-medium'
              )}
            >
              +{selectedIds.length - 9}
            </div>
          )}
        </div>

        {/* Color picker sub-panel — matches SideEditor's color editor;
            经 portal 渲染到 document.body 并用 fixed 定位紧邻触发按钮 */}
        {showColorPicker &&
          colorPickerPos &&
          createPortal(
            <div
              style={{
                position: 'fixed',
                top: colorPickerPos.top,
                left: colorPickerPos.left,
                width: colorPickerPos.width,
              }}
              className="z-50 p-3 rounded-lg border border-border bg-surface-muted shadow-lg"
            >
              <div className="t-label mb-2">{t('batch.unifyColor')}</div>
              <HexColorPicker
                color={batchColor}
                onChange={handlePickerChange}
                style={{ width: '100%', height: 140 }}
              />
              <div className="mt-2 flex gap-1.5 items-center">
                <input
                  type="text"
                  value={colorInputValue}
                  onChange={(e) => {
                    setColorInputValue(e.target.value);
                    setColorInputError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleColorInputConfirm();
                  }}
                  onBlur={handleColorInputConfirm}
                  placeholder="hex / rgb / hsl / hwb"
                  className={cn(
                    'flex-1 min-w-0 px-2 py-1 rounded text-xs font-mono',
                    'bg-surface',
                    'border transition-colors duration-150',
                    'outline-none focus:ring-1',
                    colorInputError
                      ? 'border-danger focus:ring-danger/30'
                      : 'border-border focus:ring-ring/30',
                    'text-foreground',
                    'placeholder:text-foreground-muted/50'
                  )}
                />
                {/* 取色器按钮 */}
                <button
                  title={t('editor.eyeDropper')}
                  onClick={handleEyeDropper}
                  className={cn(
                    'w-7 h-7 rounded border border-border shrink-0',
                    'flex items-center justify-center',
                    'bg-surface hover:bg-surface-accent',
                    'transition-colors duration-150',
                    'text-foreground-muted hover:text-foreground',
                    'cursor-pointer'
                  )}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m2 22 1-1h3l9-9" />
                    <path d="M3 21v-3l9-9" />
                    <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3L15 6" />
                  </svg>
                </button>
                {/* 颜色预览色块 */}
                <div
                  className="w-7 h-7 rounded border border-border shrink-0"
                  style={{ backgroundColor: colorInputValue }}
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="flex-1 px-3 py-1.5 rounded bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/90 transition-colors"
                  onClick={handleApplyColor}
                >
                  {t('batch.applyToAll')}
                </button>
                <button
                  className="px-3 py-1.5 rounded border border-border text-xs text-foreground-muted hover:text-foreground hover:bg-surface-accent transition-colors"
                  onClick={() => setShowColorPicker(false)}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>,
            document.body
          )}

        {/* Variant generation progress bar */}
        {variantProgress && (
          <div className="w-full px-4 py-2">
            <div className="flex justify-between text-[10px] text-foreground-muted mb-1">
              <span>
                {t('variant.progress', {
                  current: variantProgress.current,
                  total: variantProgress.total,
                })}
              </span>
            </div>
            <div className="w-full bg-surface-muted rounded-full h-1.5">
              <div
                className="bg-accent h-1.5 rounded-full transition-all duration-200"
                style={{ width: `${(variantProgress.current / variantProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Operation buttons */}
        {!showColorPicker && (
          <div className="flex flex-col gap-2">
            <button className={btnClass} onClick={() => setGroupPickerMode('move')}>
              <FolderInput size={18} className="text-foreground-muted" /> {t('batch.moveTo')}
            </button>
            <button className={btnClass} onClick={() => setGroupPickerMode('copy')}>
              <Copy size={18} className="text-foreground-muted" /> {t('batch.copyTo')}
            </button>
            <button className={btnClass} onClick={handleToggleFavorite}>
              {allFavorited ? (
                <StarOff size={18} className="text-foreground-muted" />
              ) : partiallyFavorited ? (
                <StarHalf size={18} className="text-foreground-muted" />
              ) : (
                <Star size={18} className="text-foreground-muted" />
              )}
              {allFavorited
                ? t('batch.unfavorite')
                : partiallyFavorited
                  ? t('batch.favoritePartial', { fav: favStats.favCount, total: favStats.total })
                  : t('batch.favorite')}
            </button>
            <button className={btnClass} onClick={handleDelete}>
              <Trash2 size={18} className="text-foreground-muted" /> {t('batch.delete')}
            </button>
            <button className={btnClass} onClick={handleExport}>
              <Download size={18} className="text-foreground-muted" />{' '}
              {t('iconExport.exportIconFiles')}
            </button>
            <button ref={colorTriggerRef} className={btnClass} onClick={handleOpenColorPicker}>
              <Palette size={18} className="text-foreground-muted" /> {t('batch.unifyColor')}
            </button>
            <button className={btnClass} onClick={handleBatchGenerateVariants}>
              <Layers size={18} className="text-foreground-muted" /> {t('variant.batchGenerate')}
              <span className="ml-1.5 t-pill normal-case tracking-normal text-accent opacity-80">
                beta
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Footer — 与中间主区域底部 IconToolbar 采用相同的 h-[49px] + pb-1 节奏
          (border-t + 固定高度 + flex items-center 居中内容), 使取消按钮的底边
          与主区域内容区的底边保持视觉平齐, 而不是像之前的 p-4 那样自成一套间距 */}
      <div className="shrink-0 h-[49px] px-4 pb-1 border-t border-border flex items-center">
        <button
          className="w-full py-2 rounded-lg text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-surface-accent transition-colors"
          onClick={clearBatchSelection}
        >
          {t('batch.cancelSelection')}
        </button>
      </div>

      <IconExportDialog
        visible={exportDialogVisible}
        onClose={() => setExportDialogVisible(false)}
        icons={exportIcons}
      />

      <GroupPickerDialog
        open={groupPickerMode !== null}
        onOpenChange={(open) => !open && setGroupPickerMode(null)}
        mode={groupPickerMode ?? 'move'}
        groups={groupPickerGroups}
        title={
          groupPickerMode === 'copy'
            ? t('batch.copyToTitle', { count: selectedIds.length })
            : t('batch.moveToTitle', { count: selectedIds.length })
        }
        getOutOfRangeCount={getMoveOutOfRangeCount}
        onConfirm={handleGroupPickerConfirm}
      />
    </div>
  );
}

export default BatchPanel;
