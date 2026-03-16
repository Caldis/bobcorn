// Electron API (via preload contextBridge)
const { electronAPI } = window;
// React
import React, { useState, useEffect, useRef, useCallback } from 'react';
// Antd
import { Alert, Menu, Modal, Button, Dropdown, Checkbox, Badge, Progress, message } from 'antd';
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
import type { CheckboxChangeEvent } from 'antd/es/checkbox';
import {
  AppstoreOutlined,
  BookOutlined,
  ClockCircleOutlined,
  FileExclamationOutlined,
  DeleteOutlined,
  TagsOutlined,
  PlusOutlined,
  LoginOutlined,
  SaveOutlined,
  SettingOutlined,
} from '@ant-design/icons';
const SubMenu = Menu.SubMenu;
const ButtonGroup = Button.Group;
const confirm = Modal.confirm;
const CheckboxGroup = Checkbox.Group;
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
  // 导出进度
  const [exportPhase, setExportPhase] = useState<'config' | 'exporting' | 'done' | 'error'>(
    'config'
  );
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const exportLogsEndRef = useRef<HTMLDivElement>(null);
  // 导出统计缓存 (避免渲染中反复查 DB)
  const [exportTotalIcons, setExportTotalIcons] = useState<number>(0);
  const [exportTotalGroups, setExportTotalGroups] = useState<number>(0);
  const [exportSelectedIconCount, setExportSelectedIconCount] = useState<number>(0);
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
            setEditPrefixModelVisible(false);
          });
        },
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
      setExportTotalIcons(db.getIconCount());
      setExportTotalGroups(db.getGroupList().length);
      setExportSelectedIconCount(db.getIconCount());
      setExportIconfontsModelVisible(true);
    });
  };
  const addExportLog = (msg: string) => {
    setExportLogs((prev) => [...prev, msg]);
    setTimeout(() => exportLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const handleEnsureExportIconfonts = async () => {
    const allGroupSelected =
      exportGroupSelected.length === 0 || exportGroupFullList.length === exportGroupSelected.length;
    const icons = allGroupSelected
      ? db.getIconList()
      : db.getIconListFromGroup(exportGroupSelected);
    if (!icons.length) {
      message.warning('当前项目没有任何图标可供导出');
      return;
    }

    // 先选目录
    const result = await electronAPI.showSaveDialog({
      title: '导出图标字体',
      defaultPath: `${db.getProjectName()}`,
    });
    if (result.canceled || !result.filePath) return;

    const dirPath = result.filePath;
    const projectName = db.getProjectName();

    // 切换到导出进度视图
    setExportPhase('exporting');
    setExportProgress(0);
    setExportLogs([]);

    // 使用 setTimeout 让每步有机会更新 UI
    const step = (progress: number, log: string) =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          setExportProgress(progress);
          addExportLog(log);
          resolve();
        }, 30)
      );

    try {
      await step(5, `准备导出 ${icons.length} 个图标...`);

      const groups = db.getGroupList();
      groups.push({
        id: 'resource-uncategorized',
        groupName: '未分组',
        groupOrder: -1,
        groupColor: '',
      });

      await step(10, '生成 HTML 演示页面...');
      const pageData = demoHTMLGenerator(
        groups,
        icons.map((icon: any) => Object.assign({}, icon, { iconContent: '' }))
      );

      await step(15, '生成 CSS 样式表...');
      const cssData = iconfontCSSGenerator(icons);

      await step(20, '生成 JS Symbol 引用...');
      const jsData = iconfontSymbolGenerator(icons);

      await step(25, `生成 SVG 字体 (${icons.length} glyphs)...`);
      const svgFont = await new Promise<string>((resolve, reject) => {
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
          (result: string) => (result ? resolve(result) : reject(new Error('SVG 字体生成失败'))),
          // 进度回调 — SVG 字体生成占 25%→45% 区间
          (processed: number, total: number) => {
            const pct = 25 + Math.round((processed / total) * 20);
            setExportProgress(pct);
            // 只在关键节点记日志，不刷屏
            if (processed === total) {
              addExportLog(`  SVG 字体生成完成 (${total} glyphs)`);
            }
          }
        );
      });

      await step(45, '转换 TTF 字体...');
      const ttfFont = ttfFontGenerator({ svgFont });

      await step(55, '转换 WOFF 字体...');
      const woffFont = woffFontGenerator({ ttfFont });

      await step(65, '转换 WOFF2 字体...');
      const woff2Font = woff2FontGenerator({ ttfFont });

      await step(75, '转换 EOT 字体...');
      const eotFont = eotFontGenerator({ ttfFont });

      await step(80, '导出项目文件...');
      if (!electronAPI.accessSync(dirPath)) {
        electronAPI.mkdirSync(dirPath);
      }

      const projData = await new Promise<any>((resolve) => db.exportProject(resolve));
      const buffer = Buffer.from(projData);

      const files = [
        { name: `${projectName}.icp`, data: buffer },
        { name: `${projectName}.html`, data: pageData },
        { name: `${projectName}.css`, data: cssData },
        { name: `${projectName}.js`, data: jsData },
        { name: `${projectName}.svg`, data: svgFont },
        { name: `${projectName}.ttf`, data: Buffer.from(ttfFont.buffer) },
        { name: `${projectName}.woff`, data: Buffer.from(woffFont.buffer) },
        { name: `${projectName}.woff2`, data: Buffer.from(woff2Font.buffer) },
        { name: `${projectName}.eot`, data: Buffer.from(eotFont.buffer) },
      ];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        await step(80 + Math.round(((i + 1) / files.length) * 18), `写入 ${f.name}`);
        electronAPI.writeFileSync(`${dirPath}/${f.name}`, f.data);
      }

      await step(100, `✓ 导出完成！共 ${files.length} 个文件`);
      setExportPhase('done');
    } catch (err: any) {
      console.error(err);
      const errMsg =
        err === 'Checksum error in glyf' ? '请确保路径已全部转换为轮廓' : err.message || err;
      addExportLog(`✗ 导出失败: ${errMsg}`);
      setExportPhase('error');
    }
  };

  const handleCancelExportIconfonts = () => {
    setExportIconfontsModelVisible(false);
    // 关闭后重置状态
    setTimeout(() => {
      setExportPhase('config');
      setExportProgress(0);
      setExportLogs([]);
    }, 300);
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
    setExportGroupIndeterminate(false);
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
  const onTargetGroupCheckAllChange = (e: CheckboxChangeEvent) => {
    const all = e.target.checked;
    const selected = all ? exportGroupFullList.map((group) => group.value) : [];
    setExportGroupSelected(selected);
    setExportGroupIndeterminate(false);
    setExportGroupCheckAll(all);
    setExportSelectedIconCount(all ? exportTotalIcons : 0);
  };
  const onTargetGroupChange = (checkedList: (string | number | boolean)[]) => {
    const checkedValues = checkedList as string[];
    setExportGroupSelected(checkedValues);
    const isAll = checkedValues.length === exportGroupFullList.length;
    setExportGroupIndeterminate(!!checkedValues.length && !isAll);
    setExportGroupCheckAll(isAll);
    setExportSelectedIconCount(
      isAll ? exportTotalIcons : db.getIconListFromGroup(checkedValues).length
    );
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
      <div className={cn('shrink-0', style.sideMenuOverrides)}>
        <Menu
          style={{ width: 250, border: 'none' }}
          selectedKeys={[selectedGroup]}
          onSelect={handleMenuItemSelected}
          defaultOpenKeys={['resource']}
          mode="inline"
        >
          <SubMenu
            key="resource"
            disabled={true}
            title={
              <span className="flex items-center gap-1.5">
                <AppstoreOutlined />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                  资源
                </span>
              </span>
            }
          >
            <Menu.Item key="resource-all">
              <span className="flex items-center gap-2">
                <BookOutlined />
                <span>全部</span>
                <span className="ml-auto text-xs text-foreground-muted">{db.getIconCount()}</span>
              </span>
            </Menu.Item>
            <Menu.Item key="resource-recent">
              <span className="flex items-center gap-2">
                <ClockCircleOutlined />
                <span>最近更新</span>
              </span>
            </Menu.Item>
            <Menu.Item key="resource-uncategorized">
              <span className="flex items-center gap-2">
                <FileExclamationOutlined />
                <span>未分组</span>
                <span className="ml-auto text-xs text-foreground-muted">
                  {db.getIconCountFromGroup('resource-uncategorized') +
                    db.getIconCountFromGroup('null')}
                </span>
              </span>
            </Menu.Item>
            <Menu.Item key="resource-recycleBin">
              <span className="flex items-center gap-2">
                <DeleteOutlined />
                <span>回收站</span>
                <span className="ml-auto text-xs text-foreground-muted">
                  {db.getIconCountFromGroup('resource-recycleBin')}
                </span>
              </span>
            </Menu.Item>
          </SubMenu>
        </Menu>
      </div>

      {/*分组部分 — 可滚动 + 拖拽排序*/}
      <div className="flex-1 overflow-y-auto overflow-x-hidden" ref={sideMenuWrapperRef}>
        {/* 分组标题栏 */}
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
          <TagsOutlined className="text-foreground-muted" />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            分组
          </span>
          <button
            className="ml-auto flex h-5 w-5 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-950/40"
            onClick={handleShowAddGroup}
          >
            <PlusOutlined style={{ fontSize: 11 }} />
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
      <div className="flex shrink-0 items-center gap-1.5 border-t border-border px-3 h-[49px] pb-1">
        <ButtonGroup style={{ flex: 1 }}>
          <Dropdown
            overlay={
              <Menu onClick={handleImportClick} className={style.sideImportMenu}>
                <Menu.Item key="importIcon">导入图标</Menu.Item>
                <Menu.Item key="importProj">导入项目</Menu.Item>
              </Menu>
            }
          >
            <Button className="!rounded-l-md" style={{ width: '50%' }} icon={<LoginOutlined />}>
              导入
            </Button>
          </Dropdown>
          <Button
            className="!rounded-r-md"
            style={{ width: '50%' }}
            onClick={handleExportClick}
            icon={<SaveOutlined />}
          >
            导出
          </Button>
        </ButtonGroup>
        <Button
          data-testid="settings-btn"
          type="default"
          shape="circle"
          icon={<SettingOutlined />}
          onClick={handleShowEditPrefix}
          className="shrink-0 !border-border hover:!border-brand-400 hover:!text-brand-500"
        />
      </div>

      {/*添加分组对话框*/}
      <Modal
        wrapClassName="vertical-center-modal"
        title="添加分组"
        open={addGroupModelVisible}
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
        open={editGroupModelVisible}
        onCancel={handleCancelEditGroup}
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

      {/*修改图标字体前缀对话框*/}
      <Modal
        wrapClassName="vertical-center-modal"
        title="修改图标字体前缀"
        open={editPrefixModelVisible}
        okText={'确认修改'}
        onOk={handleEnsureEditPrefix}
        cancelText={'取消'}
        onCancel={handleCancelEditPrefix}
      >
        <div className="py-2">
          <Alert
            message="请务必当心"
            description={[
              <div key="a">一旦你修改了图标字体前缀，被引用的所有图标的相应前缀都会被变更</div>,
              <div key="b">与此同时，您必须同步修改代码中所有引用到该图标的相关代码</div>,
            ]}
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

      {/*导出图标字体对话框*/}
      <Modal
        wrapClassName="vertical-center-modal"
        title={
          exportPhase === 'config'
            ? '导出图标字体'
            : exportPhase === 'done'
              ? '导出完成'
              : exportPhase === 'error'
                ? '导出失败'
                : '正在导出...'
        }
        open={exportIconfontsModelVisible}
        maskClosable={exportPhase === 'config' || exportPhase === 'done' || exportPhase === 'error'}
        closable={exportPhase !== 'exporting'}
        onCancel={handleCancelExportIconfonts}
        footer={
          exportPhase === 'config'
            ? [
                <Button key="cancel" onClick={handleCancelExportIconfonts}>
                  取消
                </Button>,
                <Button key="export" type="primary" onClick={handleEnsureExportIconfonts}>
                  导出图标字体
                </Button>,
              ]
            : exportPhase === 'done' || exportPhase === 'error'
              ? [
                  <Button key="close" type="primary" onClick={handleCancelExportIconfonts}>
                    关闭
                  </Button>,
                ]
              : null
        }
      >
        {/* 配置阶段 */}
        {exportPhase === 'config' && (
          <div className="py-2">
            <p className="text-sm text-foreground-muted leading-relaxed mb-4">
              导出图标字体能让您在网页中以图标字码或关联类名的方式直接引用图标。
            </p>

            {/* 分组选择 — 内联折叠 */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div
                className="flex items-center justify-between px-3 py-2 bg-surface-muted cursor-pointer hover:bg-surface-accent transition-colors"
                onClick={() => setExportGroupModelVisible(!exportGroupModelVisible)}
              >
                <span className="text-sm font-medium text-foreground">导出分组</span>
                <span className="text-xs text-foreground-muted">
                  {exportGroupCheckAll
                    ? `全部 (${exportTotalGroups} 个分组，${exportTotalIcons} 个图标)`
                    : `${exportGroupSelected.length} 个分组，${exportSelectedIconCount} 个图标`}
                </span>
              </div>
              {exportGroupModelVisible && (
                <div className="px-3 py-2 max-h-[200px] overflow-y-auto border-t border-border">
                  <div className="border-b border-border pb-1.5 mb-1.5">
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
              )}
            </div>

            {/* 导出格式预览 */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['SVG', 'TTF', 'WOFF', 'WOFF2', 'EOT', 'CSS', 'JS', 'HTML', 'ICP'].map((fmt) => (
                <span
                  key={fmt}
                  className="px-2 py-0.5 rounded bg-surface-muted text-xs text-foreground-muted font-mono"
                >
                  .{fmt.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 导出进度阶段 */}
        {(exportPhase === 'exporting' || exportPhase === 'done' || exportPhase === 'error') && (
          <div className="py-2">
            <Progress
              percent={exportProgress}
              status={
                exportPhase === 'error'
                  ? 'exception'
                  : exportPhase === 'done'
                    ? 'success'
                    : 'active'
              }
              strokeColor={exportPhase === 'error' ? undefined : { from: '#4096ff', to: '#52c41a' }}
            />
            <div className="mt-3 rounded-lg border border-border bg-surface-muted p-3 font-mono text-xs leading-relaxed text-foreground-muted max-h-[180px] overflow-y-auto">
              {exportLogs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    log.startsWith('✓') && 'text-green-500 font-semibold',
                    log.startsWith('✗') && 'text-red-500 font-semibold'
                  )}
                >
                  {log}
                </div>
              ))}
              <div ref={exportLogsEndRef} />
            </div>
            {exportPhase === 'done' && (
              <p className="mt-3 text-xs text-foreground-muted">
                下次需要继续编辑图标，请打开导出目录下的 .icp 文件
              </p>
            )}
          </div>
        )}
      </Modal>

      {/*导入 Cyberpen 项目对话框 (弃用）*/}
      <Modal
        wrapClassName="vertical-center-modal"
        title="发现了上古的项目文件"
        open={importCPProjModelVisible}
        onCancel={handleCancelExportIconfonts}
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
      </Modal>
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
      <span className="relative shrink-0 w-5 h-5 flex items-center justify-center">
        <span className="text-xs text-foreground-muted group-hover:opacity-0 transition-opacity">
          {db.getIconCountFromGroup(group.id)}
        </span>
        <button
          className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <SettingOutlined style={{ fontSize: 11 }} />
        </button>
      </span>
    </div>
  );
}

export default SideMenu;
