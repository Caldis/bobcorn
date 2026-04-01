import React, { useMemo } from 'react';
import { BookOpen, Clock, FileWarning, Trash2, LayoutGrid, Star } from 'lucide-react';
import { cn } from '../../lib/utils';
import db from '../../database';
import useAppStore from '../../store';

interface ResourceNavProps {
  selectedGroup: string;
  onMenuItemSelected: (e: { key: string }) => void;
}

const ResourceNav = React.memo(function ResourceNav({
  selectedGroup,
  onMenuItemSelected,
}: ResourceNavProps) {
  // 只在 groupData 变化时重新计算计数（syncLeft 触发）
  const groupData = useAppStore((state: any) => state.groupData);
  const counts = useMemo(
    () => ({
      all: db.getIconCount(),
      favorite: db.getFavoriteCount(),
      uncategorized:
        db.getIconCountFromGroup('resource-uncategorized') + db.getIconCountFromGroup('null'),
      recycleBin: db.getIconCountFromGroup('resource-recycleBin'),
    }),
    [groupData]
  );

  const items = [
    { key: 'resource-all', icon: BookOpen, label: '全部', count: counts.all },
    { key: 'resource-favorite', icon: Star, label: '收藏', count: counts.favorite },
    { key: 'resource-recent', icon: Clock, label: '最近更新', count: Math.min(50, counts.all) },
    {
      key: 'resource-uncategorized',
      icon: FileWarning,
      label: '未分组',
      count: counts.uncategorized,
    },
    { key: 'resource-recycleBin', icon: Trash2, label: '回收站', count: counts.recycleBin },
  ];

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <LayoutGrid size={14} className="text-foreground-muted" />
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          资源
        </span>
      </div>
      <nav className="px-1 py-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isSelected = selectedGroup === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onMenuItemSelected({ key: item.key })}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                isSelected
                  ? 'bg-brand-50 text-brand-600 font-medium dark:bg-brand-950/40 dark:text-brand-400'
                  : 'text-foreground hover:bg-surface-muted dark:hover:bg-white/5'
              )}
            >
              <Icon size={15} />
              <span>{item.label}</span>
              {item.count !== undefined && (
                <span className="ml-auto text-xs text-foreground-muted">{item.count}</span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
});

export default ResourceNav;
