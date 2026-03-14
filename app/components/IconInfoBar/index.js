// React
import React from 'react';
import PropTypes from 'prop-types';
// Antd
import { Menu, Icon } from 'antd';
import { Button } from 'antd';
// Style
import style from './index.module.css';
// Database
import db from '../../database';

class IconInfoBar extends React.Component{
    constructor(props) {
        super(props);
    }

    handleSourceSelectorClick = (e) => {
	    this.props.handleSourceSelected(e.key);
    };


    render() {
        const { selectedGroup, selectedSource } = this.props;
        return (
            <div className={style.iconInfoBarContainer}>

                {/*所选分组名称*/}
                <div className={style.pageNameContainer}>
                    {/*{db.getGroupName(selectedGroup)}*/}
                </div>

                {/*可拖拽区域*/}
                {/*<div className={style.dragZone}/>*/}

                {/*源切换*/}
                <div className={style.sourceSelectorContainer}>
                    <Menu
                        style={{ border: 'none' }}
                        onClick={this.handleSourceSelectorClick}
                        selectedKeys={[selectedSource]}
                        mode="horizontal"
                    >
                        <Menu.Item key="local">
                            <Icon type="database" />
                            <span>本地</span>
                        </Menu.Item>
                        <Menu.Item key="cloud" disabled>
                            <Icon type="cloud-o" />
                            <span>发现</span>
                        </Menu.Item>
                    </Menu>
                </div>

                {/*边栏显示切换*/}
                <div className={style.sidebarFoldButtonContainer}>
                    <Button shape="circle" icon="menu-fold" />
                    <Button shape="circle" icon="menu-unfold" />
                </div>

            </div>
        );
    }
}

export default IconInfoBar;