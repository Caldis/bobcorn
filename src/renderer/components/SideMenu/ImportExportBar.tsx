import React from 'react';
import { LogIn, Upload, Settings } from 'lucide-react';
import { Button } from '../ui';

interface ImportExportBarProps {
  onImportIcons: () => void;
  onExportClick: () => void;
  onShowEditPrefix: () => void;
}

const ImportExportBar = React.memo(function ImportExportBar({
  onImportIcons,
  onExportClick,
  onShowEditPrefix,
}: ImportExportBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-t border-border px-3 h-[49px] pb-1">
      <div className="flex flex-1 [&>button]:flex-1">
        <Button
          style={{ borderRadius: '6px 0 0 6px', marginRight: -1 }}
          icon={<LogIn size={14} />}
          onClick={onImportIcons}
        >
          导入图标
        </Button>
        <Button
          style={{ borderRadius: '0 6px 6px 0', flex: 1 }}
          onClick={onExportClick}
          icon={<Upload size={14} />}
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
    </div>
  );
});

export default ImportExportBar;
