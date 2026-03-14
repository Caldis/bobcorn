// Electron API (via preload contextBridge)
const { electronAPI } = window;
// React
import React, { useState, useEffect, useRef } from 'react';
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
import { platform } from '../../utils/tools';
// Images
import selectedIconHint from '../../resources/imgs/nodata/selectedIconHint.png';
// Store
import useAppStore from '../../store';

const radioStyle = {
    display: 'block',
    height: '30px',
    lineHeight: '30px',
};

function SideEditor({ selectedGroup, selectedIcon }) {
    const syncLeft = useAppStore(state => state.syncLeft);
    const selectIcon = useAppStore(state => state.selectIcon);

    const [iconData, setIconData] = useState({});
    const [iconName, setIconName] = useState(null);
    const [iconNameErrText, setIconNameErrText] = useState(null);
    const [iconCode, setIconCode] = useState(null);
    const [iconCodeErrText, setIconCodeErrText] = useState(null);
    const [iconGroupEditModelType, setIconGroupEditModelType] = useState(null);
    const [iconGroupEditModelTitle, setIconGroupEditModelTitle] = useState(null);
    const [iconGroupEditModelVisible, setIconGroupEditModelVisible] = useState(false);
    const [iconGroupEditModelTarget, setIconGroupEditModelTarget] = useState(selectedGroup || null);

    const prevSelectedIconRef = useRef(selectedIcon);

    // Sync icon data
    const sync = (iconId) => {
        const id = iconId || selectedIcon;
        if (id) {
            const data = db.getIconData(id);
            setIconData(data);
            setIconName(data.iconName);
            setIconNameErrText(null);
            setIconCode(data.iconCode);
            setIconCodeErrText(null);
            setIconGroupEditModelTarget(selectedGroup);
        }
    };

    useEffect(() => {
        if (selectedIcon) {
            sync(selectedIcon);
        }
    }, []);

    // Subscribe to store groupData changes to trigger re-sync (replaces SyncRight event)
    const groupData = useAppStore(state => state.groupData);
    useEffect(() => {
        if (selectedIcon) {
            sync(selectedIcon);
        }
    }, [groupData]);

    useEffect(() => {
        if (selectedIcon !== prevSelectedIconRef.current) {
            prevSelectedIconRef.current = selectedIcon;
            if (selectedIcon) {
                sync(selectedIcon);
            }
        }
    }, [selectedIcon]);

    // 图标名称与字码修改相关
    const iconNameCanSave = () => {
        return iconName && (iconName !== iconData.iconName);
    };
    const handleIconNameChange = (e) => {
        setIconName(e.target.value);
        setIconNameErrText(!e.target.value ? "图标名称不能为空" : null);
    };
    const handleIconNameSave = () => {
        if (iconName) {
            if (iconNameCanSave()) {
                db.setIconName(selectedIcon, iconName, () => {
                    message.success("图标名称已修改");
                    syncLeft();
                    sync(selectedIcon);
                });
            }
        } else {
            setIconNameErrText("图标名称不能为空");
        }
    };
    const iconCodeCanSave = () => {
        return iconCode && (iconCode !== iconData.iconCode) && db.iconCodeCanUse(iconCode);
    };
    const handleIconCodeChange = (e) => {
        const value = e.target.value;
        if (value) {
            setIconCode(value.toUpperCase());
            setIconCodeErrText(
                value !== iconData.iconCode ?
                    db.iconCodeInRange(value) ?
                        db.iconCodeCanUse(value) ? null : "图标字码已被占用" :
                        "图标字码超出 E000-F8FF" :
                    null
            );
        } else {
            setIconCode(value);
            setIconCodeErrText(!value ? "图标字码不能为空" : null);
        }
    };
    const handleIconCodeSave = () => {
        if (iconCode) {
            if (iconCodeCanSave()) {
                db.setIconCode(selectedIcon, iconCode, () => {
                    message.success("图标字码已修改");
                    syncLeft();
                    sync(selectedIcon);
                });
            }
        } else {
            setIconCodeErrText("图标字码不能为空");
        }
    };

    // 替换图标相关
    const handleIconContentUpdate = async () => {
        const result = await electronAPI.showOpenDialog( {
            title: "选择一个SVG图标文件",
            filters: [{ name: "SVG图标文件", extensions: ["svg"] }],
            properties: [ "openFile" ],
        });
        if (!result.canceled && result.filePaths.length > 0) {
            const newIconFileData = Object.assign({}, iconData, {path: result.filePaths[0]});
            db.renewIconData(selectedIcon, newIconFileData, () => {
                message.success(`图标数据已更新`);
                syncLeft();
            });
        }
    };

    // 图标导出相关
    const handleIconExport = async () => {
        const result = await electronAPI.showSaveDialog( {
            title: "导出图标",
            defaultPath: `${iconData.iconName}.${iconData.iconType}`
        });
        if (!result.canceled && result.filePath) {
            electronAPI.writeFile(result.filePath, iconData.iconContent)
                .then(() => message.success(`图标已导出`))
                .catch((err) => message.error(`导出错误: ${err.message}`));
        }
    };
    const handleAllIconExport = async () => {
        const result = await electronAPI.showSaveDialog( {
            title: "导出所有图标",
            defaultPath: `${db.getProjectName()}`
        });
        if (!result.canceled && result.filePath) {
            const dirPath = result.filePath;
            if (!electronAPI.accessSync(dirPath)) {
                electronAPI.mkdirSync(dirPath);
            }
            try {
                const icons = db.getIconList();
                icons.forEach(icon => {
                    electronAPI.writeFileSync(`${dirPath}/${icon.iconName}-${icon.iconCode}.${icon.iconType}`, icon.iconContent);
                });
                message.success(`${icons.length} 个图标已导出`);
            } catch (err) {
                message.error(`导出错误: ${err.message}`);
            }
        }
    };

    // 删除图标相关
    const handleIconRecycle = () => {
        confirm({
            title: "回收图标",
            content: "图标将会被移动到回收站, 并在导出后的预览页面内不可见, 但仍可被使用. 请在确保图标没有被引用后将其从回收站内删除",
            onOk() {
                db.moveIconGroup(selectedIcon, "resource-recycleBin", () => {
                    message.success(`所选的图标已回收`);
                    syncLeft();
                    selectIcon(null);
                });
            }
        });
    };
    const handleIconDelete = () => {
        confirm({
            title: "删除图标",
            content: "当图标没有在项目中被引用时, 将其删除以释放图标字码",
            onOk() {
                db.delIcon(selectedIcon, () => {
                    message.success(`所选的图标已被删除`);
                    syncLeft();
                    selectIcon(null);
                });
            }
        });
    };

    // 复制/移动图标相关
    const handleShowIconGroupEdit = (type) => {
        if (type === "duplicate") {
            setIconGroupEditModelType("duplicate");
            setIconGroupEditModelTitle("选择要复制到的目标分组");
            setIconGroupEditModelVisible(true);
            setIconGroupEditModelTarget(selectedGroup === "resource-uncategorized" ? null : iconGroupEditModelTarget);
        }
        if (type === "move") {
            setIconGroupEditModelType("move");
            setIconGroupEditModelTitle("选择要移动到的目标分组");
            setIconGroupEditModelVisible(true);
            setIconGroupEditModelTarget(selectedGroup === "resource-uncategorized" ? null : iconGroupEditModelTarget);
        }
    };
    const handleEnsureIconGroupEdit = () => {
        if (iconGroupEditModelType === "duplicate") {
            db.duplicateIconGroup(selectedIcon, iconGroupEditModelTarget, () => {
                message.success(`所选的图标已复制到目标分组`);
                syncLeft();
                selectIcon(null);
            });
        }
        if (iconGroupEditModelType === "move") {
            db.moveIconGroup(selectedIcon, iconGroupEditModelTarget, () => {
                message.success(`所选的图标已移动到目标分组`);
                syncLeft();
                selectIcon(null);
            });
        }
        setIconGroupEditModelVisible(false);
    };
    const handleCancelIconGroupEdit = () => {
        setIconGroupEditModelVisible(false);
    };
    const onTargetGroupChange = (e) => {
        setIconGroupEditModelTarget(e.target.value);
    };

    // 构建模态框内的分组列表
    const buildSelectableGroupList = () => {
        return db.getGroupList().map(group => {
            return (
                <Radio key={group.id} style={radioStyle} value={group.id}>
                    {group.groupName}
                </Radio>
            );
        });
    };

    const groupNum = db.getGroupList().length;

    return (
        <div className={style.sideEditor}>

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
                            onChange={handleIconNameChange}
                            onPressEnter={handleIconNameSave}
                            inputTitle="名称"
                            inputHintText={iconNameErrText}
                            inputHintBadgeType="error"
                            inputSave={iconNameCanSave()}
                            inputSaveClick={handleIconNameSave}
                        />

                        {/*图标字码输入框*/}
                        <EnhanceInput
                            autoFocus={false}
                            placeholder="十六进制, 从E000到F8FF"
                            value={iconCode}
                            onChange={handleIconCodeChange}
                            onPressEnter={handleIconCodeSave}
                            inputTitle="字码"
                            inputHintText={iconCodeErrText}
                            inputHintBadgeType="error"
                            inputSave={iconCodeCanSave()}
                            inputSaveClick={handleIconCodeSave}
                        />

                    </div>

                    {/*图标基本信息*/}
                    <div className={style.basicInfoContainer}>
                        <span><b>基本信息</b></span>
                        <p>所属分组: {db.getGroupName(iconData.iconGroup)}</p>
                        <p>原始大小: {`${(iconData.iconSize/512).toFixed(2)} KB`}</p>
                        <p>文件格式: {iconData.iconType && iconData.iconType.toUpperCase()}</p>
                        <p>添加日期: {iconData.createTime}</p>
                        <p>修改日期: {iconData.updateTime}</p>
                    </div>

                    {/*高级操作*/}
                    <div className={style.advanceActionContainer}>
                        <span><b>高级操作</b></span>
                        <Button style={{width: "100%"}} icon={<EditOutlined />} disabled>
                            编辑
                        </Button>
                        <Button style={{width: "100%"}} icon={<RetweetOutlined />} onClick={handleIconContentUpdate}>
                            替换
                        </Button>
                        <Button style={{width: "100%"}} icon={<ExportOutlined />} onClick={handleIconExport}>
                            导出
                        </Button>
                        <Button style={{width: "100%"}} icon={<DeleteOutlined />} onClick={
                            selectedGroup==="resource-recycleBin" ? handleIconDelete : handleIconRecycle
                        }>
                            { selectedGroup==="resource-recycleBin" ? "删除" : "回收" }
                        </Button>
                        <ButtonGroup style={{width: "100%"}}>
                            <Button
                                disabled={groupNum===0}
                                style={{width: "50%"}} icon={<CopyOutlined />}
                                onClick={() => handleShowIconGroupEdit("duplicate")}
                            >复制</Button>
                            <Button
                                disabled={groupNum===0}
                                style={{width: "50%"}} icon={<SelectOutlined />}
                                onClick={() => handleShowIconGroupEdit("move")}
                            >移动</Button>
                        </ButtonGroup>
                    </div>
                </div> :
                <div className={style.sideEditorNoselected}>
                    <img src={selectedIconHint}/>
                    <p>请选择一个图标</p>
                    <p>可在此编辑其属性</p>
                </div>
            }

            {/*组选择模态框*/}
            <Modal
                wrapClassName="vertical-center-modal"
                title={iconGroupEditModelTitle}
                open={iconGroupEditModelVisible}
                onOk={handleEnsureIconGroupEdit}
                onCancel={handleCancelIconGroupEdit}
                footer={[
                    <Button
                        key="cancel"
                        size="large"
                        onClick={handleCancelIconGroupEdit}
                    >取消</Button>,
                    <Button
                        disabled={iconGroupEditModelTarget==="resource-uncategorized" || iconGroupEditModelTarget==="resource-all" || !iconGroupEditModelTarget}
                        key="ensure"
                        size="large"
                        onClick={handleEnsureIconGroupEdit}
                    >确认</Button>
                ]}
            >
                <div className={style.targetGroupContainer}>
                    { iconGroupEditModelType==="duplicate" && <p>新生成的图标将会拥有一个不同的图标字码</p> }
                    <RadioGroup onChange={onTargetGroupChange} value={iconGroupEditModelTarget}>
                        { buildSelectableGroupList() }
                    </RadioGroup>
                </div>
            </Modal>

        </div>
    );
}

export default SideEditor;
