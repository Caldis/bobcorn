// fs
import fs from 'fs';
// electron
import { ipcRenderer } from 'electron';
// React
import React from 'react';
import PropTypes from 'prop-types';
// Antd
import { Radio, Modal, Button, message } from 'antd';
import { EditOutlined, RetweetOutlined, ExportOutlined, DeleteOutlined, CopyOutlined, SelectOutlined } from '@ant-design/icons';
const ButtonGroup = Button.Group;
const confirm = Modal.confirm;
const RadioGroup = Radio.Group;
// Components
import EnhanceInput from '../enhance/input';
// Style
import style from './index.module.css';
// Database
import db from '../../database';
// Utils
import { GlobalEvent, platform } from '../../utils/tools';

// ====================================================
// GlobalEvent.dispatchEvent("SyncRight");
// ====================================================

const radioStyle = {
    display: 'block',
    height: '30px',
    lineHeight: '30px',
};

class SideEditor extends React.Component{
    constructor(props) {
        super(props);
        this.state = {
            iconData: {},
            iconName: null,
            iconNameErrText: null,
            iconCode: null,
            iconCodeErrText: null,
            iconGroupEditModelType: null,
            iconGroupEditModelTitle: null,
            iconGroupEditModelVisible: false,
            iconGroupEditModelTarget: props.selectedGroup || null
        };
    }

	// https://facebook.github.io/react/docs/state-and-lifecycle.html
	// On React IconGridLocal Mounting
	componentDidMount() {
		// 接收到 SyncRight 的事件刷新所选的图标数据
		GlobalEvent.addEventHandler("SyncRight", this.sync);
	}
    // On React IconGridLocal Updating
    componentDidUpdate(prevProps) {
        const { selectedIcon } = this.props;
        // 如果选择的图标改变了, 则刷新
        if (selectedIcon !== prevProps.selectedIcon) {
            this.sync(selectedIcon);
        }
    }
	componentWillUnmount() {
		// 移除事件注册
		GlobalEvent.removeEventHandler("SyncRight", this.sync);
	}

    // 同步所选图标数据
    sync = (selectedIcon) => {
        // 同步所有图标数据
        const iconData = db.getIconData(selectedIcon || this.props.selectedIcon);
        this.setState({
            iconData,
            // 单独抽出来便于 Input修改
            iconName: iconData.iconName,
            iconNameErrText: null,
            // 单独抽出来便于 Input修改
            iconCode: iconData.iconCode,
            iconCodeErrText: null,
            iconGroupEditModelTarget: this.props.selectedGroup
        });
    };

    // 图标名称与字码修改相关
    iconNameCanSave = () => {
        const { iconData, iconName } = this.state;
        return iconName && (iconName !== iconData.iconName);
    };
    handleIconNameChange = (e) => {
        this.setState({
            iconName: e.target.value,
            iconNameErrText: !e.target.value ? "图标名称不能为空" : null
        });
    };
    handleIconNameSave = () => {
        const { selectedIcon } = this.props;
        const { iconName } = this.state;
        if (iconName) {
            if (this.iconNameCanSave()) {
                db.setIconName(selectedIcon, iconName, () => {
                    message.success("图标名称已修改");
	                GlobalEvent.dispatchEvent("SyncCenterLocal");
	                GlobalEvent.dispatchEvent("SyncRight");
                });
            }
        } else {
            this.setState({ iconNameErrText: "图标名称不能为空" });
        }
    };
    iconCodeCanSave = () => {
        const { iconData, iconCode } = this.state;
        return iconCode && (iconCode !== iconData.iconCode) && db.iconCodeCanUse(iconCode);
    };
    handleIconCodeChange = (e) => {
        const { iconData } = this.state;
        const value = e.target.value;
        if (value) {
            this.setState({
                iconCode: value.toUpperCase(),
                iconCodeErrText: value !== iconData.iconCode ?
                                    db.iconCodeInRange(value) ?
                                        db.iconCodeCanUse(value) ? null : "图标字码已被占用" :
                                        "图标字码超出 E000-F8FF" :
                                    null
            });
        } else {
            this.setState({
                iconCode: value,
                iconCodeErrText: !value ? "图标字码不能为空" : null
            });
        }
    };
    handleIconCodeSave = () => {
        const { selectedIcon } = this.props;
        const { iconCode } = this.state;
        if (iconCode) {
            if (this.iconCodeCanSave()) {
                db.setIconCode(selectedIcon, iconCode, () => {
                    message.success("图标字码已修改");
	                GlobalEvent.dispatchEvent("SyncCenterLocal");
	                GlobalEvent.dispatchEvent("SyncRight");
                });
            }
        } else {
            this.setState({ iconCodeErrText: "图标字码不能为空" });
        }
    };

