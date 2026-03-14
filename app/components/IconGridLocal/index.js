// React
import React from 'react';
import PropTypes from 'prop-types';
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
import { throttleMustRun, GlobalEvent } from '../../utils/tools';

// ====================================================
// GlobalEvent.dispatchEvent("SyncCenterLocal");
// ====================================================
const CENTER_ICONS = false;

class IconGridLocal extends React.Component{
    constructor(props) {
        super(props);

        this.state = {
            iconData: {},
            iconBlockWrapperMaxWidth: "100%",
            iconBlockWrapperOpacity: 0,
            iconBlockWidth: getOption().iconBlockSize,
            iconBlockNameVisible: getOption().iconBlockNameVisible,
	        iconBlockCodeVisible: getOption().iconBlockCodeVisible,
	        searchKeyword: null,
        };
    };

    // https://facebook.github.io/react/docs/state-and-lifecycle.html
    // On React IconGridLocal Mounting
    // After React IconGridLocal Mounted
    componentDidMount() {
        // 接收到 onresize 事件后更新图标大小
        CENTER_ICONS && GlobalEvent.addEventHandler("resize", this.updateIconWidthThrottle);
        // 接收到 SyncIconData 的事件刷新图标列表
        GlobalEvent.addEventHandler("SyncCenterLocal", this.sync);
        // 进入后延迟一点, 设置一下位置和透明度
        setTimeout(() => {
            CENTER_ICONS ? this.updateIconWrapperWidth() : this.updateIconWrapperOpacity();
        }, 500);
    }
    componentDidUpdate(prevProps) {
        const { selectedGroup } = this.props;
        // 如果选择的分组改变了, 则刷新
        if (selectedGroup !== prevProps.selectedGroup) {
            this.sync(selectedGroup);
            this.deselectIcon();
        }
    }
    // On React IconGridLocal Unmounting
    componentWillUnmount() {
        // 移除事件注册
        CENTER_ICONS && GlobalEvent.removeEventHandler("resize", this.updateIconWidthThrottle);
        GlobalEvent.removeEventHandler("SyncCenterLocal", this.sync);
    }

    // 同步图标列表数据
    sync = (selectedGroup) => {
    	const group = selectedGroup || this.props.selectedGroup;
	    if (group==="resource-all") {
	        // 如果为 "全部", 则取所有组, 加 "未分类", 以及 "null"
		    const groupIconData = {};
		    db.getGroupList().forEach(group => groupIconData[group.id] = db.getIconListFromGroup(group.id));
            groupIconData["resource-uncategorized"] = db.getIconListFromGroup("resource-uncategorized")
                .concat(db.getIconListFromGroup("null"));
		    this.setState({
			    iconData: groupIconData
		    });
	    } else if (group==="resource-uncategorized") {
	        // 如果为 "未分组", 则取 "未分类", 以及 "null"
            const groupIconData = {};
            groupIconData["resource-uncategorized"] = db.getIconListFromGroup("resource-uncategorized")
                .concat(db.getIconListFromGroup("null"));
            this.setState({
                iconData: groupIconData
            });
        } else {
		    this.setState({
			    iconData: {
				    ...this.state.iconData,
				    [group]: db.getIconListFromGroup(group)
			    }
		    });
	    }
    };

    // Toolbar相关
	// Icon名字是否显示
	updateNameVisible = (visible) => {
		this.setState({
			iconBlockNameVisible: visible
		}, () => setOption({ iconBlockNameVisible: visible }));
	};
	// Icon字码是否显示
	updateCodeVisible = (visible) => {
		this.setState({
			iconBlockCodeVisible: visible
		}, () => setOption({ iconBlockCodeVisible: visible }));
	};


	// 更新搜索字符串
	updateSearchKeyword = (value) => {
		this.setState({
			searchKeyword: value
		})
	};


    // Icon容器宽度透明度相关
    updateIconWrapperOpacity = (opacity) => {
        this.setState({
            iconBlockWrapperOpacity: opacity || 1
        });
    };
    updateIconWrapperWidth = (width) => {
        if (width) this.widthTmp = width;
        const iconWidth = width || this.widthTmp || defOption.iconBlockSize;
        const wrapperWidth = document.querySelector("#iconGridLocalContainer").clientWidth;
        const iconBlockOuterWidth = 26; // Margin: 10x2, border: 3x2, padding: 8x2
        const iconBlockFullWidth = iconWidth + iconBlockOuterWidth;
        const iconBlockSpaceLeftPerRow = wrapperWidth % iconBlockFullWidth;
        this.setState({
            iconBlockWrapperMaxWidth: CENTER_ICONS ? wrapperWidth-iconBlockSpaceLeftPerRow : "100%",
            iconBlockWidth: iconWidth || "auto"
        }, () => {
            this.updateIconWrapperOpacity();
            setOption({ iconBlockSize: width });
        });
    };
    // 更新宽度节流, 100MS内连续调用只会执行一次, 但是每300MS必执行一次
    updateIconWidthThrottle = throttleMustRun(this.updateIconWrapperWidth, 100, 300);

