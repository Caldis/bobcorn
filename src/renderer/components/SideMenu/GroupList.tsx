import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Tags, Plus, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Dropdown } from '../ui';
import db from '../../database';
import useAppStore from '../../store';
import addGroupHint from '../../resources/imgs/nodata/addGroupHint.png';
import type { GroupData } from './types';

// 可排序分组项组件 — memo 防止父级重渲染导致每个分组项都重新查 DB
const SortableGroupItem = React.memo(function SortableGroupItem({
  group,
  isSelected,
  iconCount,
  onSelect,
  onRename,
  onDelete,
}: {
  group: GroupData;
  isSelected: boolean;
  iconCount: number;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
  });
  const itemStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={itemStyle}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={cn(
        'group flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm transition-colors',
        isSelected
          ? 'bg-brand-50 text-brand-600 font-medium dark:bg-brand-950/40 dark:text-brand-400'
          : 'text-foreground hover:bg-surface-muted dark:hover:bg-white/5',
        isDragging && 'shadow-md ring-1 ring-brand-300 dark:ring-brand-700'
      )}
    >
      <span className="flex-1 min-w-0">
        <span className="block truncate">{group.groupName}</span>
        {group.groupDescription && (
          <span className="block truncate text-[11px] leading-tight mt-0.5 font-normal text-foreground-muted/70">
            {group.groupDescription}
          </span>
        )}
      </span>
      <span className="relative shrink-0 w-5 h-5 flex items-center justify-center self-start mt-0.5">
        <span className="text-xs text-foreground-muted group-hover:opacity-0 transition-opacity">
          {iconCount}
        </span>
        <span
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Dropdown
            menu={{
              items: [
                { key: 'rename', label: t('group.edit') },
                { key: 'delete', label: t('group.delete') },
              ],
              onClick: (info) => {
                if (info.key === 'rename') onRename();
                if (info.key === 'delete') onDelete();
              },
            }}
          >
            <button className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10">
              <Settings size={11} />
            </button>
          </Dropdown>
        </span>
      </span>
    </div>
  );
});

interface GroupListProps {
  groupData: GroupData[];
  selectedGroup: string;
  sideMenuWrapperRef: React.RefObject<HTMLDivElement>;
  onMenuItemSelected: (e: { key: string }) => void;
  onShowAddGroup: () => void;
  onRenameGroup: (group: GroupData) => void;
  onDeleteGroup: (group: GroupData) => void;
}

const GroupList = React.memo(function GroupList({
  groupData,
  selectedGroup,
  sideMenuWrapperRef,
  onMenuItemSelected,
  onShowAddGroup,
  onRenameGroup,
  onDeleteGroup,
}: GroupListProps) {
  const { t } = useTranslation();
  const syncLeft = useAppStore((state: any) => state.syncLeft);

  // 批量缓存所有分组的图标计数 — 只在 groupData 变化时重算
  const groupIconCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    groupData.forEach((g) => {
      counts[g.id] = db.getIconCountFromGroup(g.id);
    });
    return counts;
  }, [groupData]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = groupData.findIndex((g: GroupData) => g.id === active.id);
      const newIndex = groupData.findIndex((g: GroupData) => g.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(groupData, oldIndex, newIndex);
      db.reorderGroups(newOrder.map((g: GroupData) => g.id));
      syncLeft();
    },
    [groupData]
  );

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden" ref={sideMenuWrapperRef}>
      <div className="sticky top-0 z-10 flex items-center gap-1.5 px-4 pt-3 pb-1 bg-surface dark:bg-surface">
        <Tags size={14} className="text-foreground-muted" />
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          {t('group.groups')}
        </span>
        <button
          className="ml-auto flex h-5 w-5 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-950/40"
          onClick={onShowAddGroup}
        >
          <Plus size={11} />
        </button>
      </div>

      {groupData.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={groupData.map((g: GroupData) => g.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="px-1 py-1">
              {groupData.map((group: GroupData) => (
                <SortableGroupItem
                  key={group.id}
                  group={group}
                  isSelected={selectedGroup === group.id}
                  iconCount={groupIconCounts[group.id] || 0}
                  onSelect={() => onMenuItemSelected({ key: group.id })}
                  onRename={() => onRenameGroup(group)}
                  onDelete={() => onDeleteGroup(group)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {groupData.length === 0 && (
        <div
          className="absolute left-0 z-10 flex w-full flex-col items-center justify-center text-center text-foreground-muted"
          style={{ top: 'calc(44vh)' }}
        >
          <img
            className="mx-auto w-[120px] opacity-60"
            src={addGroupHint}
            alt={t('group.addHint')}
          />
          <p className="mb-1 mt-3 text-sm">{t('group.noGroups')}</p>
          <p className="text-xs text-foreground-muted">{t('group.noGroupsHint')}</p>
        </div>
      )}
    </div>
  );
});

export default GroupList;
