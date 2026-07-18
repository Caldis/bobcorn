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
import { buildImportSuccessMessage } from '../../utils/importFeedback';
// Database
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): group.list
import db from '../../database';
// Store
import useAppStore, { analyticsTrack } from '../../store';
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
  // 对话框可见性 — store UI 命令面 (W4-D1): 设置/项目设置/导出对话框状态入 store,
  // 菜单 IPC/画布右键/项目切换器经 store action 打开 (原 bobcorn:* CustomEvent 通路)
  const settingsOpen = useAppStore((state: any) => state.settingsOpen);
  const projectSettingsOpen = useAppStore((state: any) => state.projectSettingsOpen);
  const exportDialog = useAppStore((state: any) => state.exportDialog);
  const importRequest = useAppStore((state: any) => state.importRequest);

  const [selectedGroup, setSelectedGroup] = useState<string>(config.defaultSelectedGroup);
  // 对话框可见性 (组件内私有 — 分组管理对话框)
  const [addGroupVisible, setAddGroupVisible] = useState(false);
  const [renameGroupData, setRenameGroupData] = useState<GroupData | null>(null);
  const [renameGroupVisible, setRenameGroupVisible] = useState(false);

  const sideMenuWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    syncLeft();
  }, [syncLeft]);

  useEffect(() => {
    if (selectedGroupProp !== selectedGroup) {
      setSelectedGroup(selectedGroupProp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally excludes `selectedGroup`: adding it would re-fire right after handleMenuItemSelected's local setSelectedGroup, before selectedGroupProp catches up, reverting the just-clicked selection back to the stale prop
  }, [selectedGroupProp]);

  // 菜单选择
  const handleMenuItemSelected = useCallback(
    (e: { key: string }) => {
      setSelectedGroup(e.key);
      handleGroupSelected(e.key);
    },
    [handleGroupSelected]
  );

  // 导入图标 — targetGroup 缺省为当前选中分组 (文件菜单路径); 画布右键可显式指定目标
  const runIconImport = useCallback(
    (targetGroup: string) => {
      iconImporter({
        onSelectSVG: (files: any[]) => {
          db.addIcons(files, targetGroup, (result) => {
            if (result && result.failed > 0) {
              message.warning(
                t('import.codeExhausted', { added: result.added, failed: result.failed })
              );
            } else {
              message.success(buildImportSuccessMessage(t, result, files.length));
            }
            syncLeft();
            analyticsTrack('icon.import');
          });
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` intentionally omitted: only recreated on language switch
    [syncLeft]
  );

  // 文件菜单统一处理
  const handleFileMenuAction = useCallback(
    (key: string) => {
      switch (key) {
        case 'import-icons':
          runIconImport(selectedGroup);
          break;
        case 'export-fonts':
          useAppStore.getState().openExportDialog();
          break;
        case 'settings':
          useAppStore.getState().openSettings();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` intentionally omitted: only recreated on language switch, adding it would needlessly recreate this callback then
    [selectedGroup, syncLeft, runIconImport]
  );

  // 导入触发命令 (store 命令面) — 画布右键带 targetGroupId, 菜单 IPC 不带 (回退当前选中分组)。
  // seq 用 ref 去重: selectedGroup/runIconImport 变化重跑 effect 时不重复触发导入;
  // ref 初值取挂载时快照 — 挂载前发出的请求不补触发 (对齐原 CustomEvent 丢弃语义)
  const handledImportSeqRef = useRef<number>(useAppStore.getState().importRequest?.seq ?? 0);
  useEffect(() => {
    if (!importRequest || importRequest.seq === handledImportSeqRef.current) return;
    handledImportSeqRef.current = importRequest.seq;
    runIconImport(importRequest.targetGroupId ?? selectedGroup);
  }, [importRequest, runIconImport, selectedGroup]);

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
                analyticsTrack('group.delete');
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
        onInstallUpdate={() => useAppStore.getState().requestInstallUpdate()}
        onSettingsClick={() => useAppStore.getState().openSettings()}
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
      <SettingsDialog
        visible={settingsOpen}
        onClose={() => useAppStore.getState().closeSettings()}
      />

      {/* 项目设置对话框 */}
      <ProjectSettingsDialog
        visible={projectSettingsOpen}
        onClose={() => useAppStore.getState().closeProjectSettings()}
      />

      {/* 导出对话框 — initialGroups: 画布右键入口预选分组; 无则沿用持久化选择 */}
      <ExportDialog
        visible={exportDialog.open}
        initialGroups={exportDialog.initialGroupIds ?? null}
        onClose={() => useAppStore.getState().closeExportDialog()}
      />
    </div>
  );
});

export default SideMenu;