    // 拖放事件相关
    onIconDrop = (acceptedFiles) => {
        console.log(acceptedFiles)
        const self = this;
        const { selectedGroup } = this.props;
        // 检测图标格式, 过滤掉配置中定义的可接受图标格式外的文件 (现在仅SVG)
        const acceptableIcons = acceptedFiles.filter(file => {
            return config.acceptableIconTypes.includes(file.type);
        });
        // 导入文件
        if (acceptedFiles.length === 1) {
            // 如果导入的文件只有一个, 且文件为 icp 项目文件
            const ext = acceptedFiles[0].name.split(".").pop().toLowerCase()
            if (ext === "icp" || ext === "cp") {
                // TODO: 接受项目文件
            }
            // 如果导入的文件只有一个, 且不为项目文件, 且过滤后仍有
            if (acceptableIcons.length > 0) {
                db.addIcons(acceptableIcons, selectedGroup, () => {
                    message.success(`已成功导入 ${acceptableIcons.length} 个图标`);
	                GlobalEvent.dispatchEvent('SyncLeft');
	                GlobalEvent.dispatchEvent('SyncCenterLocal');
                })
            } else {
                message.error(`图标格式不相符, 仅支持导入 SVG 格式图标`);
            }
        } else {
            // 如果大于一个, 则让用户选择取消还是导入剩余
            if (acceptableIcons.length !== acceptedFiles.length) {
                confirm({
                    title: "发现了准备导入的图标中存在不相容的格式",
                    content: "所选的图片中包含了非 SVG 格式的图标, 是否仅导入所选文件中的 SVG 格式图标? 非 SVG 格式的文件将不会被导入。",
                    okText: "仅导入相容的文件",
                    onOk() {
                        db.addIcons(acceptableIcons, selectedGroup, () => {
                            message.success(`已导入了 ${acceptedFiles.length} 个图标中的 ${acceptableIcons.length} 个`);
	                        GlobalEvent.dispatchEvent('SyncLeft');
	                        GlobalEvent.dispatchEvent('SyncCenterLocal');
                        });
                    },
                    onCancel() {
                        message.warning(`导入已取消`);
                    },
                });
            } else {
                db.addIcons(acceptableIcons, selectedGroup, () => {
                    message.success(`已成功导入 ${acceptableIcons.length} 个图标`);
	                GlobalEvent.dispatchEvent('SyncLeft');
	                GlobalEvent.dispatchEvent('SyncCenterLocal');
                });
            }
        }

    };

    // 取消选择图标
    deselectIcon = () => {
        this.props.handleIconSelected(null);
    };

    // 判断是否符合搜索结果
	matchKeyword = (icon) => {
		const { searchKeyword } = this.state;
		if (searchKeyword) {
			// 匹配图标名称和字码是否符合 searchKeyword
			return (icon.iconName.match(new RegExp(searchKeyword, 'ig'))) || (icon.iconCode.match(new RegExp(searchKeyword, 'ig')));
		} else {
			return true;
		}
	};

