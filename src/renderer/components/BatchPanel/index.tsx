import React, { useCallback, useMemo, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Trash2, FolderInput, Copy, Download, Palette } from 'lucide-react';
import { cn } from '../../lib/utils';
import { sanitizeSVG } from '../../utils/sanitize';
import { parseCssColor } from '../../utils/svg/colors';
import { message, confirm } from '../ui';
import db from '../../database';
import useAppStore from '../../store';

const { electronAPI } = window;

function BatchPanel({ selectedGroup }: { selectedGroup: string }) {
  const selectedIcons = useAppStore((state: any) => state.selectedIcons);
  const clearBatchSelection = useAppStore((state: any) => state.clearBatchSelection);
  const syncLeft = useAppStore((state: any) => state.syncLeft);
  const syncIconContent = useAppStore((state: any) => state.syncIconContent);

  const selectedIds = useMemo(() => Array.from(selectedIcons) as string[], [selectedIcons]);

  const iconPreviews = useMemo(() => {
    return selectedIds.slice(0, 9).map((id: string) => {
      const data = db.getIconData(id);
      return { id, content: data?.iconContent || '' };
    });
  }, [selectedIds]);

  const groupList = useMemo(() => db.getGroupList(), []);

  // --- State for sub-panels ---
  const [groupAction, setGroupAction] = useState<'move' | 'copy' | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [batchColor, setBatchColor] = useState('#000000');
  const [colorInputValue, setColorInputValue] = useState('#000000');
  const [colorInputError, setColorInputError] = useState(false);

  // --- Operations ---
  const handleMove = useCallback(
    (targetGroup: string) => {
      db.moveIcons(selectedIds, targetGroup);
      syncLeft();
      clearBatchSelection();
      message.success(`已移动 ${selectedIds.length} 个图标`);
    },
    [selectedIds]
  );

  const handleCopy = useCallback(
    (targetGroup: string) => {
      db.duplicateIcons(selectedIds, targetGroup);
      syncLeft();
      clearBatchSelection();
      message.success(`已复制 ${selectedIds.length} 个图标`);
    },
    [selectedIds]
  );

  const handleDelete = useCallback(() => {
    confirm({
      title: '批量删除',
      content: `确定要将 ${selectedIds.length} 个图标移入回收站吗？`,
      okText: '删除',
      onOk() {
        db.moveIcons(selectedIds, 'resource-recycleBin');
        syncLeft();
        clearBatchSelection();
        message.success(`已删除 ${selectedIds.length} 个图标`);
      },
    });
  }, [selectedIds]);

  const handleExport = useCallback(async () => {
    const result = await electronAPI.showSaveDialog({
      title: '选择导出目录',
      properties: ['openDirectory'],
    });
    if (!result || result.canceled) return;
    const dirPath = result.filePath || (result as any).filePaths?.[0];
    if (!dirPath) return;

    selectedIds.forEach((id: string) => {
      const data = db.getIconData(id);
      if (data) {
        electronAPI.writeFileSync(`${dirPath}/${data.iconName}.svg`, data.iconContent);
      }
    });
    message.success(`已导出 ${selectedIds.length} 个图标`);
  }, [selectedIds]);

  const handleApplyColor = useCallback(() => {
    db.updateIconsColor(selectedIds, batchColor);
    syncLeft();
    syncIconContent();
    message.success(`已统一 ${selectedIds.length} 个图标颜色`);
    setShowColorPicker(false);
  }, [selectedIds, batchColor]);

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
    'hover:bg-surface-accent dark:hover:bg-white/5 transition-colors'
  );

  return (
    <div
      className={cn(
        'relative w-full h-full flex flex-col',
        'border-l border-border',
        'bg-surface dark:bg-surface'
      )}
    >
      {/* Win32 title bar spacer */}
      <div className="h-[32px] shrink-0 [-webkit-app-region:drag]" />

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Header */}
        <div className="text-center py-4">
          <div className="text-lg font-semibold text-foreground">
            已选中 {selectedIds.length} 个图标
          </div>
        </div>

        {/* Thumbnail preview */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {iconPreviews.map((icon) => (
            <div
              key={icon.id}
              className={cn(
                'aspect-square rounded-lg',
                'bg-surface-muted dark:bg-surface-muted',
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
                'bg-surface-muted dark:bg-surface-muted',
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
          <div className="mb-4 p-3 rounded-lg border border-border bg-surface-muted dark:bg-surface-muted">
            <div className="text-sm font-medium mb-2">
              {groupAction === 'move' ? '移动到' : '复制到'}:
            </div>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {groupList.map((g: any) => (
                <button
                  key={g.id}
                  className="text-left px-3 py-1.5 rounded text-sm hover:bg-brand-50 dark:hover:bg-brand-950/40 text-foreground"
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
              取消
            </button>
          </div>
        )}

        {/* Color picker sub-panel — matches SideEditor's color editor */}
        {showColorPicker && (
          <div className="mb-4 p-3 rounded-lg border border-border bg-surface-muted dark:bg-surface-muted">
            <div className="text-sm font-medium mb-2">统一颜色</div>
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
                  'bg-surface dark:bg-surface',
                  'border transition-colors duration-150',
                  'outline-none focus:ring-1',
                  colorInputError
                    ? 'border-red-400 focus:ring-red-300'
                    : 'border-border focus:ring-brand-300 dark:focus:ring-brand-700',
                  'text-foreground dark:text-foreground',
                  'placeholder:text-foreground-muted/50'
                )}
              />
              {/* 取色器按钮 */}
              <button
                title="从屏幕取色"
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
                className="flex-1 px-3 py-1.5 rounded bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 transition-colors"
                onClick={handleApplyColor}
              >
                应用到全部
              </button>
              <button
                className="px-3 py-1.5 rounded border border-border text-xs text-foreground-muted hover:text-foreground hover:bg-surface-accent transition-colors"
                onClick={() => setShowColorPicker(false)}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Operation buttons */}
        {!groupAction && !showColorPicker && (
          <div className="flex flex-col gap-2">
            <button className={btnClass} onClick={() => setGroupAction('move')}>
              <FolderInput size={18} className="text-foreground-muted" /> 移动到分组
            </button>
            <button className={btnClass} onClick={() => setGroupAction('copy')}>
              <Copy size={18} className="text-foreground-muted" /> 复制到分组
            </button>
            <button className={btnClass} onClick={handleDelete}>
              <Trash2 size={18} className="text-foreground-muted" /> 删除
            </button>
            <button className={btnClass} onClick={handleExport}>
              <Download size={18} className="text-foreground-muted" /> 导出 SVG
            </button>
            <button className={btnClass} onClick={() => setShowColorPicker(true)}>
              <Palette size={18} className="text-foreground-muted" /> 统一颜色
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
          取消选择
        </button>
      </div>
    </div>
  );
}

export default BatchPanel;
