// React
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
// Virtual rendering
import { useVirtualizer } from '@tanstack/react-virtual';
// React Dropzone
import { useDropzone } from 'react-dropzone';
// Icons
import {
  Info,
  Star,
  StarOff,
  FolderInput,
  Copy,
  Download,
  Trash2,
  RotateCcw,
  Upload,
  ListChecks,
  FileType2,
} from 'lucide-react';
// UI
import { message, confirm } from '../ui';
// Components
import IconBlock from '../IconBlock';
import IconToolbar from '../IconToolbar';
import GroupIconPreview from '../GroupIconPreview';
import IconContextMenu, { type ContextMenuItem } from '../IconContextMenu';
import { GroupPickerDialog, type GroupPickerGroup } from '../GroupPickerDialog';
import { IconExportDialog, type IconExportTarget } from '../IconExportDialog';
// ViewModel
import { computeIconGridViewModel, type IconItem, type VirtualRow } from './viewModel';
// 拖拽聚合 (拖到侧边栏分组)
import { useIconStackDrag } from './useIconStackDrag';
// Utils
import { cn } from '../../lib/utils';
import { warningsToNodes, confirmContentWithWarnings } from '../../utils/commandWarnings';
import type { CommandWarning } from '@core/commands';
import { buildImportSuccessMessage } from '../../utils/importFeedback';
// Database
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): icon.list, favorite.list
import db from '../../database';
// Config
import config, { defOption, setOption, getOption, type OptionData } from '../../config';
// Images
import noIconHintSad from '../../resources/imgs/nodata/noIconHint-sad.png';
import noIconHintHappy from '../../resources/imgs/nodata/noIconHint-happy.png';
// Store
import useAppStore, { analyticsTrack } from '../../store';

interface IconGridLocalProps {
  selectedGroup: string;
  handleIconSelected: (id: string | null, data?: any) => void;
  selectedIcon: string | null;
}

const HEADER_HEIGHT = 52; // estimate: accent bar + py-1.5 (12) + content (~20) + mt-3 (12) + pb-2 (8)

// ── Marquee (box) selection tuning ──────────────────────────────────
const MARQUEE_THRESHOLD = 4; // px of movement before a drag becomes a marquee
const MARQUEE_EDGE = 40; // px from top/bottom edge that triggers auto-scroll
const MARQUEE_AUTOSCROLL_STEP = 16; // px scrolled per frame while near an edge

interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function IconGridLocal({ selectedGroup, handleIconSelected }: IconGridLocalProps) {
  const { t } = useTranslation();
  const options = getOption() as OptionData;
  const syncLeft = useAppStore((state: any) => state.syncLeft);
  const selectGroup = useAppStore((state: any) => state.selectGroup);
  const selectIcon = useAppStore((state: any) => state.selectIcon);

  // Selection state — subscribed once at grid level, passed as props to IconBlock
  const selectedIconStore = useAppStore((state: any) => state.selectedIcon);
  const selectedIcons = useAppStore((state: any) => state.selectedIcons);
  const showCheckbox = useAppStore((state: any) => state.batchMode || state.selectedIcons.size > 0);
  const iconSortField = useAppStore((state: any) => state.iconSortField);
  const iconSortDirection = useAppStore((state: any) => state.iconSortDirection);
  const filterOutOfRange = useAppStore((state: any) => state.filterOutOfRange);
  const outOfRangeCodes = useAppStore((state: any) => state.outOfRangeCodes);

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

  // Marquee (box) selection
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [marqueeDragging, setMarqueeDragging] = useState(false);

  // Icon right-click context menu + its move/copy group picker
  // blank = 点在画布空白处 (ids 为空), 菜单换成视图级便捷操作 (导入/全选/导出字体)
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    ids: string[];
    blank?: boolean;
  } | null>(null);
  const [groupPickerMode, setGroupPickerMode] = useState<'move' | 'copy' | null>(null);
  const groupPickerIdsRef = useRef<string[]>([]);
  const [exportDialogVisible, setExportDialogVisible] = useState(false);
  const exportDialogIdsRef = useRef<string[]>([]);

  // ── Refs ────────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevSelectedGroupRef = useRef<string>(selectedGroup);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchLastFireRef = useRef<number>(0);
  const flatIconIdsRef = useRef<string[]>([]);
  const widthTmpRef = useRef<number | null>(null);
  const widthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollCacheRef = useRef<Map<string, number>>(new Map());

  // 拖拽聚合入口 — handleGridMouseDown 是空依赖 useCallback, 经 ref 间接调用
  // 在其后创建的 useIconStackDrag hook, 避免声明顺序与依赖失效问题
  const pressIconRef = useRef<((e: React.MouseEvent, iconId: string) => void) | null>(null);

  // ── Marquee refs (mutable drag state, no re-render) ─────────────────
  const marqueeStartRef = useRef<{ cx: number; cy: number } | null>(null); // content coords
  const marqueeStartClientRef = useRef<{ x: number; y: number } | null>(null); // viewport coords
  const marqueeLastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 }); // viewport coords
  const marqueeActiveRef = useRef(false);
  const marqueePendingRef = useRef(false);
  const marqueeCtrlRef = useRef(false);
  const marqueeBaseRef = useRef<Set<string>>(new Set()); // selection before drag (Ctrl union)
  const marqueeRafRef = useRef<number | null>(null);
  const marqueeAppliedRef = useRef<string>(''); // signature of last applied selection
  const justMarqueedRef = useRef(false); // swallow the click that follows a marquee
  // Live geometry snapshot read by the (stable) drag handlers to avoid stale closures.
  const geomRef = useRef<{ columns: number; containerWidth: number; rows: VirtualRow[] }>({
    columns: 1,
    containerWidth: 0,
    rows: [],
  });
  // Holds the (stable) virtualizer instance for the drag handlers; typed as
  // any to avoid the invariant Virtualizer generic. We only call
  // getMeasurements() on it.
  const virtualizerRef = useRef<any>(null);
  const marqueeHandlersRef = useRef<{
    move?: (e: MouseEvent) => void;
    up?: () => void;
    key?: (e: KeyboardEvent) => void;
  }>({});

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
  // Debounce width updates so sidebar toggle animations don't cause continuous re-renders.
  // The grid only recalculates columns after resize events settle (300ms = sidebar transition).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      // Immediate on first measurement (containerWidth === 0), debounced thereafter
      if (!containerWidth) {
        setContainerWidth(w);
        return;
      }
      if (widthTimerRef.current) clearTimeout(widthTimerRef.current);
      widthTimerRef.current = setTimeout(() => setContainerWidth(w), 300);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (widthTimerRef.current) clearTimeout(widthTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the containerWidth===0 boolean (not the raw width) so the observer is only re-created once, on first measurement; see comment above
  }, [containerWidth === 0]); // only re-run dependency on first mount

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
  }, [sync, refreshVariantCounts]);

  const groupData = useAppStore((state: any) => state.groupData);
  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally excludes `sync`: this effect refreshes on groupData changes only; selectedGroup-driven syncs are already handled by the effect below, adding `sync` here would double-fire it
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deselectIcon` is declared later in the component (useCallback below); putting it in the deps array evaluates it during render and throws a TDZ ReferenceError. The effect is guarded by prevSelectedGroupRef, so extra reruns are no-ops.
  }, [selectedGroup, sync]);

  // ── ViewModel ───────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps -- groupData is only used as a refresh signal to re-read groupList from db after group changes, not read directly (same pattern as BatchPanel)
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
      sortField: iconSortField,
      sortDirection: iconSortDirection,
      outOfRangeCodes,
      filterOutOfRange,
    });
    p?.measure('viewModel.compute');
    return result;
  }, [
    iconData,
    selectedGroup,
    searchKeyword,
    columns,
    groupList,
    iconSortField,
    iconSortDirection,
    outOfRangeCodes,
    filterOutOfRange,
  ]);

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

  // Keep live geometry available to the stable marquee drag handlers.
  virtualizerRef.current = virtualizer;
  geomRef.current = { columns, containerWidth, rows: viewModel.rows };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the rows-populated boolean (not the raw length) so scroll restoration only re-runs on the empty<->populated transition, not on every icon add/remove
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
      if (value) analyticsTrack('search.execute');
    } else {
      searchTimerRef.current = setTimeout(() => {
        searchLastFireRef.current = Date.now();
        setSearchKeyword(value || null);
        if (value) analyticsTrack('search.execute');
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
      analyticsTrack('toolbar.action', { action: 'iconSize' });
    }, 150);
  }, []);

  // ── Drag & drop (useDropzone hook — shares ref with scroll container) ──
  // 导入结果反馈: 码点用尽导致部分失败时警告, 否则按调用方给定的成功文案提示
  const reportImportResult = useCallback(
    (
      result: { added: number; failed: number; appended?: number; filled?: number } | undefined,
      successMessage: string
    ) => {
      if (result && result.failed > 0) {
        message.warning(t('import.codeExhausted', { added: result.added, failed: result.failed }));
      } else {
        message.success(successMessage);
      }
    },
    [t]
  );

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
          db.addIcons(acceptableIcons, selectedGroup, (result) => {
            reportImportResult(
              result,
              buildImportSuccessMessage(t, result, acceptableIcons.length)
            );
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
              db.addIcons(acceptableIcons, selectedGroup, (result) => {
                reportImportResult(
                  result,
                  buildImportSuccessMessage(t, result, acceptableIcons.length)
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
          db.addIcons(acceptableIcons, selectedGroup, (result) => {
            reportImportResult(
              result,
              buildImportSuccessMessage(t, result, acceptableIcons.length)
            );
            syncLeft();
            sync();
          });
        }
      }
    },
    [selectedGroup, syncLeft, sync, t, reportImportResult]
  );

  const dropDisabled =
    selectedGroup === 'resource-recent' || selectedGroup === 'resource-recycleBin';
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: onIconDrop,
    disabled: dropDisabled,
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

  // ── Marquee (box) selection ─────────────────────────────────────────
  // Hit-testing is derived from virtualizer row geometry (not DOM), so it
  // works for rows that aren't currently mounted. All the drag handlers are
  // created once and read live values through refs to stay stable.
  useEffect(() => {
    const computeHits = (r: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    }): string[] => {
      const { columns: n, containerWidth: cw, rows } = geomRef.current;
      const vz = virtualizerRef.current;
      if (!vz) return [];
      const measurements = vz.getMeasurements();
      const gap = GRID_COL_GAP;
      const pad = GRID_H_PAD;
      const avail = Math.max(0, cw - pad * 2);
      const cellW = n > 0 ? (avail - (n - 1) * gap) / n : avail;
      const hits: string[] = [];
      for (let i = 0; i < measurements.length; i++) {
        const m = measurements[i];
        const row = rows[m.index];
        if (!row || row.kind !== 'row') continue; // skip group headers
        if (m.start >= r.bottom || m.end <= r.top) continue; // no vertical overlap
        const icons = row.icons;
        for (let c = 0; c < icons.length; c++) {
          const cellLeft = pad + c * (cellW + gap);
          const cellRight = cellLeft + cellW;
          if (cellLeft < r.right && cellRight > r.left) hits.push(icons[c].id);
        }
      }
      return hits;
    };

    const step = () => {
      const el = scrollRef.current;
      const start = marqueeStartRef.current;
      if (!el || !start) return;
      const rect = el.getBoundingClientRect();
      const p = marqueeLastPointerRef.current;

      // Auto-scroll when the pointer nears the top/bottom edge.
      const yInView = p.y - rect.top;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (yInView < MARQUEE_EDGE && el.scrollTop > 0) {
        el.scrollTop = Math.max(0, el.scrollTop - MARQUEE_AUTOSCROLL_STEP);
      } else if (yInView > el.clientHeight - MARQUEE_EDGE && el.scrollTop < maxScroll) {
        el.scrollTop = Math.min(maxScroll, el.scrollTop + MARQUEE_AUTOSCROLL_STEP);
      }

      // Current pointer → content coordinates (clamped to the visible area).
      const vx = Math.min(Math.max(p.x - rect.left, 0), el.clientWidth);
      const vy = Math.min(Math.max(p.y - rect.top, 0), el.clientHeight);
      const curX = vx + el.scrollLeft;
      const curY = vy + el.scrollTop;

      const left = Math.min(start.cx, curX);
      const right = Math.max(start.cx, curX);
      const top = Math.min(start.cy, curY);
      const bottom = Math.max(start.cy, curY);

      setMarqueeRect((prev) =>
        prev &&
        prev.left === left &&
        prev.top === top &&
        prev.width === right - left &&
        prev.height === bottom - top
          ? prev
          : { left, top, width: right - left, height: bottom - top }
      );

      const hits = computeHits({ left, top, right, bottom });
      let finalIds: string[];
      if (marqueeCtrlRef.current && marqueeBaseRef.current.size > 0) {
        const set = new Set(marqueeBaseRef.current);
        for (const id of hits) set.add(id);
        finalIds = Array.from(set);
      } else {
        finalIds = hits;
      }
      const sig = finalIds.slice().sort().join('|');
      if (sig !== marqueeAppliedRef.current) {
        marqueeAppliedRef.current = sig;
        useAppStore.getState().setIconSelection(finalIds);
      }
    };

    const runLoop = () => {
      if (marqueeRafRef.current != null) return;
      const loop = () => {
        if (!marqueeActiveRef.current) {
          marqueeRafRef.current = null;
          return;
        }
        step();
        marqueeRafRef.current = requestAnimationFrame(loop);
      };
      marqueeRafRef.current = requestAnimationFrame(loop);
    };

    const cleanup = () => {
      const h = marqueeHandlersRef.current;
      if (h.move) document.removeEventListener('mousemove', h.move);
      if (h.up) document.removeEventListener('mouseup', h.up);
      if (h.key) document.removeEventListener('keydown', h.key, true);
      if (marqueeRafRef.current != null) {
        cancelAnimationFrame(marqueeRafRef.current);
        marqueeRafRef.current = null;
      }
    };

    const finishMarquee = (restore: boolean) => {
      const wasActive = marqueeActiveRef.current;
      cleanup();
      marqueeActiveRef.current = false;
      marqueePendingRef.current = false;
      marqueeStartRef.current = null;
      if (restore) {
        useAppStore.getState().setIconSelection(Array.from(marqueeBaseRef.current));
      }
      if (wasActive) {
        justMarqueedRef.current = true; // swallow the click that follows the drag
        setMarqueeDragging(false);
        setMarqueeRect(null);
      }
    };

    const move = (e: MouseEvent) => {
      marqueeLastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (!marqueeActiveRef.current) {
        if (!marqueePendingRef.current) return;
        const start = marqueeStartClientRef.current;
        if (!start) return;
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < MARQUEE_THRESHOLD) return;
        marqueeActiveRef.current = true;
        marqueePendingRef.current = false;
        setMarqueeDragging(true);
        runLoop();
      }
      step(); // immediate feedback; the rAF loop keeps it live during auto-scroll
    };

    const up = () => finishMarquee(false);

    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!marqueeActiveRef.current && !marqueePendingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      finishMarquee(true); // cancel + restore pre-drag selection
    };

    marqueeHandlersRef.current = { move, up, key };
    return cleanup;
  }, []);

  const handleGridMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // left button only
    const el = scrollRef.current;
    if (!el) return;
    const target = e.target as HTMLElement;
    const iconBlock = target.closest('[data-testid="icon-block"]') as HTMLElement | null;
    if (iconBlock) {
      // 图标块上的按压交给拖拽聚合 (阈值内仍是普通点击, 由 IconBlock 的 click 处理)
      const iconId = iconBlock.getAttribute('data-icon-id');
      if (iconId) pressIconRef.current?.(e, iconId);
      return;
    }
    if (target.closest('[data-marquee-skip]')) return; // group headers etc.
    if (geomRef.current.rows.length === 0) return;
    const rect = el.getBoundingClientRect();
    // Ignore presses on the scrollbar gutter.
    if (e.clientX - rect.left >= el.clientWidth) return;
    if (e.clientY - rect.top >= el.clientHeight) return;

    marqueeStartRef.current = {
      cx: e.clientX - rect.left + el.scrollLeft,
      cy: e.clientY - rect.top + el.scrollTop,
    };
    marqueeStartClientRef.current = { x: e.clientX, y: e.clientY };
    marqueeLastPointerRef.current = { x: e.clientX, y: e.clientY };
    marqueeCtrlRef.current = e.ctrlKey || e.metaKey;
    marqueeBaseRef.current = new Set(useAppStore.getState().selectedIcons);
    marqueeActiveRef.current = false;
    marqueePendingRef.current = true;
    marqueeAppliedRef.current = '';

    const h = marqueeHandlersRef.current;
    if (h.move) document.addEventListener('mousemove', h.move);
    if (h.up) document.addEventListener('mouseup', h.up);
    if (h.key) document.addEventListener('keydown', h.key, true);
  }, []);

  // Swallow the click emitted right after a marquee drag so it doesn't
  // deselect (empty-space overlay) or single-select (icon) the target.
  const handleGridClickCapture = useCallback((e: React.MouseEvent) => {
    if (justMarqueedRef.current) {
      justMarqueedRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  // ── Right-click context menu ────────────────────────────────────────
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleIconContextMenu = useCallback(
    (id: string, data: any, e: React.MouseEvent) => {
      e.preventDefault();
      const s = useAppStore.getState();
      let ids: string[];
      if (s.selectedIcons.has(id) && s.selectedIcons.size > 1) {
        // Right-clicked an icon inside a multi-selection → act on the whole set.
        ids = Array.from(s.selectedIcons) as string[];
      } else {
        // Otherwise make it the single selection first, then act on it alone.
        if (s.batchMode || s.selectedIcons.size > 0) s.clearBatchSelection();
        s.setLastClickedIconId(id);
        handleIconSelected(id, data);
        ids = [id];
      }
      setContextMenu({ x: e.clientX, y: e.clientY, ids });
    },
    [handleIconSelected]
  );

  const handleCtxFavorite = useCallback(
    (ids: string[], favorite: boolean) => {
      if (ids.length === 1) db.setIconFavorite(ids[0], favorite ? 1 : 0);
      else db.setIconsFavorite(ids, favorite ? 1 : 0);
      syncLeft();
      message.success(
        favorite
          ? t('batch.favorited', { count: ids.length })
          : t('batch.unfavorited', { count: ids.length })
      );
    },
    [syncLeft, t]
  );

  const handleCtxRecycle = useCallback(
    (ids: string[]) => {
      const multi = ids.length > 1;
      // 只读预检取变体跟随警告 (variant-follow → recycle 语境 → variant.recycleNote)
      const plan = useAppStore.getState().planDelete(ids, 'recycle');
      confirm({
        title: multi ? t('batch.deleteTitle') : t('editor.recycleTitle'),
        content: confirmContentWithWarnings(
          multi ? t('batch.deleteConfirm', { count: ids.length }) : t('editor.recycleContent'),
          plan.warnings,
          'recycle',
          t
        ),
        onOk() {
          // store action 内已落库 + dirty 标记 + syncLeft
          useAppStore.getState().recycleIconsAction(ids);
          useAppStore.getState().clearBatchSelection();
          selectIcon(null);
          message.success(
            multi ? t('contextMenu.recycledCount', { count: ids.length }) : t('editor.recycled')
          );
          analyticsTrack('batch.operation', { operation: 'recycle' });
        },
      });
    },
    [selectIcon, t]
  );

  const handleCtxRestore = useCallback(
    (ids: string[]) => {
      // No original group is tracked, so restore lands in "Ungrouped".
      useAppStore.getState().moveIconsTo(ids, 'resource-uncategorized');
      useAppStore.getState().clearBatchSelection();
      selectIcon(null);
      message.success(
        ids.length > 1
          ? t('contextMenu.restoredCount', { count: ids.length })
          : t('contextMenu.restored')
      );
    },
    [selectIcon, t]
  );

  const handleCtxDelete = useCallback(
    (ids: string[]) => {
      const multi = ids.length > 1;
      // 只读预检取级联硬删警告 (variant-cascade-delete → delete 语境 → variant.deleteConfirm)
      const plan = useAppStore.getState().planDelete(ids, 'permanent');
      confirm({
        title: multi
          ? t('contextMenu.deletePermanentlyCount', { count: ids.length })
          : t('editor.deleteTitle'),
        content: confirmContentWithWarnings(
          multi
            ? t('contextMenu.deleteConfirmCount', { count: ids.length })
            : t('editor.deleteContent'),
          plan.warnings,
          'delete',
          t
        ),
        okType: 'danger',
        okText: t('common.delete'),
        onOk() {
          useAppStore.getState().deleteIconsPermanently(ids);
          useAppStore.getState().clearBatchSelection();
          selectIcon(null);
          analyticsTrack('icon.delete');
          message.success(
            multi ? t('contextMenu.deletedCount', { count: ids.length }) : t('editor.deleted')
          );
        },
      });
    },
    [selectIcon, t]
  );

  const handleCtxExport = useCallback((ids: string[]) => {
    exportDialogIdsRef.current = ids;
    setExportDialogVisible(true);
    analyticsTrack('batch.operation', { operation: 'export' });
  }, []);

  // ── 拖拽聚合 — 框选图标拖到侧边栏 (未分组/回收站/具体分组) ────────────
  const handleStackDrop = useCallback(
    (ids: string[], targetGroupId: string) => {
      const multi = ids.length > 1;
      const s = useAppStore.getState();
      if (targetGroupId === 'resource-recycleBin') {
        s.recycleIconsAction(ids);
        s.clearBatchSelection();
        selectIcon(null);
        message.success(
          multi ? t('contextMenu.recycledCount', { count: ids.length }) : t('editor.recycled')
        );
        analyticsTrack('batch.operation', { operation: 'recycle' });
        return;
      }
      s.moveIconsTo(ids, targetGroupId);
      s.clearBatchSelection();
      selectIcon(null);
      const groupName =
        targetGroupId === 'resource-uncategorized'
          ? t('nav.ungrouped')
          : ((db.getGroupList() as any[]).find((g) => g.id === targetGroupId)?.groupName ??
            targetGroupId);
      message.success(t('contextMenu.movedToGroup', { count: ids.length, group: groupName }));
      analyticsTrack('batch.operation', { operation: 'move' });
    },
    [selectIcon, t]
  );

  const { pressIcon, dragLayer } = useIconStackDrag({
    containerRef: scrollRef,
    onDrop: handleStackDrop,
    // 拖拽结束后吞掉紧随的 click — 复用 marquee 的同一机制; click 与 mouseup 同步派发,
    // 下一宏任务即复位, 避免松手在侧边栏 (无 click 进画布) 时误吞后续正常点击
    onDragFinish: () => {
      justMarqueedRef.current = true;
      window.setTimeout(() => {
        justMarqueedRef.current = false;
      }, 0);
    },
  });
  pressIconRef.current = pressIcon;

  // ── 画布空白区右键菜单 ───────────────────────────────────────────────
  const handleBlankContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // 图标块上的右键由 IconBlock 自己的 handler 处理 (事件会冒泡到这里, 必须跳过)
    if (target.closest('[data-testid="icon-block"]')) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, ids: [], blank: true });
  }, []);

  // 导入目标: 真实分组导入到该分组, 资源视图 (全部/收藏/最近/未分组) 统一落到未分组
  const isRealGroup = !selectedGroup.startsWith('resource-');
  const blankContextItems: ContextMenuItem[] = useMemo(() => {
    const visibleIds = flatIconIdsRef.current;
    return [
      {
        key: 'import',
        label: isRealGroup ? t('contextMenu.importToGroup') : t('contextMenu.importIcons'),
        icon: <Upload size={14} />,
        // 回收站里导入语义不明确, 禁用
        disabled: selectedGroup === 'resource-recycleBin',
        onSelect: () => {
          useAppStore
            .getState()
            .requestImportIcons(isRealGroup ? selectedGroup : 'resource-uncategorized');
        },
      },
      {
        key: 'select-all',
        label: t('contextMenu.selectAll'),
        icon: <ListChecks size={14} />,
        disabled: visibleIds.length === 0,
        onSelect: () => {
          useAppStore.getState().selectAllIcons(visibleIds);
        },
      },
      { key: 'sep', separator: true },
      {
        key: 'export-font',
        label: t('contextMenu.exportFont'),
        icon: <FileType2 size={14} />,
        onSelect: () => {
          // 真实分组/未分组视图 → 预选当前分组; 其他资源视图 → 沿用持久化选择
          const groupIds = isRealGroup
            ? [selectedGroup]
            : selectedGroup === 'resource-uncategorized'
              ? ['resource-uncategorized']
              : undefined;
          useAppStore.getState().openExportDialog(groupIds);
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flatIconIdsRef 是 ref, 菜单每次打开时重新读取; 依赖 contextMenu 保证打开瞬间重算
  }, [selectedGroup, isRealGroup, t, contextMenu]);

  // ids captured into exportDialogIdsRef at click time (contextMenu itself is
  // cleared right after the menu item is selected — see IconContextMenu).
  const exportDialogIcons: IconExportTarget[] = useMemo(() => {
    if (!exportDialogVisible) return [];
    return exportDialogIdsRef.current
      .map((id) => {
        const data = db.getIconData(id);
        return data ? { id, iconName: data.iconName, iconContent: data.iconContent } : null;
      })
      .filter(Boolean) as IconExportTarget[];
  }, [exportDialogVisible]);

  const groupPickerGroups: GroupPickerGroup[] = useMemo(
    () =>
      (groupList as any[]).map((g) => ({
        id: g.id,
        groupName: g.groupName,
        groupIcon: g.groupIcon,
      })),
    [groupList]
  );

  const groupPickerWarning = useMemo(() => {
    if (!groupPickerMode) return null;
    const ids = groupPickerIdsRef.current;
    // variantCount 与目标组无关 — 用未分组作占位目标走 planMove 只读预检取变体计数
    const variantCount = useAppStore
      .getState()
      .planMove(ids, 'resource-uncategorized').variantCount;
    if (variantCount <= 0) return null;
    const warning: CommandWarning =
      groupPickerMode === 'copy'
        ? { type: 'variant-not-copied', count: variantCount }
        : { type: 'variant-follow', count: variantCount };
    return <>{warningsToNodes([warning], groupPickerMode, t)}</>;
  }, [groupPickerMode, t]);

  // 目标分组区间越界数 → 移动越界内联选择 (右键菜单/框选路径) — 归一到
  // store.planMove 只读预检 (计数含变体, 与实际重分配的作用范围一致)
  const getMoveOutOfRangeCount = useCallback(
    (targetGroupId: string): number =>
      useAppStore.getState().planMove(groupPickerIdsRef.current, targetGroupId).outOfRange?.count ??
      0,
    []
  );

  const handleGroupPickerConfirm = useCallback(
    (targetGroupId: string, opts?: { reassignOutOfRange: boolean }) => {
      const ids = groupPickerIdsRef.current;
      const s = useAppStore.getState();
      if (groupPickerMode === 'move') {
        // store action 内已落库 + dirty 标记 + syncLeft; Outcome 供组件拼 toast
        const outcome = s.moveIconsTo(ids, targetGroupId, opts);
        s.clearBatchSelection();
        selectIcon(null);
        if (outcome.reassigned.length > 0) {
          message.success(
            t('batch.movedReassigned', { count: ids.length, reassigned: outcome.reassigned.length })
          );
        } else {
          message.success(t('batch.moved', { count: ids.length }));
        }
        analyticsTrack('batch.operation', { operation: 'move' });
      } else if (groupPickerMode === 'copy') {
        const outcome = s.copyIconsTo(ids, targetGroupId);
        s.clearBatchSelection();
        selectIcon(null);
        if (outcome.failed > 0) {
          message.warning(
            t('batch.copyCodeExhausted', { added: outcome.copied, failed: outcome.failed })
          );
        } else {
          message.success(t('batch.copied', { count: ids.length }));
        }
        analyticsTrack('batch.operation', { operation: 'copy' });
      }
      setGroupPickerMode(null);
    },
    [groupPickerMode, selectIcon, t]
  );

  const contextItems: ContextMenuItem[] = useMemo(() => {
    if (!contextMenu) return [];
    if (contextMenu.blank) return blankContextItems;
    const ids = contextMenu.ids;
    const count = ids.length;
    const multi = count > 1;

    if (selectedGroup === 'resource-recycleBin') {
      return [
        {
          key: 'restore',
          label: multi ? t('contextMenu.restoreCount', { count }) : t('contextMenu.restore'),
          icon: <RotateCcw size={14} />,
          onSelect: () => handleCtxRestore(ids),
        },
        { key: 'sep', separator: true },
        {
          key: 'delete',
          label: multi
            ? t('contextMenu.deletePermanentlyCount', { count })
            : t('contextMenu.deletePermanently'),
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () => handleCtxDelete(ids),
        },
      ];
    }

    const allFav = ids.every((id) => (db.getIconData(id) as any)?.isFavorite === 1);
    return [
      {
        key: 'favorite',
        label: allFav
          ? multi
            ? t('contextMenu.unfavoriteCount', { count })
            : t('batch.unfavorite')
          : multi
            ? t('contextMenu.favoriteCount', { count })
            : t('batch.favorite'),
        icon: allFav ? <StarOff size={14} /> : <Star size={14} />,
        onSelect: () => handleCtxFavorite(ids, !allFav),
      },
      {
        key: 'move',
        label: multi ? t('contextMenu.moveCount', { count }) : t('batch.moveTo'),
        icon: <FolderInput size={14} />,
        onSelect: () => {
          groupPickerIdsRef.current = ids;
          setGroupPickerMode('move');
        },
      },
      {
        key: 'copy',
        label: multi ? t('contextMenu.copyCount', { count }) : t('batch.copyTo'),
        icon: <Copy size={14} />,
        onSelect: () => {
          groupPickerIdsRef.current = ids;
          setGroupPickerMode('copy');
        },
      },
      {
        key: 'export',
        label: multi ? t('contextMenu.exportCount', { count }) : t('contextMenu.export'),
        icon: <Download size={14} />,
        onSelect: () => handleCtxExport(ids),
      },
      { key: 'sep', separator: true },
      {
        key: 'recycle',
        label: multi ? t('contextMenu.recycleCount', { count }) : t('editor.recycle'),
        icon: <Trash2 size={14} />,
        danger: true,
        onSelect: () => handleCtxRecycle(ids),
      },
    ];
  }, [
    contextMenu,
    selectedGroup,
    t,
    handleCtxRestore,
    handleCtxDelete,
    handleCtxFavorite,
    handleCtxRecycle,
    handleCtxExport,
    blankContextItems,
  ]);

  // Escape to exit batch mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Marquee drag owns Escape while active (restores pre-drag selection).
      if (marqueeActiveRef.current || marqueePendingRef.current) return;
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
            <p key={i} className={i === 0 ? 't-note' : 'mt-1 t-caption'}>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally depends on the fresh array from getVirtualItems() (changes every scroll-driven render) to force recompute while scrolling; `virtualizer` itself is a stable ref (per useVirtualizer) and would not retrigger on scroll
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

      {/* Drop zone overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none">
          <div className="w-12 h-12 mb-4 rounded-2xl bg-accent/15 flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
            >
              <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
              <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground">{t('dropZone.title')}</p>
          <p className="text-xs text-foreground-muted mt-1">
            {selectedGroup === 'resource-favorite'
              ? t('dropZone.subtitleFavorite')
              : selectedGroup.startsWith('resource-')
                ? t('dropZone.subtitleUngrouped')
                : t('dropZone.subtitle')}
          </p>
        </div>
      )}

      {/* 回收站字码占用提示条 — 仅回收站视图可见 */}
      {selectedGroup === 'resource-recycleBin' && (
        <div
          className={cn(
            'shrink-0 mx-3 mt-2 mb-1',
            'flex items-center gap-1.5',
            'rounded-md border border-warning/30 bg-warning-subtle/60',
            'px-3 py-1.5',
            'text-xs text-foreground-muted'
          )}
        >
          <Info size={13} className="shrink-0 text-warning" />
          <span>{t('trash.codeOccupancyHint')}</span>
        </div>
      )}

      <div
        {...dropzoneRootProps}
        ref={mergedScrollRef}
        onMouseDown={handleGridMouseDown}
        onClickCapture={handleGridClickCapture}
        onContextMenu={handleBlankContextMenu}
        className={cn(
          'relative text-center flex-grow',
          'overflow-hidden overflow-y-auto',
          'transition-[filter] duration-300',
          isDragActive && 'blur-[30px]',
          marqueeDragging && 'select-none'
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
                    data-marquee-skip
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
                      handleIconContextMenu={handleIconContextMenu}
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

            {/* Marquee selection rectangle (content-coordinate space) */}
            {marqueeRect && (
              <div
                className="pointer-events-none absolute z-40 rounded-[1px] border border-accent bg-accent/10"
                style={{
                  left: marqueeRect.left,
                  top: marqueeRect.top,
                  width: marqueeRect.width,
                  height: marqueeRect.height,
                }}
              />
            )}
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

      {/* Right-click context menu */}
      {contextMenu && (
        <IconContextMenu
          open
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems}
          onClose={closeContextMenu}
        />
      )}

      {/* Move / copy target picker (driven by the context menu) */}
      <GroupPickerDialog
        open={groupPickerMode !== null}
        onOpenChange={(open) => !open && setGroupPickerMode(null)}
        mode={groupPickerMode ?? 'move'}
        groups={groupPickerGroups}
        warning={groupPickerWarning}
        title={
          groupPickerMode === 'copy'
            ? t('batch.copyToTitle', { count: groupPickerIdsRef.current.length })
            : t('batch.moveToTitle', { count: groupPickerIdsRef.current.length })
        }
        getOutOfRangeCount={getMoveOutOfRangeCount}
        onConfirm={handleGroupPickerConfirm}
      />

      {/* Export dialog (driven by the context menu's "导出…" item) */}
      <IconExportDialog
        visible={exportDialogVisible}
        onClose={() => setExportDialogVisible(false)}
        icons={exportDialogIcons}
      />

      {/* 拖拽聚合浮层 (portal 到 body) */}
      {dragLayer}
    </div>
  );
}

export default IconGridLocal;
