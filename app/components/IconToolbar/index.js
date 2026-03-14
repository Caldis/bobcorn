// React
import React from 'react';
import PropTypes from 'prop-types';
// Antd
import { Button, Radio, Input, Select, Slider, Switch } from 'antd';
const InputGroup = Input.Group;
const Search = Input.Search;
const Option = Select.Option;
// Style
import style from './index.css';

class IconToolbar extends React.Component{
    constructor(props) {
        super(props);

        this.state = {
            orderType: "addTime", // addTime, editTime, name, code, size
            orderDirection: "forward", // forward, reverse
            filterType: "format", // format
            showActionBar: false,
            actionBarType: null, // visual, order, filter
            showName: props.defaultNameVisible,
            showCode: props.defaultCodeVisible,
        };
    }
	
    // 控制动作条可见性
	// type: visual(图标名称, 字码), order(排序方式, 排序前后), filter
    handleToggleActionBar = (type) => {
        const { showActionBar, actionBarType } = this.state;
        this.setState({
            showActionBar: actionBarType===type ? !showActionBar : true,
            actionBarType: type
        });
    };
	handelHideActionBar = () => {
		this.setState({
			showActionBar: false,
			actionBarType: null
		});
	};

	// 控制图标名字可见性
	handleNameVisibilityChange = (e) => {
		this.setState({ showName: e.target.value });
		this.props.updateNameVisible(e.target.value);
	};
	// 控制图标字码可见性
	handleCodeVisibilityChange = (e) => {
		this.setState({ showCode: e.target.value });
		this.props.updateCodeVisible(e.target.value);
	};
	// 排序动作条相关
    handleOrderTypeChange = (e) => {
        this.setState({ orderType: e.target.value });
    };
    handleOrderDirectionChange = (e) => {
        this.setState({ orderDirection: e.target.value });
    };
	
    // 控制图标大小
    handleIconWidthChange = (value) => {
        this.props.updateIconWidth(value);
    };
    // 格式化滑动条提示
    iconWidthControllerTipFormatter = (value) => {
        return `${value-50}%`;
    };

    render() {
        return (
            <div className={style.iconToolbarContainer}>

                {/*过滤控制器浮层*/}
                <div
                    className={style.iconActionBar}
                    style={{
                        opacity: this.state.showActionBar?0.6:0,
                        pointerEvents: this.state.showActionBar? "initial":"none",
                        backdropFilter: this.state.showActionBar? "blur(5px)":"blur(0)",
                    }}
                >
	                {
		                this.state.actionBarType==="visual" &&
		                <div className={style.actionContent}>
			                <Radio.Group value={this.state.showName} onChange={this.handleNameVisibilityChange}>
				                <Radio.Button value={true}>显示图标名称</Radio.Button>
				                <Radio.Button value={false}>隐藏图标名称</Radio.Button>
			                </Radio.Group>
			                <Radio.Group value={this.state.showCode} onChange={this.handleCodeVisibilityChange}>
				                <Radio.Button value={true}>显示图标字码</Radio.Button>
				                <Radio.Button value={false}>隐藏图标字码</Radio.Button>
			                </Radio.Group>
		                </div>
	                }
	                {
		                this.state.actionBarType==="order" &&
		                <div className={style.actionContent}>
			                <Radio.Group value={this.state.orderType} onChange={this.handleOrderTypeChange}>
				                <Radio.Button value="addTime">按添加时间</Radio.Button>
				                <Radio.Button value="editTime">按修改时间</Radio.Button>
				                <Radio.Button value="name">按名称</Radio.Button>
				                <Radio.Button value="code">按字码</Radio.Button>
				                <Radio.Button value="size">按大小</Radio.Button>
			                </Radio.Group>
			                <Radio.Group value={this.state.orderDirection} onChange={this.handleOrderDirectionChange}>
				                <Radio.Button value="forward">升序</Radio.Button>
				                <Radio.Button value="reverse">降序</Radio.Button>
			                </Radio.Group>
		                </div>
	                }
                    <div className={style.iconActionBarCloseButtonContainer}>
                        <Button className={style.iconActionBarCloseButton} shape="circle" icon="close" onClick={this.handelHideActionBar}/>
                    </div>
                </div>

                <div className={style.iconControllerContainer}>

                    {/*图标过滤控制*/}
                    <div className={style.iconActionButtonContainer}>

	                    {/*图标显示控制按钮*/}
	                    <div className={style.iconOrderButtonContainer}>
		                    <Button
			                    shape="circle"
			                    icon="eye-o"
			                    onClick={() => this.handleToggleActionBar("visual")}
		                    />
	                    </div>

                        {/*图标排序控制按钮*/}
                        {/*<div className={style.iconOrderButtonContainer}>*/}
                            {/*<Button*/}
                                {/*shape="circle"*/}
                                {/*icon="swap"*/}
                                {/*onClick={() => this.handleToggleActionBar("order")}*/}
                            {/*/>*/}
                        {/*</div>*/}

                        {/*图标过滤按钮*/}
                        {/*<div className={style.iconFilterButtonContainer}>*/}
                            {/*<Button*/}
                                {/*shape="circle"*/}
                                {/*icon="filter"*/}
                                {/*onClick={() => this.handleToggleActionBar("filter")}*/}
                            {/*/>*/}
                        {/*</div>*/}

                    </div>

	                {/*图标大小控制*/}
	                <div className={style.iconWidthControllerContainer}>
		                <Slider
			                defaultValue={this.props.defaultIconWidth}
			                min={50} max={150}
			                tipFormatter={this.iconWidthControllerTipFormatter}
			                onChange={this.handleIconWidthChange}
		                />
	                </div>

	                {/*搜索栏*/}
	                <div className={style.iconSearchBarContainer}>
		                <Search
			                placeholder="搜索图标名称或字码"
			                onChange={e => this.props.updateSearchKeyword(e.target.value)}
			                onSearch={this.props.updateSearchKeyword}
		                />
	                </div>

                </div>

            </div>
        );
    }
}

// https://facebook.github.io/react/docs/typechecking-with-proptypes.html
// Prop Types
IconToolbar.propTypes = {
    defaultIconWidth: PropTypes.number,
    updateIconWidth: PropTypes.func,
	defaultNameVisible: PropTypes.bool,
	updateNameVisible: PropTypes.func,
	defaultCodeVisible: PropTypes.bool,
	updateCodeVisible: PropTypes.func,
	updateSearchKeyword: PropTypes.func,
};
// Default Props
IconToolbar.defaultProps = {
    defaultIconWidth: 100,
    updateIconWidth: () => {},
    defaultNameVisible: true,
    updateNameVisible: () => {},
	defaultCodeVisible: true,
    updateCodeVisible: () => {},
	updateSearchKeyword: () => {},
};

export default IconToolbar;