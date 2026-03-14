// Libs
import fs from 'fs'
import { ipcRenderer } from 'electron';
// React
import React from 'react';
// Antd
import { Alert, Menu, Modal, Button, Dropdown, Checkbox, Badge, message, Icon } from 'antd';
const SubMenu = Menu.SubMenu;
const ButtonGroup = Button.Group;
const confirm = Modal.confirm;
const CheckboxGroup = Checkbox.Group;
// Components
import EnhanceInput from '../enhance/input';
// Config
import config from '../../config';
// Style
import style from './index.css';
// Utils
import { GlobalEvent, isnContainSpace, platform } from '../../utils/tools';
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

// ====================================================
// GlobalEvent.dispatchEvent('SyncLeft');
// ====================================================

class SideMenu extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            groupData: [],
            // 当前选择的分组, 默认从配置读取
            selectedGroup: config.defaultSelectedGroup,
            // 创建新分组相关
            addGroupModelVisible: false,
            newGroupNameText: null,
            newGroupNameErrText: null,
            // 组编辑对话框相关
            editingGroupData: null,
            editGroupModelVisible: false,
            groupNameChangeModelVisible: false,
            editingGroupNameText: null,
            editingGroupNameErrText: null,
            deleteGroupModelVisible: false,
            // 前缀编辑相关 (ProjectName 即 Prefix 前缀）
            editPrefixModelVisible: false,
            editingPrefixText: null,
            editingPrefixErrText: null,
            // 导出对话框相关
            exportIconfontsModelVisible: false,
            exportGroupFullList: [],
            exportGroupSelected: [],
            exportGroupIndeterminate: true,
            exportGroupCheckAll: true,
            exportGroupModelVisible: false,
	        exportLoadingModalVisible: false,
            // 导入对话框相关
            importCPProjModelVisible: false,
        };

        this.ref = {
            sideMenuWrapper: React.createRef()
        }
    }


    // https://facebook.github.io/react/docs/state-and-lifecycle.html
    // On React IconGridLocal Mounting
    componentWillMount() {
        // 同步
        this.sync();
        // 接收到 SyncLeft 的事件刷新图标列表
        GlobalEvent.addEventHandler('SyncLeft', this.sync);
    }
    componentWillReceiveProps(nextProps) {
        const { selectedGroup:nextSelectedGroup } = nextProps;
        // 如果选择的分组改变了, 则同步
        if (nextSelectedGroup !== this.props.selectedGroup) {
            this.setState({ selectedGroup: nextSelectedGroup });
        }
    }
    componentWillUnmount() {
        // 移除事件注册
        GlobalEvent.removeEventHandler("SyncLeft", this.sync);
    }


    // 菜单相关
    // 同步菜单数据
    sync = () => {
        this.setState({ groupData: db.getGroupList() })
    };
    handleMenuItemSelected = (e) => {
        this.setState({
            selectedGroup: e.key
        }, () => {
            console.log(e.key)
            this.props.handleGroupSelected(e.key);
        });
    };

    // 添加分组
    handleShowAddGroup = () => {
        this.setState({
            addGroupModelVisible: true,
            newGroupNameText: null,
            newGroupNameErrText: null
        });
    };
    handleEnsureAddGroup = () => {
        const { newGroupNameText } = this.state;
        const sideMenuWrapperRef = this.ref.sideMenuWrapper
        if (newGroupNameText) {
            db.addGroup(newGroupNameText, (group) => {
                message.success("添加分组成功");
	            GlobalEvent.dispatchEvent('SyncLeft');
                this.setState({
                    selectedGroup: group.id,
                    addGroupModelVisible: false
                }, () => {
                    this.props.handleGroupSelected(group.id);
                    sideMenuWrapperRef.current.scrollTop = 100000
                });
            });
        } else {
            this.setState({
                newGroupNameErrText: "请输入一个分组名称"
            });
        }
    };
    handleCancelAddGroup = () => {
        this.setState({ addGroupModelVisible: false });
    };
    onNewGroupNameChange = (e) => {
        this.setState({ newGroupNameText: e.target.value });
    };

    // 编辑分组
    handleShowEditGroup = (group) => {
        this.setState({
            editingGroupData: group,
            editGroupModelVisible: true
        });
    };
    handleCancelEditGroup = () => {
        this.setState({
            editGroupModelVisible: false
        });
    };

    // 修改组名
    handleShowGroupNameChange = () => {
        this.setState({
            groupNameChangeModelVisible: true,
            editingGroupNameText: this.state.editingGroupData.groupName,
            editingGroupNameErrText: null,
        });
    };
    handleEnsureGroupNameChange = () => {
        const { editingGroupData, editingGroupNameText } = this.state;
        if (editingGroupNameText) {
            db.setGroupName(editingGroupData.id, editingGroupNameText, () => {
                message.success("组名已修改");
                GlobalEvent.dispatchEvent('SyncLeft');
                this.setState({
                    selectedGroup: editingGroupData.id,
                    groupNameChangeModelVisible: false,
                    editGroupModelVisible: false
                }, () => {
                    this.props.handleGroupSelected(editingGroupData.id);
                });
            });
        } else {
            this.setState({
                editingGroupNameErrText: "分组名称不能为空"
            });
        }
    };
    handleCancelGroupNameChange = () => {
        this.setState({
            groupNameChangeModelVisible: false
        });
    };
    onEditingGroupNameChange = (e) => {
        this.setState({ editingGroupNameText: e.target.value });
    };

    // 修改图标字体前缀
    handleShowEditPrefix = () => {
        this.setState({
            editPrefixModelVisible: true,
            editingPrefixText: db.getProjectName(),
            editingPrefixErrText: null,
        });
    };
    handleEnsureEditPrefix = () => {
        const { editingPrefixText } = this.state;
        if (isnContainSpace(editingPrefixText)) {
            db.setProjectName(editingPrefixText, () => {
                message.success("图标字体前缀已修改");
                GlobalEvent.dispatchEvent('SyncLeft');
                this.setState({
                    editPrefixModelVisible: false
                });
            });
        } else {
            this.setState({
                editingPrefixErrText: "图标字体前缀不能为空或包含空格"
            });
        }
    };
    handleCancelEditPrefix = () => {
        this.setState({
            editPrefixModelVisible: false
        });
    };
    onEditingPrefixChange = (e) => {
        this.setState({ editingPrefixText: e.target.value });
    };

    // 删除分组
    handleShowDeleteGroup = () => {
        this.setState({
            deleteGroupModelVisible: true
        });
    };
    handleEnsureDeleteGroup = () => {
        const { editingGroupData } = this.state;
        db.delGroup(editingGroupData.id, () => {
            message.success("分组已删除");
	        GlobalEvent.dispatchEvent('SyncLeft');
            this.setState({
                selectedGroup: "resource-all",
                deleteGroupModelVisible: false,
                editGroupModelVisible: false
            }, () => {
                this.props.handleGroupSelected("resource-all");
            });
        })
    };
    handleCancelDeleteGroup = () => {
        this.setState({
            deleteGroupModelVisible: false
        });
    };

    // 导入相关
    handleImportClick = (e) => {
        if (e.key === "importIcon") {
	        iconImporter({
		        onSelectSVG: (files) => {
			        db.addIcons(files, this.state.selectedGroup, () => {
				        message.success(`已成功导入 ${files.length} 个图标`);
				        GlobalEvent.dispatchEvent('SyncLeft');
				        GlobalEvent.dispatchEvent('SyncCenterLocal');
			        })
		        }
	        });
        }
        if (e.key === "importProj"){
        	projImporter({
		        onSelectCP: (project) => {
			        // 延迟 250ms, 避免弹出框卡顿
			        setTimeout(() => {
				        confirm({
					        title: "导入项目",
					        content: "导入所选的项目后, 当前正在编辑的项目将会被覆盖, 确认要导入吗 ?",
					        okText: "导入",
					        onOk() {
						        cpLoader({ data: project.data }, () => {
							        message.success(`项目已导入`);
							        GlobalEvent.dispatchEvent('SyncLeft');
							        GlobalEvent.dispatchEvent('SyncCenterLocal');
							        GlobalEvent.dispatchEvent("SelectGroup", { id: "resource-all" });
						        });
					        },
					        onCancel() {
						        message.warning(`导入已取消`);
					        },
				        })
			        }, 250);
		        },
		        onSelectICP: (project) => {
			        // 延迟 250ms, 避免弹出框卡顿
			        setTimeout(() => {
				        confirm({
					        title: "导入项目",
					        content: "导入所选的项目后, 当前正在编辑的项目将会被覆盖, 确认要导入吗 ?",
					        okText: "导入",
					        onOk() {
						        icpLoader(project.data, () => {
							        message.success(`项目已导入`);

							        GlobalEvent.dispatchEvent('SyncLeft');
							        GlobalEvent.dispatchEvent('SyncCenterLocal');
							        GlobalEvent.dispatchEvent("SelectGroup", { id: "resource-all" });
						        });
					        },
					        onCancel() {
						        message.warning(`导入已取消`);
					        },
				        })
			        }, 250);
		        }
	        });
        }
    };

    // 导出相关
    // 点击导出
    handleExportClick = (e) => {
        switch (e.key) {
            // 导出图标字体
            case "exportIconfonts":
                this.handleShowExportIconfonts()
                break
            // 导出项目
            case "exportProject":
                this.handleExportProjects()
                break
            default:
                this.handleShowExportIconfonts()
                break
        }
    };
    // 导出图标字体相关
    handleShowExportIconfonts = () => {
    	this.handleUpdateSelectableGroupList(() => {
		    this.setState({
			    exportIconfontsModelVisible: true
		    });
		});
    };
    handleEnsureExportIconfonts = () => {
        const { exportGroupFullList, exportGroupSelected } = this.state;
        // 判断是否选择了所有分组, 如果没有则需要用 getIconListFromGroup 处理
        const allGroupSelected = exportGroupSelected.length===0 || exportGroupFullList.length===exportGroupSelected.length;
        const icons = allGroupSelected ? db.getIconList() : db.getIconListFromGroup(exportGroupSelected);
        if (!!icons.length) {
	        // 生成文档页面
	        const groups = db.getGroupList();
	        groups.push({ id:"resource-uncategorized", groupName:"未分组", groupOrder:-1, groupColor:"" });
	        // 清空 iconContent, 以免页面体积过大
	        const pageData = demoHTMLGenerator(groups, icons.map(icon => {
		        return Object.assign({}, icon, { iconContent: "" });
	        }));
	        const cssData = iconfontCSSGenerator(icons);
	        const jsData = iconfontSymbolGenerator(icons);
	        const projectName = db.getProjectName()
	        // 生成图标字体
	        svgFontGenerator({
		        icons,
		        options: {
			        fontName: projectName,
			        normalize: true,           // 大小统一
			        fixedWidth: true,
			        fontHeight: 1024,          // 高度1024
			        fontWeight: 400,           // 字重400
			        centerHorizontally: true,  // 图标居中
			        round: 1000,               // path值保留三位小数
			        log: () => {}              // 沉默控制台输出
		        }
	        }, (svgFont) => {
		        try {
		            const ttfFont = ttfFontGenerator({svgFont});
                    const woffFont = woffFontGenerator({ttfFont});
                    const woff2Font = woff2FontGenerator({ttfFont});
                    const eotFont = eotFontGenerator({ttfFont});
                    ipcRenderer.invoke('dialog-show-save', {
                        title: "导出图标字体",
                        defaultPath: `${db.getProjectName()}`
                    }).then((result) => {
                        if (result.canceled || !result.filePath) {
                            this.handleHideGeneratingOverlay();
                            return
                        }
                        const path = result.filePath;
                        fs.access(path, fs.constants.R_OK, (err) => {
                            err && fs.mkdirSync(path);
                            try {
                                db.exportProject(projData => {
                                    const buffer = new Buffer(projData);
                                    fs.writeFileSync(`${path}\/${projectName}.icp`, buffer);
                                    fs.writeFileSync(`${path}\/${projectName}.html`, pageData);
                                    fs.writeFileSync(`${path}\/${projectName}.css`, cssData);
                                    fs.writeFileSync(`${path}\/${projectName}.js`, jsData);
                                    fs.writeFileSync(`${path}\/${projectName}.svg`, svgFont);
                                    fs.writeFileSync(`${path}\/${projectName}.ttf`, new Buffer(ttfFont.buffer));
                                    fs.writeFileSync(`${path}\/${projectName}.woff`, new Buffer(woffFont.buffer));
                                    fs.writeFileSync(`${path}\/${projectName}.woff2`, new Buffer(woff2Font.buffer));
                                    fs.writeFileSync(`${path}\/${projectName}.eot`, new Buffer(eotFont.buffer));
                                    message.success(`图标字体已导出`);
                                    this.handleHideGeneratingOverlay();
                                    this.handleCancelExportIconfonts();
                                });
                            } catch (err) {
                                message.error(`导出错误: ${err.message}`);
                                this.handleHideGeneratingOverlay();
                                this.handleCancelExportIconfonts();
                            }
                        });
                    });
                } catch(err) {
                    console.error(err)
		            let errMsg = err
                    if (err === "Checksum error in glyf") {
                        errMsg = "请确保路径已全部转换为轮廓"
                    }
                    message.error(`导出错误: ${errMsg}`);
                    this.handleHideGeneratingOverlay();
                    this.handleCancelExportIconfonts();
                }
	        });
        } else {
        	message.warn(`当前项目没有任何图标可供导出`);
	        this.handleHideGeneratingOverlay();
        }
    };
    handleCancelExportIconfonts = () => {
        this.setState({
            exportIconfontsModelVisible: false
        });
    };
    // 显示"正在生成"遮罩
	handleShowGeneratingOverlay = () => {
		this.setState({ exportLoadingModalVisible: true });
	};
	handleHideGeneratingOverlay = () => {
		this.setState({ exportLoadingModalVisible: false });
	};
    // 导出项目文件相关
    handleExportProjects = async () => {
        const result = await ipcRenderer.invoke('dialog-show-save', {
            title: "导出项目文件",
            defaultPath: `${db.getProjectName()}`
        });
        if (!result.canceled && result.filePath) {
            db.exportProject((projData) => {
                const buffer = new Buffer(projData);
                fs.writeFile(`${result.filePath}.icp`, buffer, (err) => {
                    if(err){
                        message.error(`导出错误: ${err.message}`);
                    } else {
                        message.success(`项目已导出`);
                    }
                });
            });
        }
    };
    // 选择导出的分组相关
    handleShowExportGroupSelector = () => {
	    this.setState({
            exportGroupModelVisible: true
        });
    };
    handleUpdateSelectableGroupList = (callback) => {
	    const groupList = db.getGroupList().map(group => {
		    return {
			    label: group.groupName,
			    value: group.id
		    }
	    });
	    this.setState({
		    exportGroupFullList: groupList,
		    exportGroupSelected: groupList.map(group=>group.value),
		    exportGroupIndeterminate: true,
		    exportGroupCheckAll: true,
	    }, () => callback && callback());
    };
    handleExportGroupSelectorEnsure = () => {
    	const { exportGroupSelected } = this.state;
    	if (exportGroupSelected.length===0) {
    		message.error(`请选择至少一个分组`);
	    } else {
		    this.setState({ exportGroupModelVisible: false });
	    }
    };
    handleCancelExportGroupSelector = () => {
        this.setState({ exportGroupModelVisible: false });
    };
    onTargetGroupCheckAllChange = (e) => {
        const { exportGroupFullList } = this.state;
        this.setState({
            exportGroupSelected: e.target.checked ? exportGroupFullList.map(group=>group.value) : [],
            exportGroupIndeterminate: false,
            exportGroupCheckAll: e.target.checked,
        });
    };
    onTargetGroupChange = (checkedList) => {
        const { exportGroupFullList } = this.state;
        this.setState({
            exportGroupSelected: checkedList,
            exportGroupIndeterminate: !!checkedList.length && (checkedList.length < exportGroupFullList.length),
            exportGroupCheckAll: checkedList.length === exportGroupFullList.length,
        });
    };


    // 界面构建相关
    buildGroupItems = () => {
        return this.state.groupData.map(group => {
            return (
                <Menu.Item key={group.id} className={style.sideMenuGroupTitleContainer}>
                    {group.groupName}
                    <Button className={style.sideMenuGroupAction} shape="circle" icon="setting" onClick={() => this.handleShowEditGroup(group)}/>
                </Menu.Item>
            );
        });
    };


    render() {
        return (
            <div className={style.sideMenuContainer}>

	            {/*OSX系统标题栏占位区域*/}
                { platform()==="darwin" && <div className={style.osxWindowTitlePlaceHolder}/> }

                <div className={style.sideMenuWrapper} ref={this.ref.sideMenuWrapper}>

	                {/*Win32系统标题栏可拖动区域*/}
	                { platform()==="win32" && <div className={style.win32DragablePlaceHolder}/> }

                    {/*侧边菜单*/}
                    <Menu
                        style={{ width: 250, height: "100%", border: "none" }}
                        selectedKeys={[this.state.selectedGroup]}
                        onSelect={this.handleMenuItemSelected}
                        defaultOpenKeys={['resource', 'groups']}
                        mode="inline"
                    >
                        {/*资源部分, 固定*/}
                        <SubMenu
                            key="resource" disabled={true}
                            title={
                                <span>
                                    <Icon type="appstore"/>
                                    <span>资源</span>
                                </span>
                            }
                        >
                            <Menu.Item key="resource-all">
	                            <span>
		                            <Icon type="book"/>
		                            <span>全部</span>
	                            </span>
                            </Menu.Item>
                            <Menu.Item key="resource-uncategorized">
                                <Badge count={db.getIconCountFromGroup("resource-uncategorized") + db.getIconCountFromGroup("null")}>
		                            <span>
			                            <Icon type="exception"/>
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
			                            <Icon type="delete"/>
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
                                    <Icon type="tags"/>
                                    <span>分组</span>
                                    <Button className={style.sideMenuGroupMainTitleAction} shape="circle" icon="plus" onClick={this.handleShowAddGroup}/>
                                </div>
                            }
                        >
                            { this.state.groupData.length!==0 && this.buildGroupItems() }
                        </SubMenu>
                    </Menu>

	                {
		                this.state.groupData.length===0 &&
		                <div className={style.noGroupHint}>
			                <img src="./resources/imgs/nodata/addGroupHint.png" alt="添加分组"/>
							<p>还没有分组</p>
			                <p>点击上方的 "+"可以创建分组</p>
		                </div>
	                }
                </div>

                {/*导出导入按钮*/}
                <div className={style.sideIOButtonContainer}>
                    <ButtonGroup style={{ width: 200 }}>
                        <Dropdown overlay={
                            <Menu onClick={this.handleImportClick} className={style.sideImportMenu}>
                                <Menu.Item key="importIcon">导入图标</Menu.Item>
                                <Menu.Item key="importProj">导入项目</Menu.Item>
                            </Menu>
                        }>
                            <Button style={{ width: "50%" }} icon="login">导入</Button>
                        </Dropdown>
                        <Button style={{ width: "50%" }} onClick={this.handleExportClick} icon="save">导出</Button>
                        {/*<Dropdown overlay={*/}
                            {/*<Menu onClick={this.handleExportClick} className={style.sideImportMenu}>*/}
                                {/*<Menu.Item key="exportIconfonts">导出图标字体</Menu.Item>*/}
                                {/*<Menu.Item key="exportProject">导出项目文件</Menu.Item>*/}
                            {/*</Menu>*/}
                        {/*}>*/}
                            {/*<Button style={{ width: "50%" }} icon="save">导出</Button>*/}
                        {/*</Dropdown>*/}
                    </ButtonGroup>
                    <Button
                        style={{marginLeft: 6}} type="secondary"
                        shape="circle" icon="setting"
                        onClick={this.handleShowEditPrefix}
                    />
                </div>

                {/*添加分组对话框*/}
                <Modal
                    wrapClassName="vertical-center-modal"
                    title="添加分组"
                    visible={this.state.addGroupModelVisible}
                    okText={"确认"}
                    onOk={this.handleEnsureAddGroup}
                    cancelText={"取消"}
                    onCancel={this.handleCancelAddGroup}
                >
                    <div className={style.addGroupModelContainer}>
                        <EnhanceInput
                            placeholder="分组名称"
                            value={this.state.newGroupNameText}
                            onChange={this.onNewGroupNameChange}
                            onPressEnter={this.handleEnsureAddGroup}
                            inputTitle="请输入要创建的分组名"
                            inputHintText={this.state.newGroupNameErrText}
                            inputHintBadgeType="error"
                        />
                    </div>
                </Modal>

                {/*编辑分组对话框*/}
                <Modal
                    wrapClassName="vertical-center-modal"
                    title="编辑分组"
                    visible={this.state.editGroupModelVisible}
                    onCancel={this.handleCancelEditGroup}
                    footer={null}
                >
                    <div className={style.editGroupModelContainer}>
                        <Button size="large" className={style.fullWidthButton} onClick={this.handleShowGroupNameChange}>修改分组名</Button>
                        <Button size="large" type="danger" className={style.fullWidthButton} onClick={this.handleShowDeleteGroup}>删除这个分组</Button>
                    </div>
                </Modal>

                {/*修改组名对话框*/}
                <Modal
                    wrapClassName="vertical-center-modal"
                    title="修改分组名称"
                    visible={this.state.groupNameChangeModelVisible}
                    okText={"确认修改"}
                    onOk={this.handleEnsureGroupNameChange}
                    cancelText={"取消"}
                    onCancel={this.handleCancelGroupNameChange}
                >
                    <div className={style.groupNameChangeModelContainer}>
                        <EnhanceInput
                            placeholder="分组名称"
                            value={this.state.editingGroupNameText}
                            onChange={this.onEditingGroupNameChange}
                            onPressEnter={this.handleEnsureGroupNameChange}
                            inputTitle="请输入新的分组名"
                            inputHintText={this.state.editingGroupNameErrText}
                            inputHintBadgeType="error"
                        />
                    </div>
                </Modal>

                {/*修改图标字体前缀对话框*/}
                <Modal
                    wrapClassName="vertical-center-modal"
                    title="修改图标字体前缀"
                    visible={this.state.editPrefixModelVisible}
                    okText={"确认修改"}
                    onOk={this.handleEnsureEditPrefix}
                    cancelText={"取消"}
                    onCancel={this.handleCancelEditPrefix}
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
                            value={this.state.editingPrefixText}
                            onChange={this.onEditingPrefixChange}
                            onPressEnter={this.handleEnsureEditPrefix}
                            inputTitle="请输入新的前缀"
                            inputHintText={this.state.editingPrefixErrText}
                            inputHintBadgeType="error"
                        />
                    </div>
                </Modal>

                {/*删除分组对话框*/}
                <Modal
                    wrapClassName="vertical-center-modal"
                    title="删除分组"
                    visible={this.state.deleteGroupModelVisible}
                    onOk={this.handleEnsureDeleteGroup}
                    onCancel={this.handleCancelDeleteGroup}
                    footer={[
                        <Button key="cancel" size="large" onClick={this.handleCancelDeleteGroup}>取消</Button>,
                        <Button key="delete" size="large" type="danger" onClick={this.handleEnsureDeleteGroup}>删除</Button>
                    ]}
                >
                    <div className={style.deleteGroupModelContainer}>
                        <p>以下的分组将会被删除</p>
                        <p><b>{this.state.editingGroupData && this.state.editingGroupData.groupName}</b></p>
                        <p>该分组内的所有图标也会被一并移除</p>
                    </div>
                </Modal>

	            {/*导出图标字体对话框*/}
	            <Modal
		            wrapClassName="vertical-center-modal"
		            title="导出图标字体"
		            visible={this.state.exportIconfontsModelVisible}
                    okText="导出图标字体"
		            onOk={() => {
			            this.setState({
				            exportLoadingModalVisible: true
			            }, () => setTimeout(() =>
				            this.handleEnsureExportIconfonts(),
				            500)
			            );
		            }}
                    cancelText={"取消"}
		            onCancel={this.handleCancelExportIconfonts}
	            >
		            <div className={style.exportIconfontsModelContainer}>
			            <span>导出图标字体能让您在网页中以图标字码, 或关联类名的方式直接引用图标。如果您想进一步了解更详细的使用信息, 请参阅导出后所附带的 HTML 文件。</span>
			            <div className={style.advanceOptionContainer}>
				            <ButtonGroup>
					            <Button onClick={this.handleShowExportGroupSelector}>选择需要导出的分组</Button>
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
		            visible={this.state.exportGroupModelVisible}
                    okText="确认"
		            onOk={this.handleExportGroupSelectorEnsure}
                    cancelText={"取消"}
		            onCancel={this.handleCancelExportGroupSelector}
	            >
		            <div className={style.targetGroupContainer}>
			            <div style={{ borderBottom: '1px solid #E9E9E9', paddingBottom: 6 }}>
				            <Checkbox
					            indeterminate={this.state.exportGroupIndeterminate}
					            onChange={this.onTargetGroupCheckAllChange}
					            checked={this.state.exportGroupCheckAll}
				            >全选</Checkbox>
			            </div>
			            <CheckboxGroup
				            options={this.state.exportGroupFullList}
				            value={this.state.exportGroupSelected}
				            onChange={this.onTargetGroupChange}
			            />
		            </div>
	            </Modal>

	            {/*正在导出提示框*/}
	            <Modal
		            wrapClassName="vertical-center-modal"
		            title="正在生成"
		            maskClosable={false}
		            closable={false}
		            visible={this.state.exportLoadingModalVisible}
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
                    visible={this.state.importCPProjModelVisible}
                    onCancel={this.handleCancelExportIconfonts}
                    footer={[
                        <Button key="back" size="large" onClick={this.handleCancel}>
                            取消
                        </Button>,
                        <Button disabled key="combine" type="primary" size="large" onClick={this.handleEnsureCombineCPProj}>
                            导入并与当前项目合并
                        </Button>,
                        <Button key="replace" type="primary" size="large" onClick={this.handleEnsureImportCPProj}>
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
}


export default SideMenu;