    // 生成一般图标矩阵
    geneIconGrid = () => {
	    const { selectedGroup } = this.props;
        return this.state.iconData[selectedGroup].map((icon, index) =>
            this.matchKeyword(icon) &&
            <IconBlock
                key={icon.id}
                selected={icon.id===this.props.selectedIcon}
                data={icon}
                name={icon.iconName}
                code={icon.iconCode}
                content={icon.iconContent}
                width={this.state.iconBlockWidth}
                nameVisible={this.state.iconBlockNameVisible}
                codeVisible={this.state.iconBlockCodeVisible}
                handleIconSelected={this.props.handleIconSelected}
            />
        );
    };
	// 生成图标矩阵组 (全部分类下使用, 带分组头)
    geneIconGridWithGroup = () => {
        // 获取分组图标数据并生成矩阵
	    return [this.geneIconGroupGrid({
	        id: "resource-uncategorized",
	        groupName: "未分组"
        })].concat(db.getGroupList().map(group => {
            return this.geneIconGroupGrid(group);
        }));
    };
	// 生成图标矩阵 (用于全部分类, 带分组标题)
    geneIconGroupGrid = (group) => {
        const iconData = this.state.iconData[group.id];
        if (iconData.length !== 0 ) {
	        return (
		        <div key={group.id} className={style.iconGridGroupWrapper}>
			        <div className={style.iconUnselectLayer} onClick={this.deselectIcon}/>
			        <div className={style.iconGridGroupDivider}
			             onClick={() => GlobalEvent.dispatchEvent("SelectGroup", {id: group.id})}>
				        <span>{group.groupName}</span><label>{iconData.length}</label>
			        </div>
			        {
				        iconData.map((icon, index) =>
					        this.matchKeyword(icon) &&
					        <IconBlock
						        key={icon.id}
						        selected={icon.id === this.props.selectedIcon}
						        data={icon}
						        name={icon.iconName}
						        code={icon.iconCode}
						        content={icon.iconContent}
						        width={this.state.iconBlockWidth}
						        nameVisible={this.state.iconBlockNameVisible}
						        codeVisible={this.state.iconBlockCodeVisible}
						        handleIconSelected={this.props.handleIconSelected}
					        />
				        )
			        }
		        </div>
	        );
        }
    };
    geneNodataBlock = () => {
        const { selectedGroup } = this.props;
        if (selectedGroup === "resource-all") {
            return (
                <div className={style.iconGridNodata}>
                    <img src="./resources/imgs/nodata/noIconHint-sad.png"/>
                    <div className={style.iconGridNodataDiscContainer}>
                        <p>还没有图标</p>
	                    <p>直接拖拽图标到此处可添加图标</p>
                    </div>
                </div>
            );
        } else if (selectedGroup === "resource-uncategorized") {
            return (
                <div className={style.iconGridNodata}>
                    <img src="./resources/imgs/nodata/noIconHint-happy.png"/>
                    <div className={style.iconGridNodataDiscContainer}>
                        <p>图标都已经妥善分类了</p>
                        <p>当新加入的图标未分类时, 将出现在此处</p>
                    </div>
                </div>
            );
        } else if (selectedGroup === "resource-recycleBin") {
            return (
                <div className={style.iconGridNodata}>
                    <img src="./resources/imgs/nodata/noIconHint-happy.png"/>
                    <div className={style.iconGridNodataDiscContainer}>
                        <p>回收站很干净</p>
                        <p>当图标被回收后, 将会出现在此处</p>
                    </div>
                </div>
            );
        } else {
            return (
                <div className={style.iconGridNodata}>
                    <img src="./resources/imgs/nodata/noIconHint-sad.png"/>
                    <div className={style.iconGridNodataDiscContainer}>
                        <p>这个分组没有图标</p>
                    </div>
                </div>
            );
        }
    };

    render() {
        const { selectedGroup } = this.props;
        const { iconData } = this.state;
        return (
            <div className={style.iconGridLocalContainer} id="iconGridLocalContainer">
                <Dropzone
                    noClick
                    onDrop={this.onIconDrop}
                >
                    {({getRootProps, getInputProps, isDragActive}) => (
                        <div {...getRootProps({ className: isDragActive ? style.iconGridWrapperActive : style.iconGridWrapper })}>
                            <input {...getInputProps()} />
                            <div className={style.iconUnselectLayer} onClick={this.deselectIcon}/>
                            <div
                                className={style.iconGridScrollResizeWrapper}
                                style={{
                                    width: CENTER_ICONS ? null : "100%",
                                    maxWidth: this.state.iconBlockWrapperMaxWidth,
                                    opacity: this.state.iconBlockWrapperOpacity
                                }}
                            >
                                {

                                    selectedGroup==="resource-all" ?
	                                    db.getIconCount()!==0 ?
	                                        this.geneIconGridWithGroup() : this.geneNodataBlock() :
                                        iconData[selectedGroup] && iconData[selectedGroup].length!==0 ?
	                                        this.geneIconGrid() : this.geneNodataBlock()
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
                        updateIconWidth={this.updateIconWidthThrottle}
                        defaultNameVisible={getOption().iconBlockNameVisible}
                        updateNameVisible={this.updateNameVisible}
                        defaultCodeVisible={getOption().iconBlockCodeVisible}
                        updateCodeVisible={this.updateCodeVisible}
                        updateSearchKeyword={this.updateSearchKeyword}
                    />
                </div>
            </div>
        );
    }
}

export default IconGridLocal;