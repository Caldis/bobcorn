// React
import React from 'react';
import { useTranslation } from 'react-i18next';
// Utils
import { cn } from '../../lib/utils';
import { BookOpen, Star, Clock, FileWarning, Trash2, Tag } from 'lucide-react';
// Components
import GroupIconPreview from '../GroupIconPreview';
// Database
import db from '../../database';
// Store
import useAppStore from '../../store';

// Same data source as ResourceNav — icon + i18n key per resource group
const RESOURCE_META: Record<string, { icon: React.ElementType; labelKey: string }> = {
  'resource-all': { icon: BookOpen, labelKey: 'nav.all' },
  'resource-favorite': { icon: Star, labelKey: 'nav.favorites' },
  'resource-recent': { icon: Clock, labelKey: 'nav.recentlyUpdated' },
  'resource-uncategorized': { icon: FileWarning, labelKey: 'nav.ungrouped' },
  'resource-recycleBin': { icon: Trash2, labelKey: 'nav.trash' },
};

interface IconInfoBarProps {
  selectedGroup: string;
  selectedSource: string;
  handleSourceSelected: (source: string) => void;
}

const IconInfoBar = React.memo(function IconInfoBar({ selectedGroup }: IconInfoBarProps) {
  const { t } = useTranslation();
  const groupData = useAppStore((state: any) => state.groupData);

  const meta = RESOURCE_META[selectedGroup];
  const GroupIcon = meta?.icon || Tag;
  const groupName = meta ? t(meta.labelKey) : db.getGroupName(selectedGroup);

  // 从 store 的 groupData 中找到当前分组的描述和图标
  const currentGroup = React.useMemo(() => {
    if (selectedGroup.startsWith('resource-')) return undefined;
    return groupData.find((g: any) => g.id === selectedGroup);
  }, [selectedGroup, groupData]);
  const groupDescription = currentGroup?.groupDescription || undefined;
  const groupIcon = currentGroup?.groupIcon || undefined;

  return (
    <div
      className={cn(
        '[-webkit-app-region:drag]',
        'relative box-border',
        'flex items-center',
        'h-[58px] pt-0.5',
        'border-b border-border'
      )}
    >
      {groupIcon ? (
        <GroupIconPreview iconId={groupIcon} className="ml-5 w-5 h-5 text-foreground" />
      ) : (
        <GroupIcon size={14} strokeWidth={1.5} className="ml-5 shrink-0 text-foreground" />
      )}
      <div className="flex flex-col justify-center ml-2 mr-4 min-w-0">
        <div
          className={cn(
            'overflow-hidden whitespace-nowrap text-ellipsis',
            'text-sm font-medium leading-tight',
            'text-foreground'
          )}
        >
          {groupName}
        </div>
        {groupDescription && (
          <div
            className={cn(
              'mt-0.5',
              'overflow-hidden whitespace-nowrap text-ellipsis',
              'text-xs',
              'text-foreground-muted/60'
            )}
          >
            {groupDescription}
          </div>
        )}
      </div>
    </div>
  );
});

export default IconInfoBar;
