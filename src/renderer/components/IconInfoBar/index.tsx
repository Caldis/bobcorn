// React
import React from 'react';
// Utils
import { cn } from '../../lib/utils';
// Database
import db from '../../database';
// Store
import useAppStore from '../../store';

interface IconInfoBarProps {
  selectedGroup: string;
  selectedSource: string;
  handleSourceSelected: (source: string) => void;
}

const IconInfoBar = React.memo(function IconInfoBar({ selectedGroup }: IconInfoBarProps) {
  const groupData = useAppStore((state: any) => state.groupData);
  const groupName = db.getGroupName(selectedGroup);

  // 从 store 的 groupData 中找到当前分组的描述
  const groupDescription = React.useMemo(() => {
    if (selectedGroup.startsWith('resource-')) return undefined;
    const group = groupData.find((g: any) => g.id === selectedGroup);
    return group?.groupDescription || undefined;
  }, [selectedGroup, groupData]);

  return (
    <div
      className={cn(
        '[-webkit-app-region:drag]',
        'relative box-border',
        'flex flex-col justify-center',
        groupDescription ? 'h-[58px]' : 'h-[50px]',
        'border-b border-border',
        'transition-[height] duration-200'
      )}
    >
      <div
        className={cn(
          'pl-[30px] pr-4',
          'overflow-hidden whitespace-nowrap text-ellipsis',
          'text-sm font-medium',
          'text-foreground'
        )}
      >
        {groupName}
      </div>
      {groupDescription && (
        <div
          className={cn(
            'pl-[30px] pr-4 mt-0.5',
            'overflow-hidden whitespace-nowrap text-ellipsis',
            'text-xs',
            'text-foreground-muted/60'
          )}
        >
          {groupDescription}
        </div>
      )}
    </div>
  );
});

export default IconInfoBar;
