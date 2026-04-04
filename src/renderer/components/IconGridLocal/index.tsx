// React
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
// Virtual rendering
import { useVirtualizer } from '@tanstack/react-virtual';
// React Dropzone
import { useDropzone } from 'react-dropzone';
// UI
import { message, confirm } from '../ui';
// Components
import IconBlock from '../IconBlock';
import IconToolbar from '../IconToolbar';
import GroupIconPreview from '../GroupIconPreview';
// ViewModel
import { computeIconGridViewModel, type IconItem } from './viewModel';
// Utils
import { cn } from '../../lib/utils';
// Database
import db from '../../database';
// Config
import config, { defOption, setOption, getOption, type OptionData } from '../../config';
// Images
import noIconHintSad from '../../resources/imgs/nodata/noIconHint-sad.png';
import noIconHintHappy from '../../resources/imgs/nodata/noIconHint-happy.png';
// Store
import useAppStore from '../../store';

interface IconGridLocalProps {
  selectedGroup: string;
  handleIconSelected: (id: string | null, data?: any) => void;
  selectedIcon: string | null;
}

const HEADER_HEIGHT = 52; // estimate: accent bar + py-1.5 (12) + content (~20) + mt-3 (12) + pb-2 (8)

function IconGridLocal({ selectedGroup, handleIconSelected }: IconGridLocalProps) {
  const { t } = useTranslation();
  const options = getOption() as OptionData;
  const syncLeft = useAppStore((state: any) => state.syncLeft);
  const selectGroup = useAppStore((state: any) => state.selectGroup);

  // Selection state — subscribed once at grid level, passed as props to IconBlock
  const selectedIconStore = useAppStore((state: any) => state.selectedIcon);
  const selectedIcons = useAppStore((state: any) => state.selectedIcons);
  const showCheckbox = useAppStore((state: any) => state.batchMode || state.selectedIcons.size > 0);

  // Event-time reads via getState()
  const getStore = () => useAppStore.getState();

  // ── State ───────────────────────────────────────────────────────────
  const [iconData, setIconData] = useState<Record<string, IconItem[]>>({});
  const [iconBlockWidth, setIconBlockWidth] = useState<number | string>(options.iconBlockSize);
  const [iconBlockNameVisible, setIconBlockNameVisible] = useState<boolean>(
    options.iconBlockNameVisible
  );
  const [iconBlockCodeVisible, setIconBlockCodeVisible] = useState<boolean>(
    options.iconBlockCodeVisible
  );
  const [searchKeyword, setSearchKeyword] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [ready, setReady] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevSelectedGroupRef = useRef<string>(selectedGroup);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchLastFireRef = useRef<number>(0);
  const flatIconIdsRef = useRef<string[]>([]);
  const widthTmpRef = useRef<number | null>(null);
  const widthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollCacheRef = useRef<Map<string, number>>(new Map());

  // ── Grid layout constants ──────────────────────────────────────────
  const GRID_COL_GAP = 4; // px column-gap between cells
  const GRID_H_PAD = 12; // px horizontal padding (px-3) on each row
  // Cell = icon content width + p-2 (16px) + border-2 (4px)
  const cellWidth = (typeof iconBlockWidth === 'number' ? iconBlockWidth : 100) + 20;
  // Must match CSS repeat(auto-fill, cellWidth) calculation
  const columns = useMemo(() => {
    const eff = containerWidth - GRID_H_PAD * 2;
    return Math.max(1, eff > 0 ? Math.floor((eff + GRID_COL_GAP) / (cellWidth + GRID_COL_GAP)) : 1);
  }, [containerWidth, cellWidth]);

  // ── ResizeObserver for container width ──────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        requestAnimationFrame(() => setContainerWidth(entry.contentRect.width));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Database sync ───────────────────────────────────────────────────
  const sync = useCallback(
    (group?: string) => {
      const targetGroup = group || selectedGroup;
      if (targetGroup === 'resource-all') {
        setIconData(db.getAllIconsGrouped() as Record<string, IconItem[]>);
      } else if (targetGroup === 'resource-recent') {
        setIconData({ 'resource-recent': db.getRecentlyUpdatedIcons(50) as IconItem[] });
      } else if (targetGroup === 'resource-favorite') {
        setIconData({ 'resource-favorite': db.getFavoriteIcons() as IconItem[] });
      } else if (targetGroup === 'resource-uncategorized') {
        setIconData({
          'resource-uncategorized': db
            .getIconListFromGroup('resource-uncategorized')
            .concat(db.getIconListFromGroup('null')) as IconItem[],
        });
      } else {
        setIconData((prev) => ({
          ...prev,
          [targetGroup]: db.getIconListFromGroup(targetGroup) as IconItem[],
        }));
      }
    },
    [selectedGroup]
  );

  const refreshVariantCounts = useAppStore((state: any) => state.refreshVariantCounts);

  useEffect(() => {
    sync();
    refreshVariantCounts();
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, [sync]);

  const groupData = useAppStore((state: any) => state.groupData);
  useEffect(() => {
    sync();
  }, [groupData]);

  useEffect(() => {
    if (selectedGroup !== prevSelectedGroupRef.current) {
      // Save scroll position for old view
      if (scrollRef.current) {
        scrollCacheRef.current.set(prevSelectedGroupRef.current, scrollRef.current.scrollTop);
      }
      prevSelectedGroupRef.current = selectedGroup;
      sync(selectedGroup);
      deselectIcon();
    }
  }, [selectedGroup]);

  // ── ViewModel ───────────────────────────────────────────────────────
  const groupList = useMemo(() => (db as any).getGroupList() || [], [groupData]);

  const viewModel = useMemo(() => {
    const p = (window as any).__BOBCORN_PERF__;
    p?.mark('viewModel.compute');
    const result = computeIconGridViewModel({
      iconData,
      selectedGroup,
      searchKeyword,
      columns,
      groupList,
    });
    p?.measure('viewModel.compute');
    return result;
  }, [iconData, selectedGroup, searchKeyword, columns, groupList]);

  // Update flatIconIds ref for Shift+Click range selection
  useEffect(() => {
    flatIconIdsRef.current = viewModel.flatIconIds;
  }, [viewModel.flatIconIds]);

  // ── Row height calculation ──────────────────────────────────────────
  const rowHeight = useMemo(() => {
    const w = typeof iconBlockWidth === 'number' ? iconBlockWidth : 100;
    const nameH = iconBlockNameVisible ? 22 : 0;
    const codeH = iconBlockCodeVisible ? 22 : 0;
    return w + nameH + codeH + 24;
  }, [iconBlockWidth, iconBlockNameVisible, iconBlockCodeVisible]);

  // ── Virtualizer ─────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: viewModel.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (viewModel.rows[index]?.kind === 'header' ? HEADER_HEIGHT : rowHeight),
    getItemKey: (index) => viewModel.rows[index]?.key ?? String(index),
    overscan: 3,
    paddingStart: selectedGroup === 'resource-all' ? 0 : GRID_H_PAD,
    paddingEnd: GRID_H_PAD,
  });

  // Restore scroll position on view change
  useEffect(() => {
    if (viewModel.rows.length > 0) {
      const cached = scrollCacheRef.current.get(selectedGroup);
      if (cached !== undefined && scrollRef.current) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo(0, cached);
        });
      }
    }
  }, [selectedGroup, viewModel.rows.length > 0 ? 1 : 0]);

  // ── Toolbar callbacks ───────────────────────────────────────────────
  const updateNameVisible = useCallback((visible: boolean) => {
    setIconBlockNameVisible(visible);
    setOption({ iconBlockNameVisible: visible });
  }, []);

  const updateCodeVisible = useCallback((visible: boolean) => {
    setIconBlockCodeVisible(visible);
    setOption({ iconBlockCodeVisible: visible });
  }, []);

  const updateSearchKeyword = useCallback((value: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const now = Date.now();
    const elapsed = now - searchLastFireRef.current;
    if (elapsed >= 300) {
      searchLastFireRef.current = now;
      setSearchKeyword(value || null);
    } else {
      searchTimerRef.current = setTimeout(() => {
        searchLastFireRef.current = Date.now();
        setSearchKeyword(value || null);
      }, 300 - elapsed);
    }
  }, []);

  const updateIconWrapperWidth = useCallback((width: number) => {
    if (width) widthTmpRef.current = width;
    if (widthTimerRef.current) clearTimeout(widthTimerRef.current);
    widthTimerRef.current = setTimeout(() => {
      const iconWidth = width || widthTmpRef.current || defOption.iconBlockSize;
      setIconBlockWidth(iconWidth || 'auto');
      setOption({ iconBlockSize: width });
    }, 150);
  }, []);

  // ── Drag & drop (useDropzone hook — shares ref with scroll container) ──
  const onIconDrop = useCallback(
    (acceptedFiles: File[]) => {
      const acceptableIcons = acceptedFiles.filter((file) =>
        config.acceptableIconTypes.includes(file.type)
      );
      if (acceptedFiles.length === 1) {
        const ext = acceptedFiles[0].name.split('.').pop()?.toLowerCase();
        if (ext === 'icp' || ext === 'cp') {
          /* TODO: accept project file */
        }
        if (acceptableIcons.length > 0) {
          db.addIcons(acceptableIcons, selectedGroup, () => {
            message.success(t('import.success', { count: acceptableIcons.length }));
            syncLeft();
            sync();
          });
        } else {
          message.error(t('import.formatError'));
        }
      } else {
        if (acceptableIcons.length !== acceptedFiles.length) {
          confirm({
            title: t('import.incompatibleTitle'),
            content: t('import.incompatibleContent'),
            okText: t('import.importCompatible'),
            onOk() {
              db.addIcons(acceptableIcons, selectedGroup, () => {
                message.success(
                  t('import.partialSuccess', {
                    total: acceptedFiles.length,
                    count: acceptableIcons.length,
                  })
                );
                syncLeft();
                sync();
              });
            },
            onCancel() {
              message.warning(t('import.cancelled'));
            },
          });
        } else {
          db.addIcons(acceptableIcons, selectedGroup, () => {
            message.success(t('import.success', { count: acceptableIcons.length }));
            syncLeft();
            sync();
          });
        }
      }
    },
    [selectedGroup, syncLeft, sync, t]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    noClick: true,
    onDrop: onIconDrop,
  });

  // Merge dropzone ref with scroll ref
  const dropzoneRootProps = getRootProps();
  const dropzoneRefObj = dropzoneRootProps.ref;
  const mergedScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      if (dropzoneRefObj) {
        if (typeof dropzoneRefObj === 'function') dropzoneRefObj(node);
        else (dropzoneRefObj as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [dropzoneRefObj]
  );

  // ── Click handlers ──────────────────────────────────────────────────
  const deselectIcon = useCallback(() => {
    const s = getStore();
    if (s.selectedIcons.size > 0) s.clearBatchSelection();
    handleIconSelected(null);
  }, [handleIconSelected]);

  const handleIconClick = useCallback(
    (id: string, data: any, e?: React.MouseEvent) => {
      const s = getStore();
      const isCtrl = e && (e.ctrlKey || e.metaKey);
      const isShift = e && e.shiftKey;

      if (isShift && s.lastClickedIconId) {
        const ids = flatIconIdsRef.current;
        const startIdx = ids.indexOf(s.lastClickedIconId);
        const endIdx = ids.indexOf(id);
        if (startIdx !== -1 && endIdx !== -1) {
          const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          s.setIconSelection(ids.slice(lo, hi + 1));
        }
        return;
      }

      if (isCtrl) {
        s.toggleIconSelection(id);
        return;
      }

      // Plain click (no modifier) while in batch mode → exit batch, select only this icon
      if (s.batchMode || s.selectedIcons.size > 0) {
        s.clearBatchSelection();
        // Fall through to normal single-select below
      }

      s.setLastClickedIconId(id);
      handleIconSelected(id, data);
    },
    [handleIconSelected]
  );

  // Escape to exit batch mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const s = getStore();
      if (e.key === 'Escape' && (s.batchMode || s.selectedIcons.size > 0)) {
        s.clearBatchSelection();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── No-data blocks ──────────────────────────────────────────────────
  const geneNodataBlock = () => {
    const hints: Record<string, { img: string; lines: string[] }> = {
      'resource-all': {
        img: noIconHintSad,
        lines: [t('emptyState.noIcons'), t('emptyState.dragToAdd')],
      },
      'resource-uncategorized': {
        img: noIconHintHappy,
        lines: [t('emptyState.allCategorized'), t('emptyState.uncategorizedHint')],
      },
      'resource-recent': {
        img: noIconHintSad,
        lines: [t('emptyState.noUpdates')],
      },
      'resource-favorite': {
        img: noIconHintSad,
        lines: [t('emptyState.noFavorites'), t('emptyState.favoriteHint')],
      },
      'resource-recycleBin': {
        img: noIconHintHappy,
        lines: [t('emptyState.trashEmpty'), t('emptyState.trashHint')],
      },
    };
    const h = hints[selectedGroup] || { img: noIconHintSad, lines: [t('emptyState.emptyGroup')] };
    return (
      <div
        className={cn(
          'absolute inset-0 w-full h-[calc(100vh-116px)]',
          'flex flex-col justify-center items-center text-center'
        )}
      >
        <img className="w-[150px]" src={h.img} />
        <div>
          {h.lines.map((line, i) => (
            <p key={i} className="text-foreground-muted mb-2">
              {line}
            </p>
          ))}
        </div>
      </div>
    );
  };

  const hasIcons =
    selectedGroup === 'resource-all'
      ? Object.values(iconData).some((arr) => arr.length > 0)
      : iconData[selectedGroup] && iconData[selectedGroup].length !== 0;

  // ── Sticky header for "All" view ─────────────────────────────────────
  // ── Sticky header (derived from virtualizer's actual measurements) ──
  const stickyHeader = useMemo(() => {
    if (selectedGroup !== 'resource-all') return null;
    const items = virtualizer.getVirtualItems();
    if (!items.length) return null;

    // Walk backward from first visible item to find the nearest header that scrolled past
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    if (scrollTop <= 0) return null;

    const firstIdx = items[0].index;
    for (let i = firstIdx; i >= 0; i--) {
      const row = viewModel.rows[i];
      if (row?.kind === 'header') {
        // Check if this header has actually scrolled past the top
        // Use the virtualizer's measured offset for accuracy
        const offset = virtualizer.getOffsetForIndex(i, 'start');
        const measuredStart = offset?.[0] ?? 0;
        if (measuredStart + HEADER_HEIGHT <= scrollTop) {
          return row;
        }
        return null;
      }
    }
    return null;
  }, [virtualizer.getVirtualItems(), selectedGroup, viewModel.rows]);

  // ── Render virtual items ────────────────────────────────────────────
  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  // ── Batch prefetch SVG content for visible icons ───────────────────
  // Two-layer throttle: debounce (80ms) waits for scroll to settle,
  // then requestIdleCallback ensures the query doesn't block rendering.
  const prefetchIconContent = useAppStore((state: any) => state.prefetchIconContent);
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const prefetchIdleRef = useRef<number>();

  useEffect(() => {
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = setTimeout(() => {
      if (prefetchIdleRef.current) cancelIdleCallback(prefetchIdleRef.current);
      prefetchIdleRef.current = requestIdleCallback(() => {
        const visibleIds: string[] = [];
        const store = useAppStore.getState();
        for (const vItem of virtualItems) {
          const row = viewModel.rows[vItem.index];
          if (row?.kind === 'row') {
            for (const icon of row.icons) {
              if (!icon.iconContent && !store.prefetchedContent?.[icon.id]) {
                visibleIds.push(icon.id);
              }
            }
          }
        }
        if (visibleIds.length > 0) {
          prefetchIconContent(visibleIds);
        }
      });
    }, 80);
    return () => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
      if (prefetchIdleRef.current) cancelIdleCallback(prefetchIdleRef.current);
    };
  }, [virtualItems, prefetchIconContent, viewModel.rows]);

  return (
    <div className="relative w-full h-full flex flex-col" id="iconGridLocalContainer">
      {/* Sticky group header overlay (All view only) */}
      {stickyHeader && (
        <div
          className={cn(
            'absolute top-0 left-0 w-full z-20',
            'cursor-pointer text-left',
            'flex items-stretch',
            'bg-surface/95',
            'backdrop-blur-sm',
            'border-b border-border/50'
          )}
          onClick={() => selectGroup(stickyHeader.groupId)}
        >
          <div className="w-[3px] shrink-0 bg-accent" />
          {stickyHeader.groupIcon && (
            <GroupIconPreview
              iconId={stickyHeader.groupIcon}
              className="w-[18px] h-[18px] ml-3 self-center opacity-60"
            />
          )}
          <div className="flex flex-col justify-center py-2 pl-3 pr-4 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {stickyHeader.groupName}
              </span>
              <span className="text-xs tabular-nums text-foreground-muted/50 shrink-0">
                {stickyHeader.count}
              </span>
            </div>
            {stickyHeader.groupDescription && (
              <span className="text-[11px] leading-tight mt-0.5 text-foreground-muted/50 truncate">
                {stickyHeader.groupDescription}
              </span>
            )}
          </div>
        </div>
      )}

      <div
        {...dropzoneRootProps}
        ref={mergedScrollRef}
        className={cn(
          'relative text-center flex-grow',
          'overflow-hidden overflow-y-auto',
          'transition-[filter] duration-300',
          isDragActive && 'blur-[30px]'
        )}
      >
        <input {...getInputProps()} />
        <div className="absolute inset-0 opacity-0 z-0" onClick={deselectIcon} />

        {hasIcons && viewModel.rows.length > 0 ? (
          <div
            className={cn(
              'relative w-full transition-opacity duration-300',
              ready ? 'opacity-100' : 'opacity-0'
            )}
            style={{ height: totalHeight }}
          >
            {virtualItems.map((virtualRow) => {
              const row = viewModel.rows[virtualRow.index];
              if (!row) return null;

              if (row.kind === 'header') {
                return (
                  <div
                    key={row.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 w-full pb-2"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div
                      className={cn(
                        'relative z-[1] cursor-pointer text-left',
                        'w-full flex items-stretch',
                        virtualRow.index > 0 && 'mt-3',
                        'transition-colors duration-200',
                        'bg-surface border-b border-border/50',
                        'hover:bg-surface-accent',
                        'active:bg-surface-accent'
                      )}
                      onClick={() => selectGroup(row.groupId)}
                    >
                      <div className="w-[3px] shrink-0 bg-accent" />
                      {row.groupIcon && (
                        <GroupIconPreview
                          iconId={row.groupIcon}
                          className="w-[18px] h-[18px] ml-3 self-center opacity-60"
                        />
                      )}
                      <div className="flex flex-col justify-center py-2 pl-3 pr-4 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {row.groupName}
                          </span>
                          <span className="text-xs tabular-nums text-foreground-muted/50 shrink-0">
                            {row.count}
                          </span>
                        </div>
                        {row.groupDescription && (
                          <span className="text-[11px] leading-tight mt-0.5 text-foreground-muted/50 truncate">
                            {row.groupDescription}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={row.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 w-full px-3"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(auto-fill, minmax(${cellWidth}px, 1fr))`,
                    columnGap: GRID_COL_GAP,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.icons.map((icon, colIdx) => (
                    <IconBlock
                      key={icon.id}
                      data={icon}
                      name={icon.iconName}
                      code={icon.iconCode}
                      content={icon.iconContent}
                      width={iconBlockWidth}
                      nameVisible={iconBlockNameVisible}
                      codeVisible={iconBlockCodeVisible}
                      handleIconSelected={handleIconClick}
                      selected={selectedIconStore === icon.id}
                      batchSelected={selectedIcons.has(icon.id)}
                      showCheckbox={showCheckbox}
                      isFavorite={!!icon.isFavorite}
                      staggerIndex={colIdx}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          geneNodataBlock()
        )}
      </div>

      {/* Drag hint overlay */}
      <div
        className={cn(
          'opacity-0 absolute inset-x-0 top-0',
          'w-[calc(100%-40px)] h-[calc(100%-80px)]',
          'm-5',
          'border border-dashed border-foreground/30',
          'bg-foreground/10',
          'rounded-lg',
          'transition-opacity duration-700',
          'pointer-events-none',
          '[.blur-\\[30px\\]~&]:opacity-100'
        )}
      >
        <div className="w-full h-full flex justify-center items-center">
          <div className="font-bold text-base text-foreground">{t('emptyState.dragToGroup')}</div>
        </div>
      </div>

      <div className="z-10">
        <IconToolbar
          defaultIconWidth={options.iconBlockSize}
          updateIconWidth={updateIconWrapperWidth}
          defaultNameVisible={options.iconBlockNameVisible}
          updateNameVisible={updateNameVisible}
          defaultCodeVisible={options.iconBlockCodeVisible}
          updateCodeVisible={updateCodeVisible}
          updateSearchKeyword={updateSearchKeyword}
          visibleIconIds={flatIconIdsRef.current}
        />
      </div>
    </div>
  );
}

export default IconGridLocal;
