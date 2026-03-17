import React from 'react';
import { LogIn, Save, Settings, Sun, Moon } from 'lucide-react';
import { Button, Dropdown } from '../ui';
import useAppStore from '../../store';

interface ImportExportBarProps {
  onImportClick: (e: { key: string }) => void;
  onExportClick: (e?: { key?: string } | React.MouseEvent) => void;
  onShowEditPrefix: () => void;
}

const ImportExportBar = React.memo(function ImportExportBar({
  onImportClick,
  onExportClick,
  onShowEditPrefix,
}: ImportExportBarProps) {
  const darkMode = useAppStore((state: any) => state.darkMode);
  const toggleDarkMode = useAppStore((state: any) => state.toggleDarkMode);

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-t border-border px-3 h-[49px] pb-1">
      <div className="flex flex-1 [&>button]:flex-1">
        <Dropdown
          menu={{
            items: [
              { key: 'importIcon', label: '导入图标' },
              { key: 'importProj', label: '导入项目' },
            ],
            onClick: onImportClick,
          }}
        >
          <Button
            style={{ borderRadius: '6px 0 0 6px', marginRight: -1 }}
            icon={<LogIn size={14} />}
          >
            导入
          </Button>
        </Dropdown>
        <Button
          style={{ borderRadius: '0 6px 6px 0', flex: 1 }}
          onClick={onExportClick}
          icon={<Save size={14} />}
        >
          导出
        </Button>
      </div>
      <Button
        data-testid="settings-btn"
        shape="circle"
        icon={<Settings size={14} />}
        onClick={onShowEditPrefix}
      />
      {/* Dark mode toggle hidden — logic kept in store */}
    </div>
  );
});

export default ImportExportBar;
