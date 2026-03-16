import React from 'react';
import { Menu, Button, Dropdown } from 'antd';
import {
  LoginOutlined,
  SaveOutlined,
  SettingOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import style from './index.module.css';
import useAppStore from '../../store';

const ButtonGroup = Button.Group;

interface ImportExportBarProps {
  onImportClick: (e: { key: string }) => void;
  onExportClick: (e?: { key?: string } | React.MouseEvent) => void;
  onShowEditPrefix: () => void;
}

function ImportExportBar({ onImportClick, onExportClick, onShowEditPrefix }: ImportExportBarProps) {
  const darkMode = useAppStore((state: any) => state.darkMode);
  const toggleDarkMode = useAppStore((state: any) => state.toggleDarkMode);

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-t border-border px-3 h-[49px] pb-1">
      <ButtonGroup style={{ flex: 1 }}>
        <Dropdown
          overlay={
            <Menu onClick={onImportClick} className={style.sideImportMenu}>
              <Menu.Item key="importIcon">导入图标</Menu.Item>
              <Menu.Item key="importProj">导入项目</Menu.Item>
            </Menu>
          }
        >
          <Button className="!rounded-l-md" style={{ width: '50%' }} icon={<LoginOutlined />}>
            导入
          </Button>
        </Dropdown>
        <Button
          className="!rounded-r-md"
          style={{ width: '50%' }}
          onClick={onExportClick}
          icon={<SaveOutlined />}
        >
          导出
        </Button>
      </ButtonGroup>
      <Button
        data-testid="settings-btn"
        type="default"
        shape="circle"
        icon={<SettingOutlined />}
        onClick={onShowEditPrefix}
        className="shrink-0 !border-border hover:!border-brand-400 hover:!text-brand-500"
      />
      <Button
        type="default"
        shape="circle"
        icon={darkMode ? <SunOutlined /> : <MoonOutlined />}
        onClick={toggleDarkMode}
        className="shrink-0 !border-border hover:!border-brand-400 hover:!text-brand-500"
      />
    </div>
  );
}

export default ImportExportBar;