    // 替换图标相关
    handleIconContentUpdate = async () => {
        const { selectedIcon } = this.props;
        const { iconData } = this.state;
        const result = await ipcRenderer.invoke('dialog-show-open', {
            title: "选择一个SVG图标文件",
            filters: [{ name: "SVG图标文件", extensions: ["svg"] }],
            properties: [ "openFile" ],
        });
        if (!result.canceled && result.filePaths.length > 0) {
            const newIconFileData = Object.assign(iconData, {path: result.filePaths[0]});
            db.renewIconData(selectedIcon, newIconFileData, () => {
                message.success(`图标数据已更新`);
	            GlobalEvent.dispatchEvent("SyncLeft");
	            GlobalEvent.dispatchEvent("SyncCenterLocal");
	            GlobalEvent.dispatchEvent("SyncRight");
            })
        }
    };

    // 图标导出相关
    handleIconExport = async () => {
        const { iconData } = this.state;
        const result = await ipcRenderer.invoke('dialog-show-save', {
            title: "导出图标",
            defaultPath: `${iconData.iconName}.${iconData.iconType}`
        });
        if (!result.canceled && result.filePath) {
            fs.writeFile(result.filePath, iconData.iconContent, (err) => {
                if(err){
                    message.error(`导出错误: ${err.message}`);
                } else {
                    message.success(`图标已导出`);
                }
            });
        }
    };
    handleAllIconExport = async () => {
        const result = await ipcRenderer.invoke('dialog-show-save', {
            title: "导出所有图标",
            defaultPath: `${db.getProjectName()}`
        });
        if (!result.canceled && result.filePath) {
            const path = result.filePath;
            fs.access(path, fs.constants.R_OK, (err) => {
                err && fs.mkdirSync(path);
                try {
                    const icons = db.getIconList()
                    icons.forEach(icon => {
                        fs.writeFile(`${path}\/${icon.iconName}-${icon.iconCode}.${icon.iconType}`, icon.iconContent);
                    })
                    message.success(`${icons.length} 个图标已导出`);
                } catch (err) {
                    message.error(`导出错误: ${err.message}`);
                }
            })
        }
    }

    // 删除图标相关
    handleIconRecycle = () => {
        const { selectedIcon } = this.props;
        confirm({
            title: "回收图标",
            content: "图标将会被移动到回收站, 并在导出后的预览页面内不可见, 但仍可被使用. 请在确保图标没有被引用后将其从回收站内删除",
            onOk() {
                db.moveIconGroup(selectedIcon, "resource-recycleBin", () => {
                    message.success(`所选的图标已回收`);
                    GlobalEvent.dispatchEvent("SyncLeft");
                    GlobalEvent.dispatchEvent("SyncCenterLocal");
                    GlobalEvent.dispatchEvent("SelectIcon", { id: null });
                });
            }
        });
    };
    handleIconDelete = () => {
        const { selectedIcon } = this.props;
        confirm({
            title: "删除图标",
            content: "当图标没有在项目中被引用时, 将其删除以释放图标字码",
            onOk() {
                db.delIcon(selectedIcon, () => {
                    message.success(`所选的图标已被删除`);
                    GlobalEvent.dispatchEvent("SyncLeft");
                    GlobalEvent.dispatchEvent("SyncCenterLocal");
                    GlobalEvent.dispatchEvent("SelectIcon", { id: null });
                });
            }
        });
    };

