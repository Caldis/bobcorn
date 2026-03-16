import React, { useState } from 'react';
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
  const [newGroupErr, setNewGroupErr] = useState<string | null>(null);

  // 重命名
  const [renameName, setRenameName] = useState<string>('');
  const [renameErr, setRenameErr] = useState<string | null>(null);

  // Reset on open
  const prevAddRef = React.useRef(false);
  if (addGroupVisible && !prevAddRef.current) {
    setNewGroupName('');
    setNewGroupErr(null);
  }
  prevAddRef.current = addGroupVisible;

  const prevRenameRef = React.useRef(false);
  if (renameGroupVisible && !prevRenameRef.current && renameGroupData) {
    setRenameName(renameGroupData.groupName);
    setRenameErr(null);
  }
  prevRenameRef.current = renameGroupVisible;

  const handleAddGroup = () => {
    if (newGroupName) {
      db.addGroup(newGroupName, (group: GroupData) => {
        message.success('添加分组成功');
        syncLeft();
        onCloseAddGroup();
        onGroupAdded(group.id);
        if (sideMenuWrapperRef.current) {
          sideMenuWrapperRef.current.scrollTop = 100000;
        }
      });
    } else {
      setNewGroupErr('请输入一个分组名称');
    }
  };

  const handleRenameGroup = () => {
    if (renameName) {
      db.setGroupName(renameGroupData!.id, renameName, () => {
        message.success('组名已修改');
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
        <div className="py-2">
          <EnhanceInput
            placeholder="分组名称"
            value={newGroupName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewGroupName(e.target.value)}
            onPressEnter={handleAddGroup}
            inputTitle="请输入要创建的分组名"
            inputHintText={newGroupErr}
            inputHintBadgeType="error"
          />
        </div>
      </Dialog>

      <Dialog
        open={renameGroupVisible}
        onClose={onCloseRenameGroup}
        title="重命名分组"
        footer={
          <>
            <Button onClick={onCloseRenameGroup}>取消</Button>
            <Button type="primary" onClick={handleRenameGroup}>
              保存
            </Button>
          </>
        }
      >
        <div className="py-2">
          <EnhanceInput
            placeholder="分组名称"
            value={renameName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameName(e.target.value)}
            onPressEnter={handleRenameGroup}
            inputTitle="分组名称"
            inputHintText={renameErr}
            inputHintBadgeType="error"
          />
        </div>
      </Dialog>
    </>
  );
}

export default GroupDialogs;
