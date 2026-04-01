import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Button } from '../ui';
import { message } from '../ui/toast';
import EnhanceInput from '../enhance/input';
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
      db.setGroupInfo(renameGroupData!.id, renameName, renameDesc.trim() || null, () => {
        message.success(t('group.updateSuccess'));
        syncLeft();
        onCloseRenameGroup();
        onGroupRenamed(renameGroupData!.id);
      });
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
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/30 resize-none dark:bg-surface-muted dark:border-border"
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
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/30 resize-none dark:bg-surface-muted dark:border-border"
              placeholder={t('group.descriptionPlaceholder')}
              value={renameDesc}
              onChange={(e) => setRenameDesc(e.target.value)}
              rows={2}
              maxLength={200}
            />
          </div>
        </div>
      </Dialog>
    </>
  );
}

export default GroupDialogs;
