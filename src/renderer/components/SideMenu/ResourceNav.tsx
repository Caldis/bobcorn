import React from 'react';
import { BookOpen, Clock, FileWarning, Trash2, LayoutGrid } from 'lucide-react';
import { cn } from '../../lib/utils';
import db from '../../database';

interface ResourceNavProps {
  selectedGroup: string;
  onMenuItemSelected: (e: { key: string }) => void;
}

const NAV_ITEMS = [
  { key: 'resource-all', icon: BookOpen, label: '全部', count: () => db.getIconCount() },
  { key: 'resource-recent', icon: Clock, label: '最近更新' },
  {
    key: 'resource-uncategorized',
    icon: FileWarning,
    label: '未分组',
    count: () =>
      db.getIconCountFromGroup('resource-uncategorized') + db.getIconCountFromGroup('null'),
  },
  {
    key: 'resource-recycleBin',
    icon: Trash2,
    label: '回收站',
    count: () => db.getIconCountFromGroup('resource-recycleBin'),
  },
];

function ResourceNav({ selectedGroup, onMenuItemSelected }: ResourceNavProps) {
  return (
    <div className="shrink-0">
      {/* Section header */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <LayoutGrid size={14} className="text-foreground-muted" />
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          资源
        </span>
      </div>

      {/* Nav items */}
      <nav className="px-1 py-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isSelected = selectedGroup === item.key;
          const count = item.count?.();
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
              {count !== undefined && (
                <span className="ml-auto text-xs text-foreground-muted">{count}</span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default ResourceNav;
