// Electron API (via preload contextBridge)
const { electronAPI } = window;
// React
import React, { useState, useEffect, useRef } from 'react';
// Antd
import { Alert, Menu, Modal, Button, Dropdown, Checkbox, Badge, message } from 'antd';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';
import {
  AppstoreOutlined,
  BookOutlined,
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
  const onTargetGroupCheckAllChange = (e: CheckboxChangeEvent) => {
    setExportGroupSelected(e.target.checked ? exportGroupFullList.map((group) => group.value) : []);
    setExportGroupIndeterminate(false);
    setExportGroupCheckAll(e.target.checked);
  };
  const onTargetGroupChange = (checkedList: (string | number | boolean)[]) => {
    const checkedValues = checkedList as string[];
    setExportGroupSelected(checkedValues);
    setExportGroupIndeterminate(
      !!checkedValues.length && checkedValues.length < exportGroupFullList.length
    );
    setExportGroupCheckAll(checkedValues.length === exportGroupFullList.length);
  };

  // 界面构建相关
  const buildGroupItems = () => {
    return groupData.map((group: GroupData) => {
      return (
        <Menu.Item key={group.id} className={style.sideMenuGroupTitleContainer}>
          {group.groupName}
          <Button
            className={style.sideMenuGroupAction}
            shape="circle"
            icon={<SettingOutlined />}
            onClick={() => handleShowEditGroup(group)}
          />
        </Menu.Item>
      );
    });
  };

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
              </span>
            </Menu.Item>
            <Menu.Item key="resource-uncategorized">
              <Badge
                count={
                  db.getIconCountFromGroup('resource-uncategorized') +
                  db.getIconCountFromGroup('null')
                }
              >
                <span className="flex items-center gap-2">
                  <FileExclamationOutlined />
                  <span>未分组</span>
                  <span>&nbsp;</span>
                  <span>&nbsp;</span>
                  <span>&nbsp;</span>
                </span>
              </Badge>
            </Menu.Item>
            <Menu.Item key="resource-recycleBin">
              <Badge count={db.getIconCountFromGroup('resource-recycleBin')}>
                <span className="flex items-center gap-2">
                  <DeleteOutlined />
                  <span>回收站</span>
                </span>
              </Badge>
            </Menu.Item>
          </SubMenu>
        </Menu>
      </div>

      {/*分组部分 — 可滚动*/}
      <div
        className={cn('flex-1 overflow-y-auto overflow-x-hidden', style.sideMenuOverrides)}
        ref={sideMenuWrapperRef}
      >
        <Menu
          style={{ width: 250, border: 'none' }}
          selectedKeys={[selectedGroup]}
          onSelect={handleMenuItemSelected}
          defaultOpenKeys={['groups']}
          mode="inline"
        >
          <SubMenu
            key="groups"
            disabled={true}
            title={
              <div className="flex items-center gap-1.5">
                <TagsOutlined />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                  分组
                </span>
                <Button
                  className={style.groupAddBtn}
                  shape="circle"
                  icon={<PlusOutlined />}
                  onClick={handleShowAddGroup}
                />
              </div>
            }
          >
            {groupData.length !== 0 && buildGroupItems()}
          </SubMenu>
        </Menu>

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
        title="导出图标字体"
        open={exportIconfontsModelVisible}
        okText="导出图标字体"
        onOk={() => {
          setExportLoadingModalVisible(true);
          setTimeout(() => handleEnsureExportIconfonts(), 500);
        }}
        cancelText={'取消'}
        onCancel={handleCancelExportIconfonts}
      >
        <div className="py-2">
          <span className="whitespace-normal text-sm leading-relaxed text-foreground-muted">
            导出图标字体能让您在网页中以图标字码,
            或关联类名的方式直接引用图标。如果您想进一步了解更详细的使用信息, 请参阅导出后所附带的
            HTML 文件。
          </span>
          <div className={cn('mt-4', style.advanceOptionContainer)}>
            <ButtonGroup>
              <Button onClick={handleShowExportGroupSelector}>选择需要导出的分组</Button>
              <Button disabled>选择需要导出的格式</Button>
            </ButtonGroup>
          </div>
        </div>
        <span className="mt-2 inline-block text-xs text-foreground-muted">
          当前项目共有 {db.getIconCount()} 个图标
        </span>
      </Modal>

      {/*导出分组选择对话框*/}
      <Modal
        wrapClassName="vertical-center-modal"
        title="选择导出的分组"
        open={exportGroupModelVisible}
        okText="确认"
        onOk={handleExportGroupSelectorEnsure}
        cancelText={'取消'}
        onCancel={handleCancelExportGroupSelector}
      >
        <div className={cn('overflow-y-auto', style.targetGroupContainer)}>
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
      </Modal>

      {/*正在导出提示框*/}
      <Modal
        wrapClassName="vertical-center-modal"
        title="正在生成"
        maskClosable={false}
        closable={true}
        open={exportLoadingModalVisible}
        onCancel={handleHideGeneratingOverlay}
        footer={null}
      >
        <div className="py-2 text-sm text-foreground-muted">
          <p>正在生成图标字体, 请稍后</p>
          <p className="mt-2">如果下次需要继续编辑图标, 请打开导出目录下文件后缀为 "icp" 的文件</p>
        </div>
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

export default SideMenu;
