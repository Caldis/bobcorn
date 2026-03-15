// React
import React from 'react';
// Antd
import { Menu, Button } from 'antd';
import type { MenuInfo } from 'rc-menu/lib/interface';
import { DatabaseOutlined, CloudOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
// Style
import style from './index.module.css';
// Database
import db from '../../database';

interface IconInfoBarProps {
    selectedGroup: string;
    selectedSource: string;
    handleSourceSelected: (source: string) => void;
}

function IconInfoBar({ selectedGroup, selectedSource, handleSourceSelected }: IconInfoBarProps) {
    const handleSourceSelectorClick = (e: MenuInfo) => {
        handleSourceSelected(e.key);
    };

    return (
        <div className={style.iconInfoBarContainer}>

            {/*所选分组名称*/}
            <div className={style.pageNameContainer}>
                {/*{db.getGroupName(selectedGroup)}*/}
            </div>

            {/*源切换*/}
            <div className={style.sourceSelectorContainer}>
                <Menu
                    style={{ border: 'none' }}
                    onClick={handleSourceSelectorClick}
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

export default IconInfoBar;
