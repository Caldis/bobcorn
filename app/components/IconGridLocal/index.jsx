// React
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// React Dropzone
import Dropzone from 'react-dropzone';
// antd
import { message, Modal } from 'antd';
const confirm = Modal.confirm;
// Components
import IconBlock from '../iconBlock';
import IconToolbar from '../iconToolbar';
// Style
import style from './index.module.css';
// Database
import db from '../../database';
// Config
import config, { defOption, setOption, getOption } from '../../config';
// Utils
import { throttleMustRun } from '../../utils/tools';
// Images
import noIconHintSad from '../../resources/imgs/nodata/noIconHint-sad.png';
import noIconHintHappy from '../../resources/imgs/nodata/noIconHint-happy.png';
// Store
import useAppStore from '../../store';

function IconGridLocal({ selectedGroup, handleIconSelected, selectedIcon }) {
    const syncLeft = useAppStore(state => state.syncLeft);
    const selectGroup = useAppStore(state => state.selectGroup);

    const [iconData, setIconData] = useState({});
    const [iconBlockWrapperMaxWidth, setIconBlockWrapperMaxWidth] = useState("100%");
    const [iconBlockWrapperOpacity, setIconBlockWrapperOpacity] = useState(0);
    const [iconBlockWidth, setIconBlockWidth] = useState(getOption().iconBlockSize);
    const [iconBlockNameVisible, setIconBlockNameVisible] = useState(getOption().iconBlockNameVisible);
    const [iconBlockCodeVisible, setIconBlockCodeVisible] = useState(getOption().iconBlockCodeVisible);
    const [searchKeyword, setSearchKeyword] = useState(null);

    const widthTmpRef = useRef(null);
    const prevSelectedGroupRef = useRef(selectedGroup);

    // Sync icon data
    const sync = useCallback((group) => {
        const targetGroup = group || selectedGroup;
        if (targetGroup === "resource-all") {
            const groupIconData = {};
            db.getGroupList().forEach(g => groupIconData[g.id] = db.getIconListFromGroup(g.id));
            groupIconData["resource-uncategorized"] = db.getIconListFromGroup("resource-uncategorized")
                .concat(db.getIconListFromGroup("null"));
            setIconData(groupIconData);
        } else if (targetGroup === "resource-uncategorized") {
            const groupIconData = {};
            groupIconData["resource-uncategorized"] = db.getIconListFromGroup("resource-uncategorized")
                .concat(db.getIconListFromGroup("null"));
            setIconData(groupIconData);
        } else {
            setIconData(prev => ({
                ...prev,
                [targetGroup]: db.getIconListFromGroup(targetGroup)
            }));
        }
    }, [selectedGroup]);

    useEffect(() => {
        // Initial sync
        sync();
        // 进入后延迟一点, 设置一下位置和透明度
        setTimeout(() => {
            setIconBlockWrapperOpacity(1);
        }, 500);
    }, []);

    // Subscribe to store changes to trigger re-sync (replaces SyncCenterLocal event)
    // When groupData changes in the store (after syncLeft), re-sync the center panel
    const groupData = useAppStore(state => state.groupData);
    useEffect(() => {
        sync();
    }, [groupData]);

    useEffect(() => {
        if (selectedGroup !== prevSelectedGroupRef.current) {
            prevSelectedGroupRef.current = selectedGroup;
            sync(selectedGroup);
            deselectIcon();
        }
    }, [selectedGroup]);

    // Toolbar相关
    const updateNameVisible = (visible) => {
        setIconBlockNameVisible(visible);
        setOption({ iconBlockNameVisible: visible });
    };
    const updateCodeVisible = (visible) => {
        setIconBlockCodeVisible(visible);
        setOption({ iconBlockCodeVisible: visible });
    };

    // 更新搜索字符串
    const updateSearchKeyword = (value) => {
        setSearchKeyword(value);
    };

    // Icon容器宽度透明度相关
    const updateIconWrapperWidth = (width) => {
        if (width) widthTmpRef.current = width;
        const iconWidth = width || widthTmpRef.current || defOption.iconBlockSize;
        setIconBlockWrapperMaxWidth("100%");
        setIconBlockWidth(iconWidth || "auto");
        setIconBlockWrapperOpacity(1);
        setOption({ iconBlockSize: width });
    };

    // 更新宽度节流
    const updateIconWidthThrottle = useMemo(
        () => throttleMustRun(updateIconWrapperWidth, 100, 300),
        []
    );

    // 拖放事件相关
    const onIconDrop = (acceptedFiles) => {
        console.log(acceptedFiles);
        const acceptableIcons = acceptedFiles.filter(file => {
            return config.acceptableIconTypes.includes(file.type);
        });
        if (acceptedFiles.length === 1) {
            const ext = acceptedFiles[0].name.split(".").pop().toLowerCase();
            if (ext === "icp" || ext === "cp") {
                // TODO: 接受项目文件
            }
            if (acceptableIcons.length > 0) {
                db.addIcons(acceptableIcons, selectedGroup, () => {
                    message.success(`已成功导入 ${acceptableIcons.length} 个图标`);
                    syncLeft();
                    sync();
                });
            } else {
                message.error(`图标格式不相符, 仅支持导入 SVG 格式图标`);
            }
        } else {
            if (acceptableIcons.length !== acceptedFiles.length) {
                confirm({
                    title: "发现了准备导入的图标中存在不相容的格式",
                    content: "所选的图片中包含了非 SVG 格式的图标, 是否仅导入所选文件中的 SVG 格式图标? 非 SVG 格式的文件将不会被导入。",
                    okText: "仅导入相容的文件",
                    onOk() {
                        db.addIcons(acceptableIcons, selectedGroup, () => {
                            message.success(`已导入了 ${acceptedFiles.length} 个图标中的 ${acceptableIcons.length} 个`);
                            syncLeft();
                            sync();
                        });
                    },
                    onCancel() {
                        message.warning(`导入已取消`);
                    },
                });
            } else {
                db.addIcons(acceptableIcons, selectedGroup, () => {
                    message.success(`已成功导入 ${acceptableIcons.length} 个图标`);
                    syncLeft();
                    sync();
                });
            }
        }
    };

    // 取消选择图标
    const deselectIcon = () => {
        handleIconSelected(null);
    };

    // 判断是否符合搜索结果
    const matchKeyword = (icon) => {
        if (searchKeyword) {
            return (icon.iconName.match(new RegExp(searchKeyword, 'ig'))) || (icon.iconCode.match(new RegExp(searchKeyword, 'ig')));
        } else {
            return true;
        }
    };

    // 生成一般图标矩阵
    const geneIconGrid = () => {
        return iconData[selectedGroup].map((icon, index) =>
            matchKeyword(icon) &&
            <IconBlock
                key={icon.id}
                selected={icon.id === selectedIcon}
                data={icon}
                name={icon.iconName}
                code={icon.iconCode}
                content={icon.iconContent}
                width={iconBlockWidth}
                nameVisible={iconBlockNameVisible}
                codeVisible={iconBlockCodeVisible}
                handleIconSelected={handleIconSelected}
            />
        );
    };

    // 生成图标矩阵组 (全部分类下使用, 带分组头)
    const geneIconGridWithGroup = () => {
        return [geneIconGroupGrid({
            id: "resource-uncategorized",
            groupName: "未分组"
        })].concat(db.getGroupList().map(group => {
            return geneIconGroupGrid(group);
        }));
    };

    // 生成图标矩阵 (用于全部分类, 带分组标题)
    const geneIconGroupGrid = (group) => {
        const groupIconData = iconData[group.id];
        if (groupIconData && groupIconData.length !== 0) {
            return (
                <div key={group.id} className={style.iconGridGroupWrapper}>
                    <div className={style.iconUnselectLayer} onClick={deselectIcon}/>
                    <div className={style.iconGridGroupDivider}
                         onClick={() => selectGroup(group.id)}>
                        <span>{group.groupName}</span><label>{groupIconData.length}</label>
                    </div>
                    {
                        groupIconData.map((icon, index) =>
                            matchKeyword(icon) &&
                            <IconBlock
                                key={icon.id}
                                selected={icon.id === selectedIcon}
                                data={icon}
                                name={icon.iconName}
                                code={icon.iconCode}
                                content={icon.iconContent}
                                width={iconBlockWidth}
                                nameVisible={iconBlockNameVisible}
                                codeVisible={iconBlockCodeVisible}
                                handleIconSelected={handleIconSelected}
                            />
                        )
                    }
                </div>
            );
        }
    };

    const geneNodataBlock = () => {
        if (selectedGroup === "resource-all") {
            return (
                <div className={style.iconGridNodata}>
                    <img src={noIconHintSad}/>
                    <div className={style.iconGridNodataDiscContainer}>
                        <p>还没有图标</p>
                        <p>直接拖拽图标到此处可添加图标</p>
                    </div>
                </div>
            );
        } else if (selectedGroup === "resource-uncategorized") {
            return (
                <div className={style.iconGridNodata}>
                    <img src={noIconHintHappy}/>
                    <div className={style.iconGridNodataDiscContainer}>
                        <p>图标都已经妥善分类了</p>
                        <p>当新加入的图标未分类时, 将出现在此处</p>
                    </div>
                </div>
            );
        } else if (selectedGroup === "resource-recycleBin") {
            return (
                <div className={style.iconGridNodata}>
                    <img src={noIconHintHappy}/>
                    <div className={style.iconGridNodataDiscContainer}>
                        <p>回收站很干净</p>
                        <p>当图标被回收后, 将会出现在此处</p>
                    </div>
                </div>
            );
        } else {
            return (
                <div className={style.iconGridNodata}>
                    <img src={noIconHintSad}/>
                    <div className={style.iconGridNodataDiscContainer}>
                        <p>这个分组没有图标</p>
                    </div>
                </div>
            );
        }
    };

    return (
        <div className={style.iconGridLocalContainer} id="iconGridLocalContainer">
            <Dropzone
                noClick
                onDrop={onIconDrop}
            >
                {({getRootProps, getInputProps, isDragActive}) => (
                    <div {...getRootProps({ className: isDragActive ? style.iconGridWrapperActive : style.iconGridWrapper })}>
                        <input {...getInputProps()} />
                        <div className={style.iconUnselectLayer} onClick={deselectIcon}/>
                        <div
                            className={style.iconGridScrollResizeWrapper}
                            style={{
                                width: "100%",
                                maxWidth: iconBlockWrapperMaxWidth,
                                opacity: iconBlockWrapperOpacity
                            }}
                        >
                            {
                                selectedGroup==="resource-all" ?
                                    db.getIconCount()!==0 ?
                                        geneIconGridWithGroup() : geneNodataBlock() :
                                    iconData[selectedGroup] && iconData[selectedGroup].length!==0 ?
                                        geneIconGrid() : geneNodataBlock()
                            }
                        </div>
                    </div>
                )}
            </Dropzone>
            <div className={style.iconGridDropOverlay}>
                <div className={style.iconGridHintContainer}>
                    <div>拖拽到此处将图标添加到该分组</div>
                </div>
            </div>
            <div className={style.iconToolbarOuterContainer}>
                <IconToolbar
                    defaultIconWidth={getOption().iconBlockSize}
                    updateIconWidth={updateIconWidthThrottle}
                    defaultNameVisible={getOption().iconBlockNameVisible}
                    updateNameVisible={updateNameVisible}
                    defaultCodeVisible={getOption().iconBlockCodeVisible}
                    updateCodeVisible={updateCodeVisible}
                    updateSearchKeyword={updateSearchKeyword}
                />
            </div>
        </div>
    );
}

export default IconGridLocal;
