import React, { useState } from 'react';
import { Dialog, Alert, Button } from '../ui';
import { message } from '../ui/toast';
import { confirm } from '../ui/dialog';
import EnhanceInput from '../enhance/input';
import { isnContainSpace } from '../../utils/tools';
import db from '../../database';
import useAppStore from '../../store';

interface PrefixDialogProps {
  visible: boolean;
  onClose: () => void;
}

function PrefixDialog({ visible, onClose }: PrefixDialogProps) {
  const syncLeft = useAppStore((state: any) => state.syncLeft);

  const [editingPrefixText, setEditingPrefixText] = useState<string | null>(null);
  const [editingPrefixErrText, setEditingPrefixErrText] = useState<string | null>(null);

  // Reset state when dialog opens
  const prevVisibleRef = React.useRef(false);
  if (visible && !prevVisibleRef.current) {
    setEditingPrefixText(db.getProjectName());
    setEditingPrefixErrText(null);
  }
  prevVisibleRef.current = visible;

  const handleEnsureEditPrefix = () => {
    if (isnContainSpace(editingPrefixText)) {
      confirm({
        title: '确认修改图标字体前缀？',
        content: '此操作将影响所有已引用的图标前缀，修改后需要同步更新代码中的相关引用。',
        okText: '确认修改',
        okType: 'danger',
        cancelText: '取消',
        onOk() {
          db.setProjectName(editingPrefixText, () => {
            message.success('图标字体前缀已修改');
            syncLeft();
            onClose();
          });
        },
      });
    } else {
      setEditingPrefixErrText('图标字体前缀不能为空或包含空格');
    }
  };

  const handleCancelEditPrefix = () => {
    onClose();
  };

  const onEditingPrefixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingPrefixText(e.target.value);
  };

  return (
    <Dialog
      open={visible}
      onClose={handleCancelEditPrefix}
      title="修改图标字体前缀"
      footer={
        <>
          <Button onClick={handleCancelEditPrefix}>取消</Button>
          <Button type="primary" onClick={handleEnsureEditPrefix}>
            确认修改
          </Button>
        </>
      }
    >
      <div className="py-2">
        <Alert
          message="请务必当心"
          description={
            <>
              <div>一旦你修改了图标字体前缀，被引用的所有图标的相应前缀都会被变更</div>
              <div>与此同时，您必须同步修改代码中所有引用到该图标的相关代码</div>
            </>
          }
          type="warning"
        />
        <div className="mt-4">
          <EnhanceInput
            placeholder="前缀名称"
            value={editingPrefixText}
            onChange={onEditingPrefixChange}
            onPressEnter={handleEnsureEditPrefix}
            inputTitle="请输入新的前缀"
            inputHintText={editingPrefixErrText}
            inputHintBadgeType="error"
          />
        </div>
      </div>
    </Dialog>
  );
}

export default PrefixDialog;
