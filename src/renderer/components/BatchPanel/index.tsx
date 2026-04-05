import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HexColorPicker } from 'react-colorful';
import { Trash2, FolderInput, Copy, Download, Palette, Star, StarOff, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import { sanitizeSVG } from '../../utils/sanitize';
import { parseCssColor } from '../../utils/svg/colors';
import { message, confirm } from '../ui';
import { allVariantCombinations, buildVariantName } from '../../utils/svg/variants';
import { bakeSvgVariant, buildVariantMeta } from '../../utils/svg/bake';
import db from '../../database';
import useAppStore from '../../store';
import { IconExportDialog } from '../IconExportDialog';
import type { IconExportTarget } from '../IconExportDialog';

const { electronAPI } = window;

function BatchPanel({ selectedGroup }: { selectedGroup: string }) {
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

  const allFavorited = useMemo(() => {
    if (selectedIds.length === 0) return false;
    return selectedIds.every((id: string) => {
      const data = db.getIconData(id);
      return data?.isFavorite === 1;
    });
  }, [selectedIds]);

  const groupList = useMemo(() => db.getGroupList(), []);

  // --- State for sub-panels ---
  const [groupAction, setGroupAction] = useState<'move' | 'copy' | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [batchColor, setBatchColor] = useState('#000000');
  const [colorInputValue, setColorInputValue] = useState('#000000');
  const [colorInputError, setColorInputError] = useState(false);
  const [exportDialogVisible, setExportDialogVisible] = useState(false);

  // --- Operations ---
  const handleMove = useCallback(
    (targetGroup: string) => {
      db.moveIconsWithVariants(selectedIds, targetGroup);
      syncLeft();
      clearBatchSelection();
      message.success(t('batch.moved', { count: selectedIds.length }));
    },
    [selectedIds]
  );

  const handleCopy = useCallback(
    (targetGroup: string) => {
      db.duplicateIcons(selectedIds, targetGroup);
      syncLeft();
      clearBatchSelection();
      message.success(t('batch.copied', { count: selectedIds.length }));
    },
    [selectedIds]
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
      },
    });
  }, [selectedIds]);

  const handleExport = useCallback(() => setExportDialogVisible(true), []);

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
  }, [selectedIds, allFavorited]);

  const handleApplyColor = useCallback(() => {
    db.updateIconsColor(selectedIds, batchColor);
    syncLeft();
    syncIconContent();
    message.success(t('batch.colorApplied', { count: selectedIds.length }));
    setShowColorPicker(false);
  }, [selectedIds, batchColor]);

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
            } catch {
              failed++;
            }
            setVariantProgress({ current: done + failed, total, active: true });
          }

          if (!useAppStore.getState().variantProgress?.active) break;
        }

        setVariantProgress(null);
        syncLeft();
        clearBatchSelection();

        if (failed > 0) {
          message.warning(t('variant.batchFailed', { failed, total }));
        } else {
          message.success(t('variant.generated', { count: done }));
        }
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
          <div className="text-lg font-semibold text-foreground">
            {t('batch.selected', { count: selectedIds.length })}
          </div>
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

        {/* Group selector sub-panel */}
        {groupAction && (
          <div className="mb-4 p-3 rounded-lg border border-border bg-surface-muted">
            <div className="text-sm font-medium mb-2">
              {groupAction === 'move' ? t('batch.moveToLabel') : t('batch.copyToLabel')}:
            </div>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {groupList.map((g: any) => (
                <button
                  key={g.id}
                  className="text-left px-3 py-1.5 rounded text-sm hover:bg-accent-subtle text-foreground"
                  onClick={() => {
                    if (groupAction === 'move') handleMove(g.id);
                    else handleCopy(g.id);
                    setGroupAction(null);
                  }}
                >
                  {g.groupName}
                </button>
              ))}
            </div>
            <button
              className="mt-2 text-xs text-foreground-muted hover:text-foreground"
              onClick={() => setGroupAction(null)}
            >
              {t('common.cancel')}
            </button>
          </div>
        )}

        {/* Color picker sub-panel — matches SideEditor's color editor */}
        {showColorPicker && (
          <div className="mb-4 p-3 rounded-lg border border-border bg-surface-muted">
            <div className="text-sm font-medium mb-2">{t('batch.unifyColor')}</div>
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
          </div>
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
        {!groupAction && !showColorPicker && (
          <div className="flex flex-col gap-2">
            <button className={btnClass} onClick={() => setGroupAction('move')}>
              <FolderInput size={18} className="text-foreground-muted" /> {t('batch.moveTo')}
            </button>
            <button className={btnClass} onClick={() => setGroupAction('copy')}>
              <Copy size={18} className="text-foreground-muted" /> {t('batch.copyTo')}
            </button>
            <button className={btnClass} onClick={handleToggleFavorite}>
              {allFavorited ? (
                <StarOff size={18} className="text-foreground-muted" />
              ) : (
                <Star size={18} className="text-amber-400" />
              )}
              {allFavorited ? t('batch.unfavorite') : t('batch.favorite')}
            </button>
            <button className={btnClass} onClick={handleDelete}>
              <Trash2 size={18} className="text-foreground-muted" /> {t('batch.delete')}
            </button>
            <button className={btnClass} onClick={handleExport}>
              <Download size={18} className="text-foreground-muted" /> {t('batch.exportSvg')}
            </button>
            <button className={btnClass} onClick={() => setShowColorPicker(true)}>
              <Palette size={18} className="text-foreground-muted" /> {t('batch.unifyColor')}
            </button>
            <button className={btnClass} onClick={handleBatchGenerateVariants}>
              <Layers size={18} className="text-foreground-muted" /> {t('variant.batchGenerate')}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 p-4 border-t border-border">
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
    </div>
  );
}

export default BatchPanel;
