import React, { useCallback, useMemo, useState } from 'react';
import { Trash2, FolderInput, Copy, Download, Palette } from 'lucide-react';
import { cn } from '../../lib/utils';
import { sanitizeSVG } from '../../utils/sanitize';
import { message, confirm } from '../ui';
import db from '../../database';
import useAppStore from '../../store';

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
    const { electronAPI } = window as any;
    const result = await electronAPI.showSaveDialog({
      title: '选择导出目录',
      properties: ['openDirectory'],
    });
    if (!result || result.canceled) return;
    const dirPath = result.filePath || result.filePaths?.[0];
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

        {/* Color picker sub-panel */}
        {showColorPicker && (
          <div className="mb-4 p-3 rounded-lg border border-border bg-surface-muted dark:bg-surface-muted">
            <div className="text-sm font-medium mb-2">统一颜色:</div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={batchColor}
                onChange={(e) => setBatchColor(e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border-0"
              />
              <input
                type="text"
                value={batchColor}
                onChange={(e) => setBatchColor(e.target.value)}
                className="flex-1 px-2 py-1 rounded border border-border bg-surface text-sm font-mono"
              />
              <button
                className="px-3 py-1 rounded bg-brand-500 text-white text-sm font-medium hover:bg-brand-600"
                onClick={handleApplyColor}
              >
                应用
              </button>
            </div>
            <button
              className="mt-2 text-xs text-foreground-muted hover:text-foreground"
              onClick={() => setShowColorPicker(false)}
            >
              取消
            </button>
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
