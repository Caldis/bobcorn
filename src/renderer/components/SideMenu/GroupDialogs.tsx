import React, { useState, useEffect } from 'react';
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
          message.success('添加分组成功');
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
      setNewGroupErr('请输入一个分组名称');
    }
  };

  const handleRenameGroup = () => {
    if (renameName) {
      db.setGroupInfo(renameGroupData!.id, renameName, renameDesc.trim() || null, () => {
        message.success('分组已更新');
        syncLeft();
        onCloseRenameGroup();
        onGroupRenamed(renameGroupData!.id);
      });
    } else {
      setRenameErr('分组名称不能为空');
    }
  };

  return (
    <>
      <Dialog
        open={addGroupVisible}
        onClose={onCloseAddGroup}
        title="添加分组"
        footer={
          <>
            <Button onClick={onCloseAddGroup}>取消</Button>
            <Button type="primary" onClick={handleAddGroup}>
              确认
            </Button>
          </>
        }
      >
        <div className="py-2 space-y-3">
          <EnhanceInput
            placeholder="分组名称"
            value={newGroupName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewGroupName(e.target.value)}
            onPressEnter={handleAddGroup}
            inputTitle="请输入要创建的分组名"
            inputHintText={newGroupErr}
            inputHintBadgeType="error"
          />
          <div>
            <label className="block text-xs text-foreground-muted mb-1">描述（可选）</label>
            <textarea
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/30 resize-none dark:bg-surface-muted dark:border-border"
              placeholder="为分组添加一段描述..."
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
        title="编辑分组"
        footer={
          <>
            <Button onClick={onCloseRenameGroup}>取消</Button>
            <Button type="primary" onClick={handleRenameGroup}>
              保存
            </Button>
          </>
        }
      >
        <div className="py-2 space-y-3">
          <EnhanceInput
            placeholder="分组名称"
            value={renameName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameName(e.target.value)}
            onPressEnter={handleRenameGroup}
            inputTitle="分组名称"
            inputHintText={renameErr}
            inputHintBadgeType="error"
          />
          <div>
            <label className="block text-xs text-foreground-muted mb-1">描述（可选）</label>
            <textarea
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/30 resize-none dark:bg-surface-muted dark:border-border"
              placeholder="为分组添加一段描述..."
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