    // 复制/移动图标相关
    handleShowIconGroupEdit = (type) => {
	    const { selectedGroup } = this.props;
	    const { iconGroupEditModelTarget } = this.state;
        if (type === "duplicate") {
            this.setState({
                iconGroupEditModelType: "duplicate",
                iconGroupEditModelTitle: "选择要复制到的目标分组",
                iconGroupEditModelVisible: true,
	            iconGroupEditModelTarget: selectedGroup==="resource-uncategorized" ? null : iconGroupEditModelTarget
            });
        }
        if (type === "move") {
            this.setState({
                iconGroupEditModelType: "move",
                iconGroupEditModelTitle: "选择要移动到的目标分组",
                iconGroupEditModelVisible: true,
	            iconGroupEditModelTarget: selectedGroup==="resource-uncategorized" ? null : iconGroupEditModelTarget
            });
        }
    };
    handleEnsureIconGroupEdit = () => {
        const { iconGroupEditModelType:type, iconGroupEditModelTarget:target } = this.state;
        const { selectedIcon } = this.props;
        if (type === "duplicate") {
            db.duplicateIconGroup(selectedIcon, target, () => {
                message.success(`所选的图标已复制到目标分组`);
	            GlobalEvent.dispatchEvent("SyncLeft");
	            GlobalEvent.dispatchEvent("SyncCenterLocal");
	            GlobalEvent.dispatchEvent("SelectIcon", { id: null });
            });
        }
        if (type === "move") {
            db.moveIconGroup(selectedIcon, target, () => {
                message.success(`所选的图标已移动到目标分组`);
	            GlobalEvent.dispatchEvent("SyncLeft");
	            GlobalEvent.dispatchEvent("SyncCenterLocal");
	            GlobalEvent.dispatchEvent("SelectIcon", { id: null });
            });
        }
        this.setState({
            iconGroupEditModelVisible: false
        });
    };
    handleCancelIconGroupEdit = () => {
        this.setState({
            iconGroupEditModelVisible: false
        });
    };
    onTargetGroupChange = (e) => {
        this.setState({
            iconGroupEditModelTarget: e.target.value,
        });
    };

    // 构建模态框内的分组列表
    buildSelectableGroupList = () => {
        return db.getGroupList().map(group => {
            return (
                <Radio key={group.id} style={radioStyle} value={group.id}>
                    {group.groupName}
                </Radio>
            );
        });
    };

