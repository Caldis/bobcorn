// Electron API (via preload contextBridge)
const { electronAPI } = window;
// React
import React, { useState, useEffect, useRef } from 'react';
// Antd
import { Alert, Menu, Modal, Button, Dropdown, Checkbox, Badge, message } from 'antd';
import { AppstoreOutlined, BookOutlined, FileExclamationOutlined, DeleteOutlined, TagsOutlined, PlusOutlined, LoginOutlined, SaveOutlined, SettingOutlined } from '@ant-design/icons';
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
import { isnContainSpace, platform } from '../../utils/tools';
import { cpLoader, icpLoader } from '../../utils/loaders';
import {
    svgFontGenerator,
    ttfFontGenerator,
    woffFontGenerator,
    woff2FontGenerator,
    eotFontGenerator
} from '../../utils/generators/iconfontGenerator';
import { demoHTMLGenerator, iconfontCSSGenerator, iconfontSymbolGenerator } from '../../utils/generators/demopageGenerator';
import { iconImporter, projImporter } from '../../utils/importer';
// Database
import db, { Database } from '../../database';
// Images
import addGroupHint from '../../resources/imgs/nodata/addGroupHint.png';
// Store
import useAppStore from '../../store';

function SideMenu({ handleGroupSelected, selectedGroup: selectedGroupProp }) {
    const groupData = useAppStore(state => state.groupData);
    const syncLeft = useAppStore(state => state.syncLeft);
    const selectGroup = useAppStore(state => state.selectGroup);

    const [selectedGroup, setSelectedGroup] = useState(config.defaultSelectedGroup);
    // 创建新分组相关
    const [addGroupModelVisible, setAddGroupModelVisible] = useState(false);
    const [newGroupNameText, setNewGroupNameText] = useState(null);
    const [newGroupNameErrText, setNewGroupNameErrText] = useState(null);
    // 组编辑对话框相关
    const [editingGroupData, setEditingGroupData] = useState(null);
    const [editGroupModelVisible, setEditGroupModelVisible] = useState(false);
    const [groupNameChangeModelVisible, setGroupNameChangeModelVisible] = useState(false);
    const [editingGroupNameText, setEditingGroupNameText] = useState(null);
    const [editingGroupNameErrText, setEditingGroupNameErrText] = useState(null);
    const [deleteGroupModelVisible, setDeleteGroupModelVisible] = useState(false);
    // 前缀编辑相关
    const [editPrefixModelVisible, setEditPrefixModelVisible] = useState(false);
    const [editingPrefixText, setEditingPrefixText] = useState(null);
    const [editingPrefixErrText, setEditingPrefixErrText] = useState(null);
    // 导出对话框相关
    const [exportIconfontsModelVisible, setExportIconfontsModelVisible] = useState(false);
    const [exportGroupFullList, setExportGroupFullList] = useState([]);
    const [exportGroupSelected, setExportGroupSelected] = useState([]);
    const [exportGroupIndeterminate, setExportGroupIndeterminate] = useState(true);
    const [exportGroupCheckAll, setExportGroupCheckAll] = useState(true);
    const [exportGroupModelVisible, setExportGroupModelVisible] = useState(false);
    const [exportLoadingModalVisible, setExportLoadingModalVisible] = useState(false);
    // 导入对话框相关
    const [importCPProjModelVisible, setImportCPProjModelVisible] = useState(false);

    const sideMenuWrapperRef = useRef(null);

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
    const handleMenuItemSelected = (e) => {
        setSelectedGroup(e.key);
        console.log(e.key);
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
            db.addGroup(newGroupNameText, (group) => {
                message.success("添加分组成功");
                syncLeft();
                setSelectedGroup(group.id);
                setAddGroupModelVisible(false);
                handleGroupSelected(group.id);
                if (sideMenuWrapperRef.current) {
                    sideMenuWrapperRef.current.scrollTop = 100000;
                }
            });
        } else {
            setNewGroupNameErrText("请输入一个分组名称");
        }
    };
    const handleCancelAddGroup = () => {
        setAddGroupModelVisible(false);
    };
    const onNewGroupNameChange = (e) => {
        setNewGroupNameText(e.target.value);
    };

    // 编辑分组
    const handleShowEditGroup = (group) => {
        setEditingGroupData(group);
        setEditGroupModelVisible(true);
    };
    const handleCancelEditGroup = () => {
        setEditGroupModelVisible(false);
    };

    // 修改组名
    const handleShowGroupNameChange = () => {
        setGroupNameChangeModelVisible(true);
        setEditingGroupNameText(editingGroupData.groupName);
        setEditingGroupNameErrText(null);
    };
    const handleEnsureGroupNameChange = () => {
        if (editingGroupNameText) {
            db.setGroupName(editingGroupData.id, editingGroupNameText, () => {
                message.success("组名已修改");
                syncLeft();
                setSelectedGroup(editingGroupData.id);
                setGroupNameChangeModelVisible(false);
                setEditGroupModelVisible(false);
                handleGroupSelected(editingGroupData.id);
            });
        } else {
            setEditingGroupNameErrText("分组名称不能为空");
        }
    };
    const handleCancelGroupNameChange = () => {
        setGroupNameChangeModelVisible(false);
    };
    const onEditingGroupNameChange = (e) => {
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
                message.success("图标字体前缀已修改");
                syncLeft();
                setEditPrefixModelVisible(false);
            });
        } else {
            setEditingPrefixErrText("图标字体前缀不能为空或包含空格");
        }
    };
    const handleCancelEditPrefix = () => {
        setEditPrefixModelVisible(false);
    };
    const onEditingPrefixChange = (e) => {
        setEditingPrefixText(e.target.value);
    };

    // 删除分组
    const handleShowDeleteGroup = () => {
        setDeleteGroupModelVisible(true);
    };
    const handleEnsureDeleteGroup = () => {
        db.delGroup(editingGroupData.id, () => {
            message.success("分组已删除");
            syncLeft();
            setSelectedGroup("resource-all");
            setDeleteGroupModelVisible(false);
            setEditGroupModelVisible(false);
            handleGroupSelected("resource-all");
        });
    };
    const handleCancelDeleteGroup = () => {
        setDeleteGroupModelVisible(false);
    };

    // 导入相关
    const handleImportClick = (e) => {
        if (e.key === "importIcon") {
            iconImporter({
                onSelectSVG: (files) => {
                    db.addIcons(files, selectedGroup, () => {
                        message.success(`已成功导入 ${files.length} 个图标`);
                        syncLeft();
                    });
                }
            });
        }
        if (e.key === "importProj") {
            projImporter({
                onSelectCP: (project) => {
                    setTimeout(() => {
                        confirm({
                            title: "导入项目",
                            content: "导入所选的项目后, 当前正在编辑的项目将会被覆盖, 确认要导入吗 ?",
                            okText: "导入",
                            onOk() {
                                cpLoader({ data: project.data }, () => {
                                    message.success(`项目已导入`);
                                    syncLeft();
                                    selectGroup("resource-all");
                                });
                            },
                            onCancel() {
                                message.warning(`导入已取消`);
                            },
                        });
                    }, 250);
                },
                onSelectICP: (project) => {
                    setTimeout(() => {
                        confirm({
                            title: "导入项目",
                            content: "导入所选的项目后, 当前正在编辑的项目将会被覆盖, 确认要导入吗 ?",
                            okText: "导入",
                            onOk() {
                                icpLoader(project.data, () => {
                                    message.success(`项目已导入`);
                                    syncLeft();
                                    selectGroup("resource-all");
                                });
                            },
                            onCancel() {
                                message.warning(`导入已取消`);
                            },
                        });
                    }, 250);
                }
            });
        }
    };

    // 导出相关
    const handleExportClick = (e) => {
        // When called directly (not from dropdown), treat as exportIconfonts
        const key = e && e.key ? e.key : "exportIconfonts";
        switch (key) {
            case "exportIconfonts":
                handleShowExportIconfonts();
                break;
            case "exportProject":
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
        const allGroupSelected = exportGroupSelected.length === 0 || exportGroupFullList.length === exportGroupSelected.length;
        const icons = allGroupSelected ? db.getIconList() : db.getIconListFromGroup(exportGroupSelected);
        if (icons.length) {
            const groups = db.getGroupList();
            groups.push({ id:"resource-uncategorized", groupName:"未分组", groupOrder:-1, groupColor:"" });
            const pageData = demoHTMLGenerator(groups, icons.map(icon => {
                return Object.assign({}, icon, { iconContent: "" });
            }));
            const cssData = iconfontCSSGenerator(icons);
            const jsData = iconfontSymbolGenerator(icons);
            const projectName = db.getProjectName();
            svgFontGenerator({
                icons,
                options: {
                    fontName: projectName,
                    normalize: true,
                    fixedWidth: true,
                    fontHeight: 1024,
                    fontWeight: 400,
                    centerHorizontally: true,
                    round: 1000,
                    log: () => {}
                }
            }, (svgFont) => {
                try {
                    const ttfFont = ttfFontGenerator({svgFont});
                    const woffFont = woffFontGenerator({ttfFont});
                    const woff2Font = woff2FontGenerator({ttfFont});
                    const eotFont = eotFontGenerator({ttfFont});
                    electronAPI.showSaveDialog({
                        title: "导出图标字体",
                        defaultPath: `${db.getProjectName()}`
                    }).then((result) => {
                        if (result.canceled || !result.filePath) {
                            handleHideGeneratingOverlay();
                            return;
                        }
                        const dirPath = result.filePath;
                        if (!electronAPI.accessSync(dirPath)) {
                            electronAPI.mkdirSync(dirPath);
                        }
                        try {
                            db.exportProject(projData => {
                                const buffer = Buffer.from(projData);
                                electronAPI.writeFileSync(`${dirPath}/${projectName}.icp`, buffer);
                                electronAPI.writeFileSync(`${dirPath}/${projectName}.html`, pageData);
                                electronAPI.writeFileSync(`${dirPath}/${projectName}.css`, cssData);
                                electronAPI.writeFileSync(`${dirPath}/${projectName}.js`, jsData);
                                electronAPI.writeFileSync(`${dirPath}/${projectName}.svg`, svgFont);
                                electronAPI.writeFileSync(`${dirPath}/${projectName}.ttf`, Buffer.from(ttfFont.buffer));
                                electronAPI.writeFileSync(`${dirPath}/${projectName}.woff`, Buffer.from(woffFont.buffer));
                                electronAPI.writeFileSync(`${dirPath}/${projectName}.woff2`, Buffer.from(woff2Font.buffer));
                                electronAPI.writeFileSync(`${dirPath}/${projectName}.eot`, Buffer.from(eotFont.buffer));
                                message.success(`图标字体已导出`);
                                handleHideGeneratingOverlay();
                                handleCancelExportIconfonts();
                            });
                        } catch (err) {
                            message.error(`导出错误: ${err.message}`);
                            handleHideGeneratingOverlay();
                            handleCancelExportIconfonts();
                        }
                    });
                } catch(err) {
                    console.error(err);
                    let errMsg = err;
                    if (err === "Checksum error in glyf") {
                        errMsg = "请确保路径已全部转换为轮廓";
                    }
                    message.error(`导出错误: ${errMsg}`);
                    handleHideGeneratingOverlay();
                    handleCancelExportIconfonts();
                }
            });
        } else {
            message.warning(`当前项目没有任何图标可供导出`);
            handleHideGeneratingOverlay();
        }
    };
    const handleCancelExportIconfonts = () => {
        setExportIconfontsModelVisible(false);
    };

    const handleShowGeneratingOverlay = () => {
        setExportLoadingModalVisible(true);
    };
    const handleHideGeneratingOverlay = () => {
        setExportLoadingModalVisible(false);
    };

    // 导出项目文件相关
    const handleExportProjects = async () => {
        const result = await electronAPI.showSaveDialog({
            title: "导出项目文件",
            defaultPath: `${db.getProjectName()}`
        });
        if (!result.canceled && result.filePath) {
            db.exportProject((projData) => {
                const buffer = Buffer.from(projData);
                electronAPI.writeFile(`${result.filePath}.icp`, buffer)
                    .then(() => message.success(`项目已导出`))
                    .catch((err) => message.error(`导出错误: ${err.message}`));
            });
        }
    };

    // 选择导出的分组相关
    const handleShowExportGroupSelector = () => {
        setExportGroupModelVisible(true);
    };
    const handleUpdateSelectableGroupList = (callback) => {
        const groupList = db.getGroupList().map(group => {
            return {
                label: group.groupName,
                value: group.id
            };
        });
        setExportGroupFullList(groupList);
        setExportGroupSelected(groupList.map(group => group.value));
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
    const onTargetGroupCheckAllChange = (e) => {
        setExportGroupSelected(e.target.checked ? exportGroupFullList.map(group => group.value) : []);
        setExportGroupIndeterminate(false);
        setExportGroupCheckAll(e.target.checked);
    };
    const onTargetGroupChange = (checkedList) => {
        setExportGroupSelected(checkedList);
        setExportGroupIndeterminate(!!checkedList.length && (checkedList.length < exportGroupFullList.length));
        setExportGroupCheckAll(checkedList.length === exportGroupFullList.length);
    };

    // 界面构建相关
    const buildGroupItems = () => {
        return groupData.map(group => {
            return (
                <Menu.Item key={group.id} className={style.sideMenuGroupTitleContainer}>
                    {group.groupName}
                    <Button className={style.sideMenuGroupAction} shape="circle" icon={<SettingOutlined />} onClick={() => handleShowEditGroup(group)}/>
                </Menu.Item>
            );
        });
    };

    return (
        <div className={style.sideMenuContainer}>

            {/*OSX系统标题栏占位区域*/}
            { platform()==="darwin" && <div className={style.osxWindowTitlePlaceHolder}/> }

            <div className={style.sideMenuWrapper} ref={sideMenuWrapperRef}>

                {/*Win32系统标题栏可拖动区域*/}
                { platform()==="win32" && <div className={style.win32DragablePlaceHolder}/> }

                {/*侧边菜单*/}
                <Menu
                    style={{ width: 250, height: "100%", border: "none" }}
                    selectedKeys={[selectedGroup]}
                    onSelect={handleMenuItemSelected}
                    defaultOpenKeys={['resource', 'groups']}
                    mode="inline"
                >
                    {/*资源部分, 固定*/}
                    <SubMenu
                        key="resource" disabled={true}
                        title={
                            <span>
                                <AppstoreOutlined />
                                <span>资源</span>
                            </span>
                        }
                    >
                        <Menu.Item key="resource-all">
                            <span>
                                <BookOutlined />
                                <span>全部</span>
                            </span>
                        </Menu.Item>
                        <Menu.Item key="resource-uncategorized">
                            <Badge count={db.getIconCountFromGroup("resource-uncategorized") + db.getIconCountFromGroup("null")}>
                                <span>
                                    <FileExclamationOutlined />
                                    <span>未分组</span>
                                    <span>&nbsp;</span>
                                    <span>&nbsp;</span>
                                    <span>&nbsp;</span>
                                </span>
                            </Badge>
                        </Menu.Item>
                        <Menu.Item key="resource-recycleBin">
                            <Badge count={db.getIconCountFromGroup("resource-recycleBin")}>
                                <span>
                                    <DeleteOutlined />
                                    <span>回收站</span>
                                </span>
                            </Badge>
                        </Menu.Item>
                    </SubMenu>
                    {/*自创建分组部分*/}
                    <SubMenu
                        key="groups" disabled={true}
                        title={
                            <div className={style.sideMenuGroupMainTitleContainer}>
                                <TagsOutlined />
                                <span>分组</span>
                                <Button className={style.sideMenuGroupMainTitleAction} shape="circle" icon={<PlusOutlined />} onClick={handleShowAddGroup}/>
                            </div>
                        }
                    >
                        { groupData.length!==0 && buildGroupItems() }
                    </SubMenu>
                </Menu>

                {
                    groupData.length===0 &&
                    <div className={style.noGroupHint}>
                        <img src={addGroupHint} alt="添加分组"/>
                        <p>还没有分组</p>
                        <p>点击上方的 "+"可以创建分组</p>
                    </div>
                }
            </div>

            {/*导出导入按钮*/}
            <div className={style.sideIOButtonContainer}>
                <ButtonGroup style={{ width: 200 }}>
                    <Dropdown overlay={
                        <Menu onClick={handleImportClick} className={style.sideImportMenu}>
                            <Menu.Item key="importIcon">导入图标</Menu.Item>
                            <Menu.Item key="importProj">导入项目</Menu.Item>
                        </Menu>
                    }>
                        <Button style={{ width: "50%" }} icon={<LoginOutlined />}>导入</Button>
                    </Dropdown>
                    <Button style={{ width: "50%" }} onClick={handleExportClick} icon={<SaveOutlined />}>导出</Button>
                </ButtonGroup>
                <Button
                    style={{marginLeft: 6}} type="default"
                    shape="circle" icon={<SettingOutlined />}
                    onClick={handleShowEditPrefix}
                />
            </div>

            {/*添加分组对话框*/}
            <Modal
                wrapClassName="vertical-center-modal"
                title="添加分组"
                open={addGroupModelVisible}
                okText={"确认"}
                onOk={handleEnsureAddGroup}
                cancelText={"取消"}
                onCancel={handleCancelAddGroup}
            >
                <div className={style.addGroupModelContainer}>
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
                <div className={style.editGroupModelContainer}>
                    <Button size="large" className={style.fullWidthButton} onClick={handleShowGroupNameChange}>修改分组名</Button>
                    <Button size="large" danger className={style.fullWidthButton} onClick={handleShowDeleteGroup}>删除这个分组</Button>
                </div>
            </Modal>

            {/*修改组名对话框*/}
            <Modal
                wrapClassName="vertical-center-modal"
                title="修改分组名称"
                open={groupNameChangeModelVisible}
                okText={"确认修改"}
                onOk={handleEnsureGroupNameChange}
                cancelText={"取消"}
                onCancel={handleCancelGroupNameChange}
            >
                <div className={style.groupNameChangeModelContainer}>
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
                okText={"确认修改"}
                onOk={handleEnsureEditPrefix}
                cancelText={"取消"}
                onCancel={handleCancelEditPrefix}
            >
                <div className={style.editPrefixModelContainer}>
                    <Alert
                        message="请务必当心"
                        description={[
                            <div key="a">一旦你修改了图标字体前缀，被引用的所有图标的相应前缀都会被变更</div>,
                            <div key="b">与此同时，您必须同步修改代码中所有引用到该图标的相关代码</div>
                        ]}
                        type="warning"
                    />
                    <br/>
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
            </Modal>

            {/*删除分组对话框*/}
            <Modal
                wrapClassName="vertical-center-modal"
                title="删除分组"
                open={deleteGroupModelVisible}
                onOk={handleEnsureDeleteGroup}
                onCancel={handleCancelDeleteGroup}
                footer={[
                    <Button key="cancel" size="large" onClick={handleCancelDeleteGroup}>取消</Button>,
                    <Button key="delete" size="large" danger onClick={handleEnsureDeleteGroup}>删除</Button>
                ]}
            >
                <div className={style.deleteGroupModelContainer}>
                    <p>以下的分组将会被删除</p>
                    <p><b>{editingGroupData && editingGroupData.groupName}</b></p>
                    <p>该分组内的所有图标也会被一并移除</p>
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
                cancelText={"取消"}
                onCancel={handleCancelExportIconfonts}
            >
                <div className={style.exportIconfontsModelContainer}>
                    <span>导出图标字体能让您在网页中以图标字码, 或关联类名的方式直接引用图标。如果您想进一步了解更详细的使用信息, 请参阅导出后所附带的 HTML 文件。</span>
                    <div className={style.advanceOptionContainer}>
                        <ButtonGroup>
                            <Button onClick={handleShowExportGroupSelector}>选择需要导出的分组</Button>
                            <Button disabled>选择需要导出的格式</Button>
                        </ButtonGroup>
                    </div>
                </div>
                <span className={style.iconCountText}>
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
                cancelText={"取消"}
                onCancel={handleCancelExportGroupSelector}
            >
                <div className={style.targetGroupContainer}>
                    <div style={{ borderBottom: '1px solid #E9E9E9', paddingBottom: 6 }}>
                        <Checkbox
                            indeterminate={exportGroupIndeterminate}
                            onChange={onTargetGroupCheckAllChange}
                            checked={exportGroupCheckAll}
                        >全选</Checkbox>
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
                closable={false}
                open={exportLoadingModalVisible}
                footer={[]}
            >
                <div>
                    <p>正在生成图标字体, 请稍后</p>
                    <p>如果下次需要继续编辑图标, 请打开导出目录下文件后缀为 "icp" 的文件</p>
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
                    </Button>
                ]}
            >
                <div className={style.importCPProjModelContainer}>
                    <span>
                        所选择的项目文件是 CyberPen 所导出的项目文件。
                        从此工具中导出的项目文件在 CyberPen 中无法再次编辑。
                        不过您完全可以使用本工具来替代 CyberPen。
                    </span>
                </div>
            </Modal>

        </div>
    );
}

export default SideMenu;
