// Electron API (via preload contextBridge)
const { electronAPI } = window;
// React
import React, { useState, useEffect, useRef, useCallback } from 'react';
// UI
import {
  Dialog,
  confirm,
  Button,
  ButtonGroup,
  Dropdown,
  Checkbox,
  CheckboxGroup,
  Badge,
  message,
  Alert,
} from '../ui';
// DnD Kit (分组拖拽排序)
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
// Icons
import {
  LayoutGrid,
  BookOpen,
  FileWarning,
  Trash2,
  Tags,
  Plus,
  LogIn,
  Save,
  Settings,
} from 'lucide-react';
// Components
import EnhanceInput from '../enhance/input';
// Config
import config from '../../config';
// Style
import style from './index.module.css';
// Utils
import { cn } from '../../lib/utils';
import { isnContainSpace, platform } from '../../utils/tools';
import { cpLoader, icpLoader } from '../../utils/loaders';
import {
  svgFontGenerator,
  ttfFontGenerator,
  woffFontGenerator,
  woff2FontGenerator,
  eotFontGenerator,
} from '../../utils/generators/iconfontGenerator';
import {
  demoHTMLGenerator,
  iconfontCSSGenerator,
  iconfontSymbolGenerator,
} from '../../utils/generators/demopageGenerator';
import { iconImporter, projImporter } from '../../utils/importer';
// Database
import db from '../../database';
// Images
import addGroupHint from '../../resources/imgs/nodata/addGroupHint.png';
// Store
import useAppStore from '../../store';

interface GroupData {
  id: string;
  groupName: string;
  groupOrder?: number;
  groupColor?: string;
  [key: string]: any;
}

interface ExportGroupOption {
  label: string;
  value: string;
}

interface SideMenuProps {
  handleGroupSelected: (groupId: string) => void;
  selectedGroup: string;
}

