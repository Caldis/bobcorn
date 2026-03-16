import React, { useState } from 'react';
import { Modal, Button, message } from 'antd';
import EnhanceInput from '../enhance/input';
import db from '../../database';
import useAppStore from '../../store';
import type { GroupData } from './types';

interface GroupDialogsProps {
  // 添加分组
  addGroupVisible: boolean;
  onAddGroupClose: () => void;
  onGroupAdded: (groupId: string) => void;
  scrollToBottom: () => void;
  // 编辑分组
  editGroupVisible: boolean;
  onEditGroupClose: () => void;
  editingGroupData: GroupData | null;
  onGroupEdited: (groupId: string) => void;
  // 删除分组
  onGroupDeleted: () => void;
}

function GroupDialogs({
  addGroupVisible,
  onAddGroupClose,
  onGroupAdded,
  scrollToBottom,
  editGroupVisible,
  onEditGroupClose,
  editingGroupData,
  onGroupEdited,
  onGroupDeleted,
}: GroupDialogsProps) {
  const syncLeft = useAppStore((state: any) => state.syncLeft);

  // 添加分组 state
  const [newGroupNameText, setNewGroupNameText] = useState<string | null>(null);
  const [newGroupNameErrText, setNewGroupNameErrText] = useState<string | null>(null);

  // 修改组名 state
  const [groupNameChangeModelVisible, setGroupNameChangeModelVisible] = useState<boolean>(false);
  const [editingGroupNameText, setEditingGroupNameText] = useState<string | null>(null);
  const [editingGroupNameErrText, setEditingGroupNameErrText] = useState<string | null>(null);

  // 删除分组 state
  const [deleteGroupModelVisible, setDeleteGroupModelVisible] = useState<boolean>(false);

  // --- 添加分组 ---
  const handleEnsureAddGroup = () => {
    if (newGroupNameText) {
      db.addGroup(newGroupNameText, (group: GroupData) => {
        message.success('添加分组成功');
        syncLeft();
        onAddGroupClose();
        onGroupAdded(group.id);
        scrollToBottom();
      });
    } else {
      setNewGroupNameErrText('请输入一个分组名称');
    }
  };

  const handleCancelAddGroup = () => {
    onAddGroupClose();
  };

  const onNewGroupNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewGroupNameText(e.target.value);
  };

  // Reset add group state when dialog opens
  const prevAddVisibleRef = React.useRef(false);
  if (addGroupVisible && !prevAddVisibleRef.current) {
    // Dialog just opened — reset fields
    setNewGroupNameText(null);
    setNewGroupNameErrText(null);
  }
  prevAddVisibleRef.current = addGroupVisible;

  // --- 修改组名 ---
  const handleShowGroupNameChange = () => {
    setGroupNameChangeModelVisible(true);
    setEditingGroupNameText(editingGroupData!.groupName);
    setEditingGroupNameErrText(null);
  };

  const handleEnsureGroupNameChange = () => {
    if (editingGroupNameText) {
      db.setGroupName(editingGroupData!.id, editingGroupNameText, () => {
        message.success('组名已修改');
        syncLeft();
        setGroupNameChangeModelVisible(false);
        onEditGroupClose();
        onGroupEdited(editingGroupData!.id);
      });
    } else {
      setEditingGroupNameErrText('分组名称不能为空');
    }
  };

  const handleCancelGroupNameChange = () => {
    setGroupNameChangeModelVisible(false);
  };

  const onEditingGroupNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingGroupNameText(e.target.value);
  };

  // --- 删除分组 ---
  const handleShowDeleteGroup = () => {
    setDeleteGroupModelVisible(true);
  };

  const handleEnsureDeleteGroup = () => {
    db.delGroup(editingGroupData!.id, () => {
      message.success('分组已删除');
      syncLeft();
      setDeleteGroupModelVisible(false);
      onEditGroupClose();
      onGroupDeleted();
    });
  };

  const handleCancelDeleteGroup = () => {
    setDeleteGroupModelVisible(false);
  };

  return (
    <>
      {/*添加分组对话框*/}
      <Modal
        wrapClassName="vertical-center-modal"
        title="添加分组"
        open={addGroupVisible}
        okText={'确认'}
        onOk={handleEnsureAddGroup}
        cancelText={'取消'}
        onCancel={handleCancelAddGroup}
      >
        <div className="py-2">
          <EnhanceInput
            placeholder="分组名称"
            value={newGroupNameText}
            onChange={onNewGroupNameChange}
            onPressEnter={handleEnsureAddGroup}
            inputTitle="请输入要创建的分组名"
            inputHintText={newGroupNameErrText}
            inputHintBadgeType="error"
          />
        </div>
      </Modal>

      {/*编辑分组对话框*/}
      <Modal
        wrapClassName="vertical-center-modal"
        title="编辑分组"
        open={editGroupVisible}
        onCancel={onEditGroupClose}
        footer={null}
      >
        <div className="flex flex-col gap-2.5 py-2">
          <Button size="large" className="!w-full" onClick={handleShowGroupNameChange}>
            修改分组名
          </Button>
          <Button size="large" danger className="!w-full" onClick={handleShowDeleteGroup}>
            删除这个分组
          </Button>
        </div>
      </Modal>

      {/*修改组名对话框*/}
      <Modal
        wrapClassName="vertical-center-modal"
        title="修改分组名称"
        open={groupNameChangeModelVisible}
        okText={'确认修改'}
        onOk={handleEnsureGroupNameChange}
        cancelText={'取消'}
        onCancel={handleCancelGroupNameChange}
      >
        <div className="py-2">
          <EnhanceInput
            placeholder="分组名称"
            value={editingGroupNameText}
            onChange={onEditingGroupNameChange}
            onPressEnter={handleEnsureGroupNameChange}
            inputTitle="请输入新的分组名"
            inputHintText={editingGroupNameErrText}
            inputHintBadgeType="error"
          />
        </div>
      </Modal>

      {/*删除分组对话框*/}
      <Modal
        wrapClassName="vertical-center-modal"
        title="删除分组"
        open={deleteGroupModelVisible}
        onOk={handleEnsureDeleteGroup}
        onCancel={handleCancelDeleteGroup}
        footer={[
          <Button key="cancel" size="large" onClick={handleCancelDeleteGroup}>
            取消
          </Button>,
          <Button key="delete" size="large" danger onClick={handleEnsureDeleteGroup}>
            删除
          </Button>,
        ]}
      >
        <div className="py-2 text-center">
          <p className="text-foreground-muted">以下的分组将会被删除</p>
          <p className="my-2">
            <b className="text-xl text-foreground">
              {editingGroupData && editingGroupData.groupName}
            </b>
          </p>
          <p className="text-foreground-muted">该分组内的所有图标也会被一并移除</p>
        </div>
      </Modal>
    </>
  );
}

export default GroupDialogs;
