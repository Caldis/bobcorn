// React
import React, { useState } from 'react';
// Antd
import { Button, Radio, Input, Select, Slider, Switch } from 'antd';
import { CloseOutlined, EyeOutlined } from '@ant-design/icons';
const InputGroup = Input.Group;
const Search = Input.Search;
const Option = Select.Option;
// Style
import style from './index.module.css';

function IconToolbar({
    defaultIconWidth = 100,
    updateIconWidth = () => {},
    defaultNameVisible = true,
    updateNameVisible = () => {},
    defaultCodeVisible = true,
    updateCodeVisible = () => {},
    updateSearchKeyword = () => {},
}) {
    const [orderType, setOrderType] = useState("addTime");
    const [orderDirection, setOrderDirection] = useState("forward");
    const [filterType, setFilterType] = useState("format");
    const [showActionBar, setShowActionBar] = useState(false);
    const [actionBarType, setActionBarType] = useState(null);
    const [showName, setShowName] = useState(defaultNameVisible);
    const [showCode, setShowCode] = useState(defaultCodeVisible);

    // 控制动作条可见性
    const handleToggleActionBar = (type) => {
        setShowActionBar(actionBarType === type ? !showActionBar : true);
        setActionBarType(type);
    };
    const handelHideActionBar = () => {
        setShowActionBar(false);
        setActionBarType(null);
    };

    // 控制图标名字可见性
    const handleNameVisibilityChange = (e) => {
        setShowName(e.target.value);
        updateNameVisible(e.target.value);
    };
    // 控制图标字码可见性
    const handleCodeVisibilityChange = (e) => {
        setShowCode(e.target.value);
        updateCodeVisible(e.target.value);
    };
    // 排序动作条相关
    const handleOrderTypeChange = (e) => {
        setOrderType(e.target.value);
    };
    const handleOrderDirectionChange = (e) => {
        setOrderDirection(e.target.value);
    };

    // 控制图标大小
    const handleIconWidthChange = (value) => {
        updateIconWidth(value);
    };
    // 格式化滑动条提示
    const iconWidthControllerTipFormatter = (value) => {
        return `${value-50}%`;
    };

    return (
        <div className={style.iconToolbarContainer}>

            {/*过滤控制器浮层*/}
            <div
                className={style.iconActionBar}
                style={{
                    opacity: showActionBar?0.6:0,
                    pointerEvents: showActionBar? "initial":"none",
                    backdropFilter: showActionBar? "blur(5px)":"blur(0)",
                }}
            >
                {
                    actionBarType==="visual" &&
                    <div className={style.actionContent}>
                        <Radio.Group value={showName} onChange={handleNameVisibilityChange}>
                            <Radio.Button value={true}>显示图标名称</Radio.Button>
                            <Radio.Button value={false}>隐藏图标名称</Radio.Button>
                        </Radio.Group>
                        <Radio.Group value={showCode} onChange={handleCodeVisibilityChange}>
                            <Radio.Button value={true}>显示图标字码</Radio.Button>
                            <Radio.Button value={false}>隐藏图标字码</Radio.Button>
                        </Radio.Group>
                    </div>
                }
                {
                    actionBarType==="order" &&
                    <div className={style.actionContent}>
                        <Radio.Group value={orderType} onChange={handleOrderTypeChange}>
                            <Radio.Button value="addTime">按添加时间</Radio.Button>
                            <Radio.Button value="editTime">按修改时间</Radio.Button>
                            <Radio.Button value="name">按名称</Radio.Button>
                            <Radio.Button value="code">按字码</Radio.Button>
                            <Radio.Button value="size">按大小</Radio.Button>
                        </Radio.Group>
                        <Radio.Group value={orderDirection} onChange={handleOrderDirectionChange}>
                            <Radio.Button value="forward">升序</Radio.Button>
                            <Radio.Button value="reverse">降序</Radio.Button>
                        </Radio.Group>
                    </div>
                }
                <div className={style.iconActionBarCloseButtonContainer}>
                    <Button className={style.iconActionBarCloseButton} shape="circle" icon={<CloseOutlined />} onClick={handelHideActionBar}/>
                </div>
            </div>

            <div className={style.iconControllerContainer}>

                {/*图标过滤控制*/}
                <div className={style.iconActionButtonContainer}>

                    {/*图标显示控制按钮*/}
                    <div className={style.iconOrderButtonContainer}>
                        <Button
                            shape="circle"
                            icon={<EyeOutlined />}
                            onClick={() => handleToggleActionBar("visual")}
                        />
                    </div>

                </div>

                {/*图标大小控制*/}
                <div className={style.iconWidthControllerContainer}>
                    <Slider
                        defaultValue={defaultIconWidth}
                        min={50} max={150}
                        tipFormatter={iconWidthControllerTipFormatter}
                        onChange={handleIconWidthChange}
                    />
                </div>

                {/*搜索栏*/}
                <div className={style.iconSearchBarContainer}>
                    <Search
                        placeholder="搜索图标名称或字码"
                        onChange={e => updateSearchKeyword(e.target.value)}
                        onSearch={updateSearchKeyword}
                    />
                </div>

            </div>

        </div>
    );
}

export default IconToolbar;