function SideMenu({ handleGroupSelected, selectedGroup: selectedGroupProp }: SideMenuProps) {
  const groupData: GroupData[] = useAppStore((state: any) => state.groupData);
  const syncLeft = useAppStore((state: any) => state.syncLeft);
  const selectGroup = useAppStore((state: any) => state.selectGroup);

  const [selectedGroup, setSelectedGroup] = useState<string>(config.defaultSelectedGroup);
  // 创建新分组相关
  const [addGroupModelVisible, setAddGroupModelVisible] = useState<boolean>(false);
  const [newGroupNameText, setNewGroupNameText] = useState<string | null>(null);
  const [newGroupNameErrText, setNewGroupNameErrText] = useState<string | null>(null);
  // 组编辑对话框相关
  const [editingGroupData, setEditingGroupData] = useState<GroupData | null>(null);
  const [editGroupModelVisible, setEditGroupModelVisible] = useState<boolean>(false);
  const [groupNameChangeModelVisible, setGroupNameChangeModelVisible] = useState<boolean>(false);
  const [editingGroupNameText, setEditingGroupNameText] = useState<string | null>(null);
  const [editingGroupNameErrText, setEditingGroupNameErrText] = useState<string | null>(null);
  const [deleteGroupModelVisible, setDeleteGroupModelVisible] = useState<boolean>(false);
  // 前缀编辑相关
  const [editPrefixModelVisible, setEditPrefixModelVisible] = useState<boolean>(false);
  const [editingPrefixText, setEditingPrefixText] = useState<string | null>(null);
  const [editingPrefixErrText, setEditingPrefixErrText] = useState<string | null>(null);
  // 导出对话框相关
  const [exportIconfontsModelVisible, setExportIconfontsModelVisible] = useState<boolean>(false);
  const [exportGroupFullList, setExportGroupFullList] = useState<ExportGroupOption[]>([]);
  const [exportGroupSelected, setExportGroupSelected] = useState<string[]>([]);
  const [exportGroupIndeterminate, setExportGroupIndeterminate] = useState<boolean>(true);
  const [exportGroupCheckAll, setExportGroupCheckAll] = useState<boolean>(true);
  const [exportGroupModelVisible, setExportGroupModelVisible] = useState<boolean>(false);
  const [exportLoadingModalVisible, setExportLoadingModalVisible] = useState<boolean>(false);
  // 导入对话框相关
  const [importCPProjModelVisible, setImportCPProjModelVisible] = useState<boolean>(false);

  const sideMenuWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 初始化同步
    syncLeft();
  }, []);

  useEffect(() => {
    if (selectedGroupProp !== selectedGroup) {
      setSelectedGroup(selectedGroupProp);
    }
  }, [selectedGroupProp]);

  // 菜单相关
  const handleMenuItemSelected = (e: { key: string }) => {
    setSelectedGroup(e.key);
    handleGroupSelected(e.key);
  };

  // 添加分组
  const handleShowAddGroup = () => {
    setAddGroupModelVisible(true);
    setNewGroupNameText(null);
    setNewGroupNameErrText(null);
  };
  const handleEnsureAddGroup = () => {
    if (newGroupNameText) {
      db.addGroup(newGroupNameText, (group: GroupData) => {
        message.success('添加分组成功');
        syncLeft();
        setSelectedGroup(group.id);
        setAddGroupModelVisible(false);
        handleGroupSelected(group.id);
        if (sideMenuWrapperRef.current) {
          sideMenuWrapperRef.current.scrollTop = 100000;
        }
      });
    } else {
      setNewGroupNameErrText('请输入一个分组名称');
    }
  };
  const handleCancelAddGroup = () => {
    setAddGroupModelVisible(false);
  };
  const onNewGroupNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewGroupNameText(e.target.value);
  };

  // 编辑分组
  const handleShowEditGroup = (group: GroupData) => {
    setEditingGroupData(group);
    setEditGroupModelVisible(true);
  };
  const handleCancelEditGroup = () => {
    setEditGroupModelVisible(false);
  };

  // 修改组名
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
        setSelectedGroup(editingGroupData!.id);
        setGroupNameChangeModelVisible(false);
        setEditGroupModelVisible(false);
        handleGroupSelected(editingGroupData!.id);
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

  // 修改图标字体前缀
  const handleShowEditPrefix = () => {
    setEditPrefixModelVisible(true);
    setEditingPrefixText(db.getProjectName());
    setEditingPrefixErrText(null);
  };
  const handleEnsureEditPrefix = () => {
    if (isnContainSpace(editingPrefixText)) {
      db.setProjectName(editingPrefixText, () => {
        message.success('图标字体前缀已修改');
        syncLeft();
        setEditPrefixModelVisible(false);
      });
    } else {
      setEditingPrefixErrText('图标字体前缀不能为空或包含空格');
    }
  };
  const handleCancelEditPrefix = () => {
    setEditPrefixModelVisible(false);
  };
  const onEditingPrefixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingPrefixText(e.target.value);
  };

  // 删除分组
  const handleShowDeleteGroup = () => {
    setDeleteGroupModelVisible(true);
  };
  const handleEnsureDeleteGroup = () => {
    db.delGroup(editingGroupData!.id, () => {
      message.success('分组已删除');
      syncLeft();
      setSelectedGroup('resource-all');
      setDeleteGroupModelVisible(false);
      setEditGroupModelVisible(false);
      handleGroupSelected('resource-all');
    });
  };
  const handleCancelDeleteGroup = () => {
    setDeleteGroupModelVisible(false);
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
    // When called directly (not from dropdown), treat as exportIconfonts
    const key = e && 'key' in e && e.key ? e.key : 'exportIconfonts';
    switch (key) {
      case 'exportIconfonts':
        handleShowExportIconfonts();
        break;
      case 'exportProject':
        handleExportProjects();
        break;
      default:
        handleShowExportIconfonts();
        break;
    }
  };

  // 导出图标字体相关
  const handleShowExportIconfonts = () => {
    handleUpdateSelectableGroupList(() => {
      setExportIconfontsModelVisible(true);
    });
  };
  const handleEnsureExportIconfonts = () => {
    const allGroupSelected =
      exportGroupSelected.length === 0 || exportGroupFullList.length === exportGroupSelected.length;
    const icons = allGroupSelected
      ? db.getIconList()
      : db.getIconListFromGroup(exportGroupSelected);
    if (icons.length) {
      try {
        const groups = db.getGroupList();
        groups.push({
          id: 'resource-uncategorized',
          groupName: '未分组',
          groupOrder: -1,
          groupColor: '',
        });
        const pageData = demoHTMLGenerator(
          groups,
          icons.map((icon: any) => {
            return Object.assign({}, icon, { iconContent: '' });
          })
        );
        const cssData = iconfontCSSGenerator(icons);
        const jsData = iconfontSymbolGenerator(icons);
        const projectName = db.getProjectName();
        svgFontGenerator(
          {
            icons,
            options: {
              fontName: projectName,
              normalize: true,
              fixedWidth: true,
              fontHeight: 1024,
              fontWeight: 400,
              centerHorizontally: true,
              round: 1000,
              log: () => {},
            },
          },
          (svgFont: string) => {
            if (!svgFont) {
              message.error('字体生成失败，请检查图标数据是否正确');
              handleHideGeneratingOverlay();
              handleCancelExportIconfonts();
              return;
            }
            try {
              const ttfFont = ttfFontGenerator({ svgFont });
              const woffFont = woffFontGenerator({ ttfFont });
              const woff2Font = woff2FontGenerator({ ttfFont });
              const eotFont = eotFontGenerator({ ttfFont });
              electronAPI
                .showSaveDialog({
                  title: '导出图标字体',
                  defaultPath: `${db.getProjectName()}`,
                })
                .then((result) => {
                  if (result.canceled || !result.filePath) {
                    handleHideGeneratingOverlay();
                    return;
                  }
                  const dirPath = result.filePath;
                  if (!electronAPI.accessSync(dirPath)) {
                    electronAPI.mkdirSync(dirPath);
                  }
                  try {
                    db.exportProject((projData: any) => {
                      const buffer = Buffer.from(projData);
                      electronAPI.writeFileSync(`${dirPath}/${projectName}.icp`, buffer);
                      electronAPI.writeFileSync(`${dirPath}/${projectName}.html`, pageData);
                      electronAPI.writeFileSync(`${dirPath}/${projectName}.css`, cssData);
                      electronAPI.writeFileSync(`${dirPath}/${projectName}.js`, jsData);
                      electronAPI.writeFileSync(`${dirPath}/${projectName}.svg`, svgFont);
                      electronAPI.writeFileSync(
                        `${dirPath}/${projectName}.ttf`,
                        Buffer.from(ttfFont.buffer)
                      );
                      electronAPI.writeFileSync(
                        `${dirPath}/${projectName}.woff`,
                        Buffer.from(woffFont.buffer)
                      );
                      electronAPI.writeFileSync(
                        `${dirPath}/${projectName}.woff2`,
                        Buffer.from(woff2Font.buffer)
                      );
                      electronAPI.writeFileSync(
                        `${dirPath}/${projectName}.eot`,
                        Buffer.from(eotFont.buffer)
                      );
                      message.success(`图标字体已导出`);
                      handleHideGeneratingOverlay();
                      handleCancelExportIconfonts();
                    });
                  } catch (err: any) {
                    message.error(`导出错误: ${err.message}`);
                    handleHideGeneratingOverlay();
                    handleCancelExportIconfonts();
                  }
                });
            } catch (err: any) {
              console.error(err);
              let errMsg = err;
              if (err === 'Checksum error in glyf') {
                errMsg = '请确保路径已全部转换为轮廓';
              }
              message.error(`导出错误: ${errMsg}`);
              handleHideGeneratingOverlay();
              handleCancelExportIconfonts();
            }
          }
        );
      } catch (err: any) {
        import.meta.env?.DEV && console.error('Export preparation error:', err);
        message.error(`导出准备失败: ${err.message || err}`);
        handleHideGeneratingOverlay();
        handleCancelExportIconfonts();
      }
    } else {
      message.warning(`当前项目没有任何图标可供导出`);
      handleHideGeneratingOverlay();
    }
  };
  const handleCancelExportIconfonts = () => {
    setExportIconfontsModelVisible(false);
  };

  const handleHideGeneratingOverlay = () => {
    setExportLoadingModalVisible(false);
  };

  // 导出项目文件相关
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

  // 选择导出的分组相关
  const handleShowExportGroupSelector = () => {
    setExportGroupModelVisible(true);
  };
  const handleUpdateSelectableGroupList = (callback?: () => void) => {
    const groupList: ExportGroupOption[] = db.getGroupList().map((group: any) => {
      return {
        label: group.groupName,
        value: group.id,
      };
    });
    setExportGroupFullList(groupList);
    setExportGroupSelected(groupList.map((group) => group.value));
    setExportGroupIndeterminate(true);
    setExportGroupCheckAll(true);
    callback && callback();
  };
  const handleExportGroupSelectorEnsure = () => {
    if (exportGroupSelected.length === 0) {
      message.error(`请选择至少一个分组`);
    } else {
      setExportGroupModelVisible(false);
    }
  };
  const handleCancelExportGroupSelector = () => {
    setExportGroupModelVisible(false);
  };
  const onTargetGroupCheckAllChange = (checked: boolean) => {
    setExportGroupSelected(checked ? exportGroupFullList.map((group) => group.value) : []);
    setExportGroupIndeterminate(false);
    setExportGroupCheckAll(checked);
  };
  const onTargetGroupChange = (checkedValues: string[]) => {
    setExportGroupSelected(checkedValues);
    setExportGroupIndeterminate(
      !!checkedValues.length && checkedValues.length < exportGroupFullList.length
    );
    setExportGroupCheckAll(checkedValues.length === exportGroupFullList.length);
  };

  // 分组拖拽排序
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = groupData.findIndex((g: GroupData) => g.id === active.id);
      const newIndex = groupData.findIndex((g: GroupData) => g.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(groupData, oldIndex, newIndex);
      db.reorderGroups(newOrder.map((g: GroupData) => g.id));
      syncLeft();
    },
    [groupData]
  );

  return (
    <div className="relative flex h-full w-full flex-col bg-surface dark:bg-surface">
      {/*OSX系统标题栏占位区域*/}
      {platform() === 'darwin' && <div className={style.osxDrag} />}

      {/*Win32系统标题栏可拖动区域*/}
      {platform() === 'win32' && <div className={style.win32Drag} />}

      {/*资源部分 — 固定在顶部不滚动*/}
      <div className="shrink-0">
        <div className="w-[250px] py-1">
          {/* Resource section header */}
          <div className="px-4 py-2">
            <span className="flex items-center gap-1.5">
              <LayoutGrid size={14} className="text-foreground-muted" />
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                资源
              </span>
            </span>
          </div>
          {/* Resource menu items */}
          <div className="px-1">
            <button
              onClick={() => handleMenuItemSelected({ key: 'resource-all' })}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                selectedGroup === 'resource-all'
                  ? 'bg-brand-50 text-brand-600 font-medium dark:bg-brand-950/40 dark:text-brand-400'
                  : 'text-foreground hover:bg-surface-muted dark:hover:bg-white/5'
              )}
            >
              <BookOpen size={14} />
              <span>全部</span>
            </button>
            <button
              onClick={() => handleMenuItemSelected({ key: 'resource-uncategorized' })}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                selectedGroup === 'resource-uncategorized'
                  ? 'bg-brand-50 text-brand-600 font-medium dark:bg-brand-950/40 dark:text-brand-400'
                  : 'text-foreground hover:bg-surface-muted dark:hover:bg-white/5'
              )}
            >
              <FileWarning size={14} />
              <span>未分组</span>
              <Badge
                count={
                  db.getIconCountFromGroup('resource-uncategorized') +
                  db.getIconCountFromGroup('null')
                }
              />
            </button>
            <button
              onClick={() => handleMenuItemSelected({ key: 'resource-recycleBin' })}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                selectedGroup === 'resource-recycleBin'
                  ? 'bg-brand-50 text-brand-600 font-medium dark:bg-brand-950/40 dark:text-brand-400'
                  : 'text-foreground hover:bg-surface-muted dark:hover:bg-white/5'
              )}
            >
              <Trash2 size={14} />
              <span>回收站</span>
              <Badge count={db.getIconCountFromGroup('resource-recycleBin')} />
            </button>
          </div>
        </div>
      </div>

      {/*分组部分 — 可滚动 + 拖拽排序*/}
      <div className="flex-1 overflow-y-auto overflow-x-hidden" ref={sideMenuWrapperRef}>
        {/* 分组标题栏 */}
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
          <Tags size={14} className="text-foreground-muted" />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            分组
          </span>
          <button
            className="ml-auto flex h-5 w-5 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-950/40"
            onClick={handleShowAddGroup}
          >
            <Plus size={11} />
          </button>
        </div>

        {/* 可排序分组列表 */}
        {groupData.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={groupData.map((g: GroupData) => g.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="px-1 py-1">
                {groupData.map((group: GroupData) => (
                  <SortableGroupItem
                    key={group.id}
                    group={group}
                    isSelected={selectedGroup === group.id}
                    onSelect={() => handleMenuItemSelected({ key: group.id })}
                    onEdit={() => handleShowEditGroup(group)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {groupData.length === 0 && (
          <div
            className="absolute left-0 z-10 flex w-full flex-col items-center justify-center text-center text-foreground-muted"
            style={{ top: 'calc(44vh)' }}
          >
            <img className="mx-auto w-[120px] opacity-60" src={addGroupHint} alt="添加分组" />
            <p className="mb-1 mt-3 text-sm">还没有分组</p>
            <p className="text-xs text-foreground-muted">点击上方的 "+"可以创建分组</p>
          </div>
        )}
      </div>

      {/*导出导入按钮*/}
      <div className="flex shrink-0 items-center gap-1.5 border-t border-border px-3 py-2">
        <ButtonGroup style={{ flex: 1 }}>
          <Dropdown
            menu={{
              items: [
                { key: 'importIcon', label: '导入图标' },
                { key: 'importProj', label: '导入项目' },
              ],
              onClick: handleImportClick,
            }}
          >
            <Button className="!rounded-l-md" style={{ width: '50%' }} icon={<LogIn size={14} />}>
              导入
            </Button>
          </Dropdown>
          <Button
            className="!rounded-r-md"
            style={{ width: '50%' }}
            onClick={handleExportClick}
            icon={<Save size={14} />}
          >
            导出
          </Button>
        </ButtonGroup>
        <Button
          data-testid="settings-btn"
          type="default"
          shape="circle"
          icon={<Settings size={14} />}
          onClick={handleShowEditPrefix}
          className="shrink-0 !border-border hover:!border-brand-400 hover:!text-brand-500"
        />
      </div>

      {/*添加分组对话框*/}
      <Dialog
        title="添加分组"
        open={addGroupModelVisible}
        onClose={handleCancelAddGroup}
        footer={[
          <Button key="cancel" onClick={handleCancelAddGroup}>
            取消
          </Button>,
          <Button key="ok" type="primary" onClick={handleEnsureAddGroup}>
            确认
          </Button>,
        ]}
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
      </Dialog>

      {/*编辑分组对话框*/}
      <Dialog
        title="编辑分组"
        open={editGroupModelVisible}
        onClose={handleCancelEditGroup}
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
      </Dialog>

      {/*修改组名对话框*/}
      <Dialog
        title="修改分组名称"
        open={groupNameChangeModelVisible}
        onClose={handleCancelGroupNameChange}
        footer={[
          <Button key="cancel" onClick={handleCancelGroupNameChange}>
            取消
          </Button>,
          <Button key="ok" type="primary" onClick={handleEnsureGroupNameChange}>
            确认修改
          </Button>,
        ]}
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
      </Dialog>

      {/*修改图标字体前缀对话框*/}
      <Dialog
        title="修改图标字体前缀"
        open={editPrefixModelVisible}
        onClose={handleCancelEditPrefix}
        footer={[
          <Button key="cancel" onClick={handleCancelEditPrefix}>
            取消
          </Button>,
          <Button key="ok" type="primary" onClick={handleEnsureEditPrefix}>
            确认修改
          </Button>,
        ]}
      >
        <div className="py-2">
          <Alert
            message="请务必当心"
            description={
              <div>
                <div>一旦你修改了图标字体前缀，被引用的所有图标的相应前缀都会被变更</div>
                <div>与此同时，您必须同步修改代码中所有引用到该图标的相关代码</div>
              </div>
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

      {/*删除分组对话框*/}
      <Dialog
        title="删除分组"
        open={deleteGroupModelVisible}
        onClose={handleCancelDeleteGroup}
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
      </Dialog>

      {/*导出图标字体对话框*/}
      <Dialog
        title="导出图标字体"
        open={exportIconfontsModelVisible}
        onClose={handleCancelExportIconfonts}
        footer={[
          <Button key="cancel" onClick={handleCancelExportIconfonts}>
            取消
          </Button>,
          <Button
            key="ok"
            type="primary"
            onClick={() => {
              setExportLoadingModalVisible(true);
              setTimeout(() => handleEnsureExportIconfonts(), 500);
            }}
          >
            导出图标字体
          </Button>,
        ]}
      >
        <div className="py-2">
          <span className="whitespace-normal text-sm leading-relaxed text-foreground-muted">
            导出图标字体能让您在网页中以图标字码,
            或关联类名的方式直接引用图标。如果您想进一步了解更详细的使用信息, 请参阅导出后所附带的
            HTML 文件。
          </span>
          <div className="mt-4">
            <ButtonGroup>
              <Button onClick={handleShowExportGroupSelector}>选择需要导出的分组</Button>
              <Button disabled>选择需要导出的格式</Button>
            </ButtonGroup>
          </div>
        </div>
        <span className="mt-2 inline-block text-xs text-foreground-muted">
          当前项目共有 {db.getIconCount()} 个图标
        </span>
      </Dialog>

      {/*导出分组选择对话框*/}
      <Dialog
        title="选择导出的分组"
        open={exportGroupModelVisible}
        onClose={handleCancelExportGroupSelector}
        footer={[
          <Button key="cancel" onClick={handleCancelExportGroupSelector}>
            取消
          </Button>,
          <Button key="ok" type="primary" onClick={handleExportGroupSelectorEnsure}>
            确认
          </Button>,
        ]}
      >
        <div className="overflow-y-auto max-h-[60vh]">
          <div className="border-b border-border pb-1.5">
            <Checkbox
              indeterminate={exportGroupIndeterminate}
              onChange={onTargetGroupCheckAllChange}
              checked={exportGroupCheckAll}
            >
              全选
            </Checkbox>
          </div>
          <CheckboxGroup
            options={exportGroupFullList}
            value={exportGroupSelected}
            onChange={onTargetGroupChange}
          />
        </div>
      </Dialog>

      {/*正在导出提示框*/}
      <Dialog
        title="正在生成"
        maskClosable={false}
        closable={true}
        open={exportLoadingModalVisible}
        onClose={handleHideGeneratingOverlay}
        footer={null}
      >
        <div className="py-2 text-sm text-foreground-muted">
          <p>正在生成图标字体, 请稍后</p>
          <p className="mt-2">如果下次需要继续编辑图标, 请打开导出目录下文件后缀为 "icp" 的文件</p>
        </div>
      </Dialog>

      {/*导入 Cyberpen 项目对话框 (弃用）*/}
      <Dialog
        title="发现了上古的项目文件"
        open={importCPProjModelVisible}
        onClose={handleCancelExportIconfonts}
        footer={[
          <Button key="back" size="large" onClick={() => setImportCPProjModelVisible(false)}>
            取消
          </Button>,
          <Button disabled key="combine" type="primary" size="large">
            导入并与当前项目合并
          </Button>,
          <Button key="replace" type="primary" size="large">
            导入并覆盖当前项目
          </Button>,
        ]}
      >
        <div className="py-2">
          <span className="whitespace-normal text-sm leading-relaxed text-foreground-muted">
            所选择的项目文件是 CyberPen 所导出的项目文件。 从此工具中导出的项目文件在 CyberPen
            中无法再次编辑。 不过您完全可以使用本工具来替代 CyberPen。
          </span>
        </div>
      </Dialog>
    </div>
  );
}

// 可排序分组项组件
function SortableGroupItem({
  group,
  isSelected,
  onSelect,
  onEdit,
}: {
  group: GroupData;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
  });
  const itemStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={itemStyle}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={cn(
        'group flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm transition-colors',
        isSelected
          ? 'bg-brand-50 text-brand-600 font-medium dark:bg-brand-950/40 dark:text-brand-400'
          : 'text-foreground hover:bg-surface-muted dark:hover:bg-white/5',
        isDragging && 'shadow-md ring-1 ring-brand-300 dark:ring-brand-700'
      )}
    >
      <span className="flex-1 truncate">{group.groupName}</span>
      <button
        className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        <Settings size={11} />
      </button>
    </div>
  );
}

export default SideMenu;
