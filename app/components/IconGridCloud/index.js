// React
import React from 'react';
import PropTypes from 'prop-types';
// Style
import style from './index.css';
// Antd
import { Spin, Select, Input, Button, message } from 'antd';
const Search = Input.Search;
const InputGroup = Input.Group;
const Option = Select.Option;
// Components
import IconBlock from '../iconBlock';
import IconToolbar from '../iconToolbar';
// Database
import db from '../../database';
// spider
// import { iconfontCnSpider } from '../../utils/spider';
// Utils
import { GlobalEvent } from '../../utils/tools';

class Component extends React.Component{
    constructor(props) {
        super(props);

        this.state = {
	        loading: false,
	        onSearch: false,
	        searchKeyword: "",
			searchTimes: 1,
	        searchResCount: 0,
	        searchSource: "iconfont",
	        icons: []
        };
    }

	componentWillUpdate(nextProps, nextState) {
    	// 如果修改了源, 则重新执行搜索, 同时 clean
		if (nextState.searchSource !== this.state.searchSource) {
			this.handleSearch({ page: 1, append: false });
		}
	}

    // 选择源
	handleSourceChange = (searchSource) => {
		this.setState({ searchSource });
	};

	// 设置Loading状态
	showLoading = (loading) => {
		this.setState({ loading });
	};

    // 调用爬虫进行搜索
	// page: 搜索的页码
	// append: 搜索的结果是追加到尾部或整体替换
    handleSearch = (userOpt) => {
    	const defOpt = { page: 1, append: false };
    	const opt = Object.assign({}, defOpt, userOpt);
	    this.showLoading(true);
    	const { searchKeyword, searchSource, icons:stateIcons } = this.state;
    	switch(searchSource) {
		    case "iconfont":
			    // iconfontCnSpider(searchKeyword, opt.page).then(data => {
			    // 	const { count, icons } = data;
				 //    this.setState({
					//     onSearch: true,
					//     searchTimes: opt.append ? opt.page : 1,
					//     searchResCount: count,
					//     icons: opt.append ? stateIcons.concat(icons) : icons
				 //    });
				 //    this.showLoading(false);
			    // }).catch(err => {
			    // 	console.error(err);
				 //    this.showLoading(false);
			    // });
			    break;
		    default:
		    	console.error("没有选择的源");
			    this.showLoading(false);
	    }
    };
	handleSearchMore = () => {
		const { searchTimes } = this.state;
		this.handleSearch({ page: searchTimes+1, append: true });
	};

    handleAddIcon = (id, iconData) => {
    	const { icons } = this.state;
	    iconData.checked = true;
    	this.setState({
		    icons: icons.slice(0, iconData.index).concat(iconData).concat(icons.slice(iconData.index+1, icons.length))
    	}, () => {
		    const { selectedGroup } = this.props;
		    db.addIconsFromData([iconData], selectedGroup, () => {
			    GlobalEvent.dispatchEvent('SyncLeft');
			    GlobalEvent.dispatchEvent('SyncCenterLocal');
			    message.success(`图标 ${iconData.iconName} 已添加到 ${db.getGroupName(selectedGroup)}`);
		    });
	    });
    };

    // 生成图标矩阵
	geneIconGrid = () => {
		return this.state.icons.map((icon, index) => {
			icon.index = index;
			return (
				<IconBlock
					key={index}
					selected={false}
					data={icon}
					name={icon.iconName}
					code={""}
					content={icon.iconContent}
					width={80}
					nameVisible={true}
					codeVisible={false}
					checked={icon.checked}
					handleIconSelected={this.handleAddIcon}
				/>
			);
		});
	};

    render() {
    	const { loading, onSearch, searchResCount, icons } = this.state;
        return (
            <div className={style.iconGridCloudContainer} id="iconGridCloudContainer">

                <div className={onSearch ? style.searchBarContainerTop : style.searchBarContainer}>
	                <Spin spinning={loading}>
	                    <InputGroup compact>
	                        <Select defaultValue="iconfont" onChange={this.handleSourceChange}>
	                            <Option value="iconfont">Iconfont</Option>
	                        </Select>
	                        <Search
	                            placeholder="搜索图标"
	                            onChange={(e) => this.setState({ searchKeyword: e.target.value })}
	                            onSearch={() => this.handleSearch({ page: 1, append: false })}
	                        />
	                    </InputGroup>
	                </Spin>
                </div>

	            <div className={style.searchResContainer}>
		            {
			            icons.length>0 ?
				            <div className={style.searchResWrapper}>
					            { this.geneIconGrid() }
					            <div className={style.loadMoreButtonWrapper}>
						            <Button
							            disabled={searchResCount<=icons.length || loading}
							            type="primary"
							            onClick={this.handleSearchMore}
						            >
							            {
								            searchResCount<=icons.length ? "已全部加载" : "加载更多"
							            }
						            </Button>
					            </div>
				            </div> :
				            onSearch &&
				            <div className={style.searchResNodataWrapper}>
				                <span>无搜索结果或服务器异常</span>
				            </div>
		            }
	            </div>
            </div>
        );
    }
}



// https://facebook.github.io/react/docs/typechecking-with-proptypes.html
// Prop Types
Component.propTypes = {
    // optionalDummyProps: PropTypes.string,
    // requiredDummyProps: PropTypes.func.isRequired,
};
// Default Props
Component.defaultProps = {
    // optionalDummyProps: 'dummyAttr',
    // requiredDummyProps: () => {},
};

export default Component;