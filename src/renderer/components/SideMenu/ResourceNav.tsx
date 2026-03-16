import React from 'react';
import { Menu } from 'antd';
import {
  AppstoreOutlined,
  BookOutlined,
  ClockCircleOutlined,
  FileExclamationOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { cn } from '../../lib/utils';
import style from './index.module.css';
import db from '../../database';

const SubMenu = Menu.SubMenu;

interface ResourceNavProps {
  selectedGroup: string;
  onMenuItemSelected: (e: { key: string }) => void;
}

function ResourceNav({ selectedGroup, onMenuItemSelected }: ResourceNavProps) {
  return (
    <div className={cn('shrink-0', style.sideMenuOverrides)}>
      <Menu
        style={{ width: 250, border: 'none' }}
        selectedKeys={[selectedGroup]}
        onSelect={onMenuItemSelected}
        defaultOpenKeys={['resource']}
        mode="inline"
      >
        <SubMenu
          key="resource"
          disabled={true}
          title={
            <span className="flex items-center gap-1.5">
              <AppstoreOutlined />
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                资源
              </span>
            </span>
          }
        >
          <Menu.Item key="resource-all">
            <span className="flex items-center gap-2">
              <BookOutlined />
              <span>全部</span>
              <span className="ml-auto text-xs text-foreground-muted">{db.getIconCount()}</span>
            </span>
          </Menu.Item>
          <Menu.Item key="resource-recent">
            <span className="flex items-center gap-2">
              <ClockCircleOutlined />
              <span>最近更新</span>
            </span>
          </Menu.Item>
          <Menu.Item key="resource-uncategorized">
            <span className="flex items-center gap-2">
              <FileExclamationOutlined />
              <span>未分组</span>
              <span className="ml-auto text-xs text-foreground-muted">
                {db.getIconCountFromGroup('resource-uncategorized') +
                  db.getIconCountFromGroup('null')}
              </span>
            </span>
          </Menu.Item>
          <Menu.Item key="resource-recycleBin">
            <span className="flex items-center gap-2">
              <DeleteOutlined />
              <span>回收站</span>
              <span className="ml-auto text-xs text-foreground-muted">
                {db.getIconCountFromGroup('resource-recycleBin')}
              </span>
            </span>
          </Menu.Item>
        </SubMenu>
      </Menu>
    </div>
  );
}

export default ResourceNav;
