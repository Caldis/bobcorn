// React
import React from 'react';
// Icons
import { Database, Cloud } from 'lucide-react';
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
  const handleSourceSelectorClick = (key: string) => {
    handleSourceSelected(key);
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
          'relative flex flex-row gap-1',
          '-translate-x-[40%]',
          'z-[100]'
        )}
      >
        <button
          onClick={() => handleSourceSelectorClick('local')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
            selectedSource === 'local'
              ? 'text-brand-500 font-medium bg-brand-50 dark:bg-brand-950/40'
              : 'text-foreground-muted hover:text-foreground hover:bg-surface-muted'
          )}
        >
          <Database size={14} />
          <span>本地</span>
        </button>
        <button
          disabled
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
            'text-foreground-muted/50 cursor-not-allowed'
          )}
        >
          <Cloud size={14} />
          <span>发现</span>
        </button>
      </div>

      {/*边栏显示切换*/}
      <div className={cn('opacity-0 pointer-events-none', 'pr-[15px] z-[1]')}>
        {/* Placeholder for future sidebar toggle buttons */}
      </div>
    </div>
  );
}

export default IconInfoBar;
