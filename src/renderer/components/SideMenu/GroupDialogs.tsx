import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Shuffle, X } from 'lucide-react';
import { Dialog, Button } from '../ui';
import { message } from '../ui/toast';
import EnhanceInput from '../enhance/input';
import { cn } from '../../lib/utils';
import { sanitizeSVG } from '../../utils/sanitize';
import db from '../../database';
import useAppStore from '../../store';
import type { GroupData } from './types';

interface GroupDialogsProps {
  addGroupVisible: boolean;
  onCloseAddGroup: () => void;
  onGroupAdded: (groupId: string) => void;
  sideMenuWrapperRef: React.RefObject<HTMLDivElement>;
  renameGroupData: GroupData | null;
  renameGroupVisible: boolean;
  onCloseRenameGroup: () => void;
  onGroupRenamed: (groupId: string) => void;
}

// ── Mini icon picker for group icon selection ──────────────────────────
function GroupIconPicker({
  groupId,
  selectedIconId,
  onSelect,
}: {
  groupId: string;
  selectedIconId: string | null;
  onSelect: (iconId: string | null) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [iconContents, setIconContents] = useState<Map<string, string>>(new Map());

  const icons = useMemo(() => {
    return db.getIconListFromGroup(groupId);
  }, [groupId]);

  // Batch load SVG content when expanded
  useEffect(() => {
    if (!expanded || icons.length === 0) return;
    const ids = icons.map((i) => i.id);
    const contents = db.getIconContentBatch(ids);
    setIconContents(contents);
  }, [expanded, icons]);

  // Load selected icon content for preview
  const selectedContent = useMemo(() => {
    if (!selectedIconId) return '';
    if (iconContents.has(selectedIconId)) return iconContents.get(selectedIconId) || '';
    return db.getIconContent(selectedIconId);
  }, [selectedIconId, iconContents]);

  const handleRandom = useCallback(() => {
    if (icons.length === 0) return;
    const idx = Math.floor(Math.random() * icons.length);
    onSelect(icons[idx].id);
  }, [icons, onSelect]);

  const handleClear = useCallback(() => {
    onSelect(null);
    setExpanded(false);
  }, [onSelect]);

  if (icons.length === 0) {
    return <div className="text-xs text-foreground-muted/50 py-2">{t('group.iconEmpty')}</div>;
  }

  return (
    <div>
      {/* Selected preview + actions */}
      <div className="flex items-center gap-2">
        {selectedIconId && selectedContent ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={cn(
              'w-9 h-9 rounded-lg border flex items-center justify-center',
              'transition-colors cursor-pointer',
              'border-accent/50 bg-accent/5',
              '[&>svg]:w-5 [&>svg]:h-5'
            )}
            dangerouslySetInnerHTML={{ __html: sanitizeSVG(selectedContent) }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={cn(
              'w-9 h-9 rounded-lg border flex items-center justify-center',
              'transition-colors cursor-pointer',
              'border-border border-dashed bg-surface-muted/50 hover:border-foreground-muted/30'
            )}
          >
            <span className="text-foreground-muted/30 text-lg leading-none">+</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleRandom}
          className={cn(
            'h-7 px-2 rounded-md text-xs flex items-center gap-1',
            'border border-border text-foreground-muted',
            'hover:bg-surface-muted hover:text-foreground',
            'transition-colors cursor-pointer'
          )}
        >
          <Shuffle size={12} />
          {t('group.iconRandom')}
        </button>

        {selectedIconId && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              'h-7 px-2 rounded-md text-xs flex items-center gap-1',
              'border border-border text-foreground-muted',
              'hover:bg-surface-muted hover:text-foreground',
              'transition-colors cursor-pointer'
            )}
          >
            <X size={12} />
            {t('group.iconClear')}
          </button>
        )}
      </div>

      {/* Expandable icon grid */}
      {expanded && (
        <div
          className={cn(
            'mt-2 rounded-lg border border-border bg-surface-muted/30',
            'overflow-y-auto overscroll-contain',
            'grid grid-cols-8 gap-px p-1'
          )}
          style={{ maxHeight: '160px' }}
        >
          {icons.map((icon) => {
            const content = iconContents.get(icon.id) || '';
            const isSelected = icon.id === selectedIconId;
            return (
              <button
                type="button"
                key={icon.id}
                onClick={() => {
                  onSelect(icon.id);
                  setExpanded(false);
                }}
                className={cn(
                  'aspect-square rounded-md flex items-center justify-center p-1.5',
                  'transition-colors cursor-pointer',
                  'hover:bg-surface-accent',
                  isSelected && 'ring-1.5 ring-accent bg-accent/10',
                  '[&>svg]:w-full [&>svg]:h-full'
                )}
                dangerouslySetInnerHTML={{ __html: sanitizeSVG(content) }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────
function GroupDialogs({
  addGroupVisible,
  onCloseAddGroup,
  onGroupAdded,
  sideMenuWrapperRef,
  renameGroupData,
  renameGroupVisible,
  onCloseRenameGroup,
  onGroupRenamed,
}: GroupDialogsProps) {
  const { t } = useTranslation();
  const syncLeft = useAppStore((state: any) => state.syncLeft);

  // 添加分组
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupDesc, setNewGroupDesc] = useState<string>('');
  const [newGroupErr, setNewGroupErr] = useState<string | null>(null);

  // 编辑分组
  const [renameName, setRenameName] = useState<string>('');
  const [renameDesc, setRenameDesc] = useState<string>('');
  const [renameIcon, setRenameIcon] = useState<string | null>(null);
  const [renameErr, setRenameErr] = useState<string | null>(null);

  // 添加对话框打开时重置
  useEffect(() => {
    if (addGroupVisible) {
      setNewGroupName('');
      setNewGroupDesc('');
      setNewGroupErr(null);
    }
  }, [addGroupVisible]);

  // 编辑对话框打开时从 DB 数据回填
  useEffect(() => {
    if (renameGroupVisible && renameGroupData) {
      setRenameName(renameGroupData.groupName);
      setRenameDesc(renameGroupData.groupDescription || '');
      setRenameIcon(renameGroupData.groupIcon || null);
      setRenameErr(null);
    }
  }, [renameGroupVisible, renameGroupData]);

  const handleAddGroup = () => {
    if (newGroupName) {
      db.addGroup(
        newGroupName,
        (group: GroupData) => {
          message.success(t('group.addSuccess'));
          syncLeft();
          onCloseAddGroup();
          onGroupAdded(group.id);
          if (sideMenuWrapperRef.current) {
            sideMenuWrapperRef.current.scrollTop = 100000;
          }
        },
        newGroupDesc.trim() || undefined
      );
    } else {
      setNewGroupErr(t('group.nameRequired'));
    }
  };

  const handleRenameGroup = () => {
    if (renameName) {
      db.setGroupInfo(
        renameGroupData!.id,
        renameName,
        renameDesc.trim() || null,
        () => {
          message.success(t('group.updateSuccess'));
          syncLeft();
          onCloseRenameGroup();
          onGroupRenamed(renameGroupData!.id);
        },
        renameIcon
      );
    } else {
      setRenameErr(t('group.nameEmpty'));
    }
  };

  return (
    <>
      <Dialog
        open={addGroupVisible}
        onClose={onCloseAddGroup}
        title={t('group.add')}
        footer={
          <>
            <Button onClick={onCloseAddGroup}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={handleAddGroup}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="py-2 space-y-3">
          <EnhanceInput
            placeholder={t('group.name')}
            value={newGroupName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewGroupName(e.target.value)}
            onPressEnter={handleAddGroup}
            inputTitle={t('group.addInputTitle')}
            inputHintText={newGroupErr}
            inputHintBadgeType="error"
          />
          <div>
            <label className="block text-xs text-foreground-muted mb-1">
              {t('group.descriptionOptional')}
            </label>
            <textarea
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring/30 resize-none"
              placeholder={t('group.descriptionPlaceholder')}
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              rows={2}
              maxLength={200}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={renameGroupVisible}
        onClose={onCloseRenameGroup}
        title={t('group.edit')}
        footer={
          <>
            <Button onClick={onCloseRenameGroup}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={handleRenameGroup}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="py-2 space-y-3">
          <EnhanceInput
            placeholder={t('group.name')}
            value={renameName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameName(e.target.value)}
            onPressEnter={handleRenameGroup}
            inputTitle={t('group.editInputTitle')}
            inputHintText={renameErr}
            inputHintBadgeType="error"
          />
          <div>
            <label className="block text-xs text-foreground-muted mb-1">
              {t('group.descriptionOptional')}
            </label>
            <textarea
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring/30 resize-none"
              placeholder={t('group.descriptionPlaceholder')}
              value={renameDesc}
              onChange={(e) => setRenameDesc(e.target.value)}
              rows={2}
              maxLength={200}
            />
          </div>
          <div>
            <label className="block text-xs text-foreground-muted mb-1">{t('group.icon')}</label>
            <GroupIconPicker
              groupId={renameGroupData?.id || ''}
              selectedIconId={renameIcon}
              onSelect={setRenameIcon}
            />
          </div>
        </div>
      </Dialog>
    </>
  );
}

export default GroupDialogs;
