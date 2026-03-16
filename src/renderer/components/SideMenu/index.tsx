// Electron API (via preload contextBridge)
const { electronAPI } = window;
// React
import React, { useState, useEffect, useRef } from 'react';
// Antd
import { Modal, message } from 'antd';
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
import type { GroupData, SideMenuProps } from './types';

const confirm = Modal.confirm;

function SideMenu({ handleGroupSelected, selectedGroup: selectedGroupProp }: SideMenuProps) {
  const syncLeft = useAppStore((state: any) => state.syncLeft);
  const selectGroup = useAppStore((state: any) => state.selectGroup);

  const [selectedGroup, setSelectedGroup] = useState<string>(config.defaultSelectedGroup);

  // 对话框可见性
  const [addGroupModelVisible, setAddGroupModelVisible] = useState<boolean>(false);
  const [editGroupModelVisible, setEditGroupModelVisible] = useState<boolean>(false);
  const [editingGroupData, setEditingGroupData] = useState<GroupData | null>(null);
  const [editPrefixModelVisible, setEditPrefixModelVisible] = useState<boolean>(false);
  const [exportIconfontsModelVisible, setExportIconfontsModelVisible] = useState<boolean>(false);

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

  const handleMenuItemSelectedByKey = (key: string) => {
    setSelectedGroup(key);
    handleGroupSelected(key);
  };

  // 添加分组
  const handleShowAddGroup = () => {
    setAddGroupModelVisible(true);
  };

  // 编辑分组
  const handleShowEditGroup = (group: GroupData) => {
    setEditingGroupData(group);
    setEditGroupModelVisible(true);
  };

  // 前缀编辑
  const handleShowEditPrefix = () => {
    setEditPrefixModelVisible(true);
  };

  // 导入相关
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
                  message.success(`项目已导入`);
                  syncLeft();
                  selectGroup('resource-all');
                });
              },
              onCancel() {
                message.warning(`导入已取消`);
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
                  message.success(`项目已导入`);
                  syncLeft();
                  selectGroup('resource-all');
                });
              },
              onCancel() {
                message.warning(`导入已取消`);
              },
            });
          }, 250);
        },
      });
    }
  };

  // 导出相关
  const handleExportClick = (e?: { key?: string } | React.MouseEvent) => {
    const key = e && 'key' in e && e.key ? e.key : 'exportIconfonts';
    switch (key) {
      case 'exportIconfonts':
        setExportIconfontsModelVisible(true);
        break;
      case 'exportProject':
        handleExportProjects();
        break;
      default:
        setExportIconfontsModelVisible(true);
        break;
    }
  };

  // 导出项目文件
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
          .then(() => message.success(`项目已导出`))
          .catch((err: Error) => message.error(`导出错误: ${err.message}`));
      });
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-surface dark:bg-surface">
      {/*OSX系统标题栏占位区域*/}
      {platform() === 'darwin' && <div className={style.osxDrag} />}

      {/*Win32系统标题栏可拖动区域*/}
      {platform() === 'win32' && <div className={style.win32Drag} />}

      {/*资源导航*/}
      <ResourceNav selectedGroup={selectedGroup} onMenuItemSelected={handleMenuItemSelected} />

      {/*分组列表*/}
      <GroupList
        selectedGroup={selectedGroup}
        sideMenuWrapperRef={sideMenuWrapperRef}
        onMenuItemSelected={handleMenuItemSelectedByKey}
        onShowAddGroup={handleShowAddGroup}
        onShowEditGroup={handleShowEditGroup}
      />

      {/*导入导出按钮*/}
      <ImportExportBar
        onImportClick={handleImportClick}
        onExportClick={handleExportClick}
        onShowEditPrefix={handleShowEditPrefix}
      />

      {/*分组管理对话框*/}
      <GroupDialogs
        addGroupVisible={addGroupModelVisible}
        onAddGroupClose={() => setAddGroupModelVisible(false)}
        onGroupAdded={(groupId) => {
          setSelectedGroup(groupId);
          handleGroupSelected(groupId);
        }}
        scrollToBottom={() => {
          if (sideMenuWrapperRef.current) {
            sideMenuWrapperRef.current.scrollTop = 100000;
          }
        }}
        editGroupVisible={editGroupModelVisible}
        onEditGroupClose={() => setEditGroupModelVisible(false)}
        editingGroupData={editingGroupData}
        onGroupEdited={(groupId) => {
          setSelectedGroup(groupId);
          handleGroupSelected(groupId);
        }}
        onGroupDeleted={() => {
          setSelectedGroup('resource-all');
          handleGroupSelected('resource-all');
        }}
      />

      {/*前缀编辑对话框*/}
      <PrefixDialog
        visible={editPrefixModelVisible}
        onClose={() => setEditPrefixModelVisible(false)}
      />

      {/*导出图标字体对话框*/}
      <ExportDialog
        visible={exportIconfontsModelVisible}
        onClose={() => setExportIconfontsModelVisible(false)}
      />
    </div>
  );
}

export default SideMenu;
