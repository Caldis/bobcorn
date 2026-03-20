// React
import React from 'react';
// Utils
import { cn } from '../../lib/utils';
// Database
import db from '../../database';

interface IconInfoBarProps {
  selectedGroup: string;
  selectedSource: string;
  handleSourceSelected: (source: string) => void;
}

function IconInfoBar({ selectedGroup }: IconInfoBarProps) {
  const groupName = db.getGroupName(selectedGroup);
  return (
    <div
      className={cn(
        '[-webkit-app-region:drag]',
        'relative box-border h-[50px]',
        'flex flex-row items-center',
        'border-b border-border',
        'dark:border-border'
      )}
    >
      <div
        className={cn(
          'pl-[30px]',
          'overflow-hidden whitespace-nowrap text-ellipsis',
          'text-sm font-medium',
          'text-foreground dark:text-foreground'
        )}
      >
        {groupName}
      </div>
    </div>
  );
}

export default IconInfoBar;
