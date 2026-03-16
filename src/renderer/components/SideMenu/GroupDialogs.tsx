import React, { useState } from 'react';
import { Dialog, Button } from '../ui';
import { message } from '../ui/toast';
import { confirm } from '../ui/dialog';
import EnhanceInput from '../enhance/input';
import db from '../../database';
import useAppStore from '../../store';
import type { GroupData } from './types';

interface GroupDialogsProps {
  // 添加分组
  addGroupVisible: boolean;
  onCloseAddGroup: () => void;
  onGroupAdded: (groupId: string) => void;
  sideMenuWrapperRef: React.RefObject<HTMLDivElement>;
  // 编辑分组（改名/删除）
  editingGroupData: GroupData | null;
  editGroupVisible: boolean;
  onCloseEditGroup: () => void;
  onGroupDeleted: () => void;
  onGroupRenamed: (groupId: string) => void;
}

function GroupDialogs({
  addGroupVisible,
  onCloseAddGroup,
  onGroupAdded,
  sideMenuWrapperRef,
  editingGroupData,
  editGroupVisible,
  onCloseEditGroup,
  onGroupDeleted,
  onGroupRenamed,
}: GroupDialogsProps) {
  const syncLeft = useAppStore((state: any) => state.syncLeft);

  // 添加分组
  const [newGroupNameText, setNewGroupNameText] = useState<string | null>(null);
  const [newGroupNameErrText, setNewGroupNameErrText] = useState<string | null>(null);

  // 修改组名（编辑分组弹窗改为直接显示改名输入框）
  const [editingGroupNameText, setEditingGroupNameText] = useState<string | null>(null);
  const [editingGroupNameErrText, setEditingGroupNameErrText] = useState<string | null>(null);

  // Reset add group state when dialog opens
  const prevAddVisibleRef = React.useRef(false);
  if (addGroupVisible && !prevAddVisibleRef.current) {
    setNewGroupNameText(null);
    setNewGroupNameErrText(null);
  }
  prevAddVisibleRef.current = addGroupVisible;

  // Reset edit state when dialog opens
  const prevEditVisibleRef = React.useRef(false);
  if (editGroupVisible && !prevEditVisibleRef.current && editingGroupData) {
    setEditingGroupNameText(editingGroupData.groupName);
    setEditingGroupNameErrText(null);
  }
  prevEditVisibleRef.current = editGroupVisible;

  const handleEnsureAddGroup = () => {
    if (newGroupNameText) {
      db.addGroup(newGroupNameText, (group: GroupData) => {
        message.success('添加分组成功');
        syncLeft();
        onCloseAddGroup();
        onGroupAdded(group.id);
        if (sideMenuWrapperRef.current) {
          sideMenuWrapperRef.current.scrollTop = 100000;
        }
      });
    } else {
      setNewGroupNameErrText('请输入一个分组名称');
    }
  };

  const handleEnsureGroupNameChange = () => {
    if (editingGroupNameText) {
      db.setGroupName(editingGroupData!.id, editingGroupNameText, () => {
        message.success('组名已修改');
        syncLeft();
        onCloseEditGroup();
        onGroupRenamed(editingGroupData!.id);
      });
    } else {
      setEditingGroupNameErrText('分组名称不能为空');
    }
  };

  const handleDeleteGroup = () => {
    confirm({
      title: '删除分组',
      content: `确定要删除分组「${editingGroupData?.groupName}」吗？该分组内的所有图标也会被一并移除。`,
      okText: '删除',
      okType: 'danger',
      onOk() {
        db.delGroup(editingGroupData!.id, () => {
          message.success('分组已删除');
          syncLeft();
          onCloseEditGroup();
          onGroupDeleted();
        });
      },
    });
  };

  return (
    <>
      {/*添加分组对话框*/}
      <Dialog
        open={addGroupVisible}
        onClose={onCloseAddGroup}
        title="添加分组"
        footer={
          <>
            <Button onClick={onCloseAddGroup}>取消</Button>
            <Button type="primary" onClick={handleEnsureAddGroup}>
              确认
            </Button>
          </>
        }
      >
        <div className="py-2">
          <EnhanceInput
            placeholder="分组名称"
            value={newGroupNameText}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setNewGroupNameText(e.target.value)
            }
            onPressEnter={handleEnsureAddGroup}
            inputTitle="请输入要创建的分组名"
            inputHintText={newGroupNameErrText}
            inputHintBadgeType="error"
          />
        </div>
      </Dialog>

      {/*编辑分组对话框 — 改名 + 删除*/}
      <Dialog
        open={editGroupVisible}
        onClose={onCloseEditGroup}
        title="编辑分组"
        footer={
          <>
            <Button danger onClick={handleDeleteGroup}>
              删除分组
            </Button>
            <Button type="primary" onClick={handleEnsureGroupNameChange}>
              保存
            </Button>
          </>
        }
      >
        <div className="py-2">
          <EnhanceInput
            placeholder="分组名称"
            value={editingGroupNameText}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEditingGroupNameText(e.target.value)
            }
            onPressEnter={handleEnsureGroupNameChange}
            inputTitle="分组名称"
            inputHintText={editingGroupNameErrText}
            inputHintBadgeType="error"
          />
        </div>
      </Dialog>
    </>
  );
}

export default GroupDialogs;
