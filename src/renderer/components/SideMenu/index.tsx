// React
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): group.list
import db from '../../database';
// Store
import useAppStore from '../../store';
// Sub-components
import ResourceNav from './ResourceNav';
import GroupList from './GroupList';
import FileMenuBar from './FileMenuBar';
import ExportDialog from './ExportDialog';
import GroupDialogs from './GroupDialogs';
import SettingsDialog from './SettingsDialog';
import ProjectSettingsDialog from './ProjectSettingsDialog';
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
  const { t } = useTranslation();
  const groupData: GroupData[] = useAppStore((state: any) => state.groupData);
  const syncLeft = useAppStore((state: any) => state.syncLeft);

  const [selectedGroup, setSelectedGroup] = useState<string>(config.defaultSelectedGroup);
  // 对话框可见性
  const [addGroupVisible, setAddGroupVisible] = useState(false);
  const [renameGroupData, setRenameGroupData] = useState<GroupData | null>(null);
  const [renameGroupVisible, setRenameGroupVisible] = useState(false);
  const [prefixVisible, setPrefixVisible] = useState(false);
  const [projectSettingsVisible, setProjectSettingsVisible] = useState(false);
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
                message.success(t('import.success', { count: files.length }));
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
    const exportHandler = () => setExportVisible(true);
    const importHandler = () => handleFileMenuAction('import-icons');
    const settingsHandler = () => setPrefixVisible(true);
    const projectSettingsHandler = () => setProjectSettingsVisible(true);
    window.addEventListener('bobcorn:open-export', exportHandler);
    window.addEventListener('bobcorn:import-icons', importHandler);
    window.addEventListener('bobcorn:open-settings', settingsHandler);
    window.addEventListener('bobcorn:open-project-settings', projectSettingsHandler);
    return () => {
      window.removeEventListener('bobcorn:open-export', exportHandler);
      window.removeEventListener('bobcorn:import-icons', importHandler);
      window.removeEventListener('bobcorn:open-settings', settingsHandler);
      window.removeEventListener('bobcorn:open-project-settings', projectSettingsHandler);
    };
  }, [handleFileMenuAction]);

  return (
    <div className="relative flex h-full w-full flex-col bg-surface">
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
            title: t('group.deleteConfirmTitle'),
            content: t('group.deleteConfirm', { name: group.groupName }),
            okText: t('group.deleteOk'),
            okType: 'danger',
            onOk() {
              db.delGroup(group.id, () => {
                message.success(t('group.deleteSuccess'));
                syncLeft();
                setSelectedGroup('resource-all');
                handleGroupSelected('resource-all');
              });
            },
          });
        }}
      />

      {/* 底栏 — 文件菜单 + 项目切换 + 设置 */}
      <FileMenuBar
        onMenuAction={handleFileMenuAction}
        onInstallUpdate={() => window.dispatchEvent(new CustomEvent('bobcorn:install-update'))}
        onSettingsClick={() => setPrefixVisible(true)}
      />

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

      {/* 设置对话框 */}
      <SettingsDialog visible={prefixVisible} onClose={() => setPrefixVisible(false)} />

      {/* 项目设置对话框 */}
      <ProjectSettingsDialog
        visible={projectSettingsVisible}
        onClose={() => setProjectSettingsVisible(false)}
      />

      {/* 导出对话框 */}
      <ExportDialog visible={exportVisible} onClose={() => setExportVisible(false)} />
    </div>
  );
});

export default SideMenu;
