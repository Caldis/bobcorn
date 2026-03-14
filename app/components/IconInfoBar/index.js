// React
import React from 'react';
import PropTypes from 'prop-types';
// Antd
import { Menu, Button } from 'antd';
import { DatabaseOutlined, CloudOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
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
                            <DatabaseOutlined />
                            <span>本地</span>
                        </Menu.Item>
                        <Menu.Item key="cloud" disabled>
                            <CloudOutlined />
                            <span>发现</span>
                        </Menu.Item>
                    </Menu>
                </div>

                {/*边栏显示切换*/}
                <div className={style.sidebarFoldButtonContainer}>
                    <Button shape="circle" icon={<MenuFoldOutlined />} />
                    <Button shape="circle" icon={<MenuUnfoldOutlined />} />
                </div>

            </div>
        );
    }
}

export default IconInfoBar;