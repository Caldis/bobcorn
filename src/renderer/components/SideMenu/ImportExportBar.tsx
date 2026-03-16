import React from 'react';
import { LogIn, Save, Settings, Sun, Moon } from 'lucide-react';
import { Button, ButtonGroup, Dropdown } from '../ui';
import useAppStore from '../../store';

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
          menu={{
            items: [
              { key: 'importIcon', label: '导入图标' },
              { key: 'importProj', label: '导入项目' },
            ],
            onClick: onImportClick,
          }}
        >
          <Button className="!rounded-l-md" style={{ width: '50%' }} icon={<LogIn size={14} />}>
            导入
          </Button>
        </Dropdown>
        <Button
          className="!rounded-r-md"
          style={{ width: '50%' }}
          onClick={onExportClick}
          icon={<Save size={14} />}
        >
          导出
        </Button>
      </ButtonGroup>
      <Button
        data-testid="settings-btn"
        type="default"
        shape="circle"
        icon={<Settings size={14} />}
        onClick={onShowEditPrefix}
        className="shrink-0 !border-border hover:!border-brand-400 hover:!text-brand-500"
      />
      <Button
        type="default"
        shape="circle"
        icon={darkMode ? <Sun size={14} /> : <Moon size={14} />}
        onClick={toggleDarkMode}
        className="shrink-0 !border-border hover:!border-brand-400 hover:!text-brand-500"
      />
    </div>
  );
}

export default ImportExportBar;