    render() {
        const { selectedGroup, selectedIcon } = this.props;
        const { iconData, iconName, iconNameErrText, iconCode, iconCodeErrText, iconGroupEditModelTarget } = this.state;
        const groupNum = db.getGroupList().length;
        return (
            <div className={style.sideEditor}>

                {/*<div className={style.sideEditorName}>图标属性</div>*/}

	            {/*Win32系统标题栏占位区域*/}
	            { platform()==="win32" && <div className={style.win32WindowTitlePlaceHolder}/> }

                {
                    selectedIcon ?
                    <div className={style.sideEditorContainContainer}>
                        <div className={style.basicDetailContainer}>

                            {/*图标名称输入框*/}
                            <EnhanceInput
                                autoFocus={false}
                                placeholder="在界面上显示的名称"
                                value={iconName}
                                onChange={this.handleIconNameChange}
                                onPressEnter={this.handleIconNameSave}
                                inputTitle="名称"
                                inputHintText={iconNameErrText}
                                inputHintBadgeType="error"
                                inputSave={this.iconNameCanSave()}
                                inputSaveClick={this.handleIconNameSave}
                            />

                            {/*图标字码输入框*/}
                            <EnhanceInput
                                autoFocus={false}
                                placeholder="十六进制, 从E000到F8FF"
                                value={iconCode}
                                onChange={this.handleIconCodeChange}
                                onPressEnter={this.handleIconCodeSave}
                                inputTitle="字码"
                                inputHintText={iconCodeErrText}
                                inputHintBadgeType="error"
                                inputSave={this.iconCodeCanSave()}
                                inputSaveClick={this.handleIconCodeSave}
                            />

                        </div>

                        {/*图标基本信息*/}
                        <div className={style.basicInfoContainer}>
                            <span><b>基本信息</b></span>
                            <p>所属分组: {db.getGroupName(iconData.iconGroup)}</p>
                            <p>原始大小: {`${(iconData.iconSize/512).toFixed(2)} KB`}</p>
                            <p>文件格式: {iconData.iconType.toUpperCase()}</p>
                            <p>添加日期: {iconData.createTime}</p>
                            <p>修改日期: {iconData.updateTime}</p>
                        </div>

                        {/*高级操作*/}
                        <div className={style.advanceActionContainer}>
                            <span><b>高级操作</b></span>
                            <Button style={{width: "100%"}} icon={<EditOutlined />} disabled>
                                编辑
                            </Button>
                            <Button style={{width: "100%"}} icon={<RetweetOutlined />} onClick={this.handleIconContentUpdate}>
                                替换
                            </Button>
                            <Button style={{width: "100%"}} icon={<ExportOutlined />} onClick={this.handleIconExport}>
                                导出
                            </Button>
                            {/*<Button style={{width: "100%"}} icon="export" onClick={this.handleAllIconExport}>*/}
                                {/*导出全部*/}
                            {/*</Button>*/}
                            <Button style={{width: "100%"}} icon={<DeleteOutlined />} onClick={
                                selectedGroup==="resource-recycleBin" ? this.handleIconDelete : this.handleIconRecycle
                            }>
                                { selectedGroup==="resource-recycleBin" ? "删除" : "回收" }
                            </Button>
                            <ButtonGroup style={{width: "100%"}}>
                                <Button
	                                disabled={groupNum===0}
                                    style={{width: "50%"}} icon={<CopyOutlined />}
                                    onClick={() => this.handleShowIconGroupEdit("duplicate")}
                                >复制</Button>
                                <Button
	                                disabled={groupNum===0}
	                                style={{width: "50%"}} icon={<SelectOutlined />}
                                    onClick={() => this.handleShowIconGroupEdit("move")}
                                >移动</Button>
                            </ButtonGroup>
                        </div>
                    </div> :
                    <div className={style.sideEditorNoselected}>
                        <img src="./resources/imgs/nodata/selectedIconHint.png"/>
                        <p>请选择一个图标</p>
	                    <p>可在此编辑其属性</p>
                    </div>
                }

                {/*组选择模态框*/}
                <Modal
                    wrapClassName="vertical-center-modal"
                    title={this.state.iconGroupEditModelTitle}
                    open={this.state.iconGroupEditModelVisible}
                    onOk={this.handleEnsureIconGroupEdit}
                    onCancel={this.handleCancelIconGroupEdit}
                    footer={[
                        <Button
	                        key="cancel"
	                        size="large"
	                        onClick={this.handleCancelIconGroupEdit}
                        >取消</Button>,
                        <Button
	                        disabled={iconGroupEditModelTarget==="resource-uncategorized" || iconGroupEditModelTarget==="resource-all" || !iconGroupEditModelTarget}
	                        key="ensure"
	                        size="large"
	                        onClick={this.handleEnsureIconGroupEdit}
                        >确认</Button>
                    ]}
                >
                    <div className={style.targetGroupContainer}>
                        { this.state.iconGroupEditModelType==="duplicate" && <p>新生成的图标将会拥有一个不同的图标字码</p> }
                        <RadioGroup onChange={this.onTargetGroupChange} value={this.state.iconGroupEditModelTarget}>
                            {/*<Radio style={radioStyle} value="resource-uncategorized">未分组</Radio>*/}
                            { this.buildSelectableGroupList() }
                        </RadioGroup>
                    </div>
                </Modal>

            </div>
        );
    }
}

export default SideEditor;