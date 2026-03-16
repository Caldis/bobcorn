// Electron API (via preload contextBridge)
const { electronAPI } = window;
// React
import React, { useState, useEffect, useRef } from 'react';
// UI
import { confirm, message } from '../ui';
// Config
import config from '../../config';
// Style
import style from './index.module.css';
// Utils
import { platform } from '../../utils/tools';
import { cpLoader, icpLoader } from '../../utils/loaders';
import { iconImporter, projImporter } from '../../utils/importer';
// Database
import db from '../../database';
// Store
import useAppStore from '../../store';
// Sub-components
import ResourceNav from './ResourceNav';
import GroupList from './GroupList';
import ImportExportBar from './ImportExportBar';
import ExportDialog from './ExportDialog';
import GroupDialogs from './GroupDialogs';
import PrefixDialog from './PrefixDialog';
// Types
import type { GroupData } from './types';

interface SideMenuProps {
  handleGroupSelected: (groupId: string) => void;
  selectedGroup: string;
}

function SideMenu({ handleGroupSelected, selectedGroup: selectedGroupProp }: SideMenuProps) {
  const groupData: GroupData[] = useAppStore((state: any) => state.groupData);
  const syncLeft = useAppStore((state: any) => state.syncLeft);
  const selectGroup = useAppStore((state: any) => state.selectGroup);

  const [selectedGroup, setSelectedGroup] = useState<string>(config.defaultSelectedGroup);
  // 对话框可见性
  const [addGroupVisible, setAddGroupVisible] = useState(false);
  const [editingGroupData, setEditingGroupData] = useState<GroupData | null>(null);
  const [editGroupVisible, setEditGroupVisible] = useState(false);
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
  const handleMenuItemSelected = (e: { key: string }) => {
    setSelectedGroup(e.key);
    handleGroupSelected(e.key);
  };

  // 导入
  const handleImportClick = (e: { key: string }) => {
    if (e.key === 'importIcon') {
      iconImporter({
        onSelectSVG: (files: any[]) => {
          db.addIcons(files, selectedGroup, () => {
            message.success(`已成功导入 ${files.length} 个图标`);
            syncLeft();
          });
        },
      });
    }
    if (e.key === 'importProj') {
      projImporter({
        onSelectCP: (project: any) => {
          setTimeout(() => {
            confirm({
              title: '导入项目',
              content: '导入所选的项目后, 当前正在编辑的项目将会被覆盖, 确认要导入吗 ?',
              okText: '导入',
              onOk() {
                cpLoader({ data: project.data }, () => {
                  message.success('项目已导入');
                  syncLeft();
                  selectGroup('resource-all');
                });
              },
            });
          }, 250);
        },
        onSelectICP: (project: any) => {
          setTimeout(() => {
            confirm({
              title: '导入项目',
              content: '导入所选的项目后, 当前正在编辑的项目将会被覆盖, 确认要导入吗 ?',
              okText: '导入',
              onOk() {
                icpLoader(project.data, () => {
                  message.success('项目已导入');
                  syncLeft();
                  selectGroup('resource-all');
                });
              },
            });
          }, 250);
        },
      });
    }
  };

  // 导出
  const handleExportClick = (e?: { key?: string } | React.MouseEvent) => {
    const key = e && 'key' in e && e.key ? e.key : 'exportIconfonts';
    if (key === 'exportProject') {
      handleExportProjects();
    } else {
      setExportVisible(true);
    }
  };

  const handleExportProjects = async () => {
    const result = await electronAPI.showSaveDialog({
      title: '导出项目文件',
      defaultPath: `${db.getProjectName()}`,
    });
    if (!result.canceled && result.filePath) {
      db.exportProject((projData: any) => {
        const buffer = Buffer.from(projData);
        electronAPI
          .writeFile(`${result.filePath}.icp`, buffer)
          .then(() => message.success('项目已导出'))
          .catch((err: Error) => message.error(`导出错误: ${err.message}`));
      });
    }
  };

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
        onShowEditGroup={(group: GroupData) => {
          setEditingGroupData(group);
          setEditGroupVisible(true);
        }}
      />

      {/* 底栏 */}
      <ImportExportBar
        onImportClick={handleImportClick}
        onExportClick={handleExportClick}
        onShowEditPrefix={() => setPrefixVisible(true)}
      />

      {/* 分组管理对话框 */}
      <GroupDialogs
        addGroupVisible={addGroupVisible}
        onCloseAddGroup={() => setAddGroupVisible(false)}
        onGroupAdded={(groupId: string) => {
          setSelectedGroup(groupId);
          handleGroupSelected(groupId);
        }}
        sideMenuWrapperRef={sideMenuWrapperRef}
        editingGroupData={editingGroupData}
        editGroupVisible={editGroupVisible}
        onCloseEditGroup={() => setEditGroupVisible(false)}
        onGroupDeleted={() => {
          setSelectedGroup('resource-all');
          handleGroupSelected('resource-all');
        }}
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
}

export default SideMenu;
