// React
import React, { useState, useEffect, useRef, useCallback } from 'react';
// UI
import { confirm, message } from '../ui';
// Config
import config from '../../config';
// Style
import style from './index.module.css';
// Utils
import { platform } from '../../utils/tools';
import { iconImporter } from '../../utils/importer';
// Database
import db from '../../database';
// Store
import useAppStore from '../../store';
// Sub-components
import ResourceNav from './ResourceNav';
import GroupList from './GroupList';
import FileMenuBar from './FileMenuBar';
import ExportDialog from './ExportDialog';
import GroupDialogs from './GroupDialogs';
import PrefixDialog from './PrefixDialog';
// Types
import type { GroupData } from './types';

interface SideMenuProps {
  handleGroupSelected: (groupId: string) => void;
  selectedGroup: string;
}

const SideMenu = React.memo(function SideMenu({
  handleGroupSelected,
  selectedGroup: selectedGroupProp,
}: SideMenuProps) {
  const groupData: GroupData[] = useAppStore((state: any) => state.groupData);
  const syncLeft = useAppStore((state: any) => state.syncLeft);

  const [selectedGroup, setSelectedGroup] = useState<string>(config.defaultSelectedGroup);
  // 对话框可见性
  const [addGroupVisible, setAddGroupVisible] = useState(false);
  const [renameGroupData, setRenameGroupData] = useState<GroupData | null>(null);
  const [renameGroupVisible, setRenameGroupVisible] = useState(false);
  const [prefixVisible, setPrefixVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);

  const sideMenuWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    syncLeft();
  }, []);

  useEffect(() => {
    if (selectedGroupProp !== selectedGroup) {
      setSelectedGroup(selectedGroupProp);
    }
  }, [selectedGroupProp]);

  // 菜单选择
  const handleMenuItemSelected = useCallback(
    (e: { key: string }) => {
      setSelectedGroup(e.key);
      handleGroupSelected(e.key);
    },
    [handleGroupSelected]
  );

  // 文件菜单统一处理
  const handleFileMenuAction = useCallback(
    (key: string) => {
      switch (key) {
        case 'import-icons':
          iconImporter({
            onSelectSVG: (files: any[]) => {
              db.addIcons(files, selectedGroup, () => {
                message.success(`已成功导入 ${files.length} 个图标`);
                syncLeft();
              });
            },
          });
          break;
        case 'export-fonts':
          setExportVisible(true);
          break;
        case 'settings':
          setPrefixVisible(true);
          break;
        // Project-level operations → dispatch to MainContainer via custom events
        case 'new-project':
        case 'open-project':
        case 'save':
        case 'save-as':
        case 'close-project':
          window.dispatchEvent(new CustomEvent(`bobcorn:${key}`));
          break;
      }
    },
    [selectedGroup, syncLeft]
  );

  useEffect(() => {
    const handler = () => setExportVisible(true);
    window.addEventListener('bobcorn:open-export', handler);
    return () => window.removeEventListener('bobcorn:open-export', handler);
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col bg-surface dark:bg-surface">
      {platform() === 'darwin' && <div className={style.osxDrag} />}
      {platform() === 'win32' && <div className={style.win32Drag} />}

      {/* 资源导航 */}
      <ResourceNav selectedGroup={selectedGroup} onMenuItemSelected={handleMenuItemSelected} />

      {/* 分组列表 */}
      <GroupList
        groupData={groupData}
        selectedGroup={selectedGroup}
        sideMenuWrapperRef={sideMenuWrapperRef}
        onMenuItemSelected={handleMenuItemSelected}
        onShowAddGroup={() => setAddGroupVisible(true)}
        onRenameGroup={(group: GroupData) => {
          setRenameGroupData(group);
          setRenameGroupVisible(true);
        }}
        onDeleteGroup={(group: GroupData) => {
          confirm({
            title: '删除分组',
            content: `确定要删除分组「${group.groupName}」吗？该分组内的图标将移入未分组。`,
            okText: '删除',
            okType: 'danger',
            onOk() {
              db.delGroup(group.id, () => {
                message.success('分组已删除');
                syncLeft();
                setSelectedGroup('resource-all');
                handleGroupSelected('resource-all');
              });
            },
          });
        }}
      />

      {/* 底栏 — 文件菜单 */}
      <FileMenuBar onMenuAction={handleFileMenuAction} />

      {/* 分组管理对话框（添加 + 重命名） */}
      <GroupDialogs
        addGroupVisible={addGroupVisible}
        onCloseAddGroup={() => setAddGroupVisible(false)}
        onGroupAdded={(groupId: string) => {
          setSelectedGroup(groupId);
          handleGroupSelected(groupId);
        }}
        sideMenuWrapperRef={sideMenuWrapperRef}
        renameGroupData={renameGroupData}
        renameGroupVisible={renameGroupVisible}
        onCloseRenameGroup={() => setRenameGroupVisible(false)}
        onGroupRenamed={(groupId: string) => {
          setSelectedGroup(groupId);
          handleGroupSelected(groupId);
        }}
      />

      {/* 前缀编辑对话框 */}
      <PrefixDialog visible={prefixVisible} onClose={() => setPrefixVisible(false)} />

      {/* 导出对话框 */}
      <ExportDialog visible={exportVisible} onClose={() => setExportVisible(false)} />
    </div>
  );
});

export default SideMenu;
