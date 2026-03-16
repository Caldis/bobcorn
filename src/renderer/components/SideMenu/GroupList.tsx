import React, { useCallback } from 'react';
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
import db from '../../database';
import useAppStore from '../../store';
import addGroupHint from '../../resources/imgs/nodata/addGroupHint.png';
import type { GroupData } from './types';

// 可排序分组项组件
function SortableGroupItem({
  group,
  isSelected,
  onSelect,
  onEdit,
}: {
  group: GroupData;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
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
      <span className="flex-1 truncate">{group.groupName}</span>
      <span className="relative shrink-0 w-5 h-5 flex items-center justify-center">
        <span className="text-xs text-foreground-muted group-hover:opacity-0 transition-opacity">
          {db.getIconCountFromGroup(group.id)}
        </span>
        <button
          className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Settings size={11} />
        </button>
      </span>
    </div>
  );
}

interface GroupListProps {
  selectedGroup: string;
  sideMenuWrapperRef: React.RefObject<HTMLDivElement>;
  onMenuItemSelected: (key: string) => void;
  onShowAddGroup: () => void;
  onShowEditGroup: (group: GroupData) => void;
}

function GroupList({
  selectedGroup,
  sideMenuWrapperRef,
  onMenuItemSelected,
  onShowAddGroup,
  onShowEditGroup,
}: GroupListProps) {
  const groupData: GroupData[] = useAppStore((state: any) => state.groupData);
  const syncLeft = useAppStore((state: any) => state.syncLeft);

  // 分组拖拽排序
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
      {/* 分组标题栏 */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <Tags size={14} className="text-foreground-muted" />
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          分组
        </span>
        <button
          className="ml-auto flex h-5 w-5 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-950/40"
          onClick={onShowAddGroup}
        >
          <Plus size={11} />
        </button>
      </div>

      {/* 可排序分组列表 */}
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
                  onSelect={() => onMenuItemSelected(group.id)}
                  onEdit={() => onShowEditGroup(group)}
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
          <img className="mx-auto w-[120px] opacity-60" src={addGroupHint} alt="添加分组" />
          <p className="mb-1 mt-3 text-sm">还没有分组</p>
          <p className="text-xs text-foreground-muted">点击上方的 "+"可以创建分组</p>
        </div>
      )}
    </div>
  );
}

export default GroupList;
