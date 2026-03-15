// React
import React from 'react';
// Antd
import { Menu, Button } from 'antd';
import type { MenuInfo } from 'rc-menu/lib/interface';
import {
  DatabaseOutlined,
  CloudOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
// Utils
import { cn } from '../../lib/utils';
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
    <div
      className={cn(
        '[-webkit-app-region:drag]',
        'relative box-border h-[50px]',
        'flex flex-row justify-between items-center',
        'border-b border-border',
        'dark:border-border'
      )}
    >
      {/*所选分组名称*/}
      <div
        className={cn(
          'w-[220px] pl-[30px]',
          'overflow-hidden whitespace-nowrap text-ellipsis',
          'z-[1]',
          'text-foreground dark:text-foreground'
        )}
      >
        {/*{db.getGroupName(selectedGroup)}*/}
      </div>

      {/*源切换*/}
      <div
        className={cn(
          '[-webkit-app-region:no-drag]',
          'relative flex flex-row',
          '-translate-x-[40%]',
          'z-[100]'
        )}
      >
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
      <div className={cn('opacity-0 pointer-events-none', 'pr-[15px] z-[1]', '[&>button]:mx-1')}>
        <Button shape="circle" icon={<MenuFoldOutlined />} />
        <Button shape="circle" icon={<MenuUnfoldOutlined />} />
      </div>
    </div>
  );
}

export default IconInfoBar;
