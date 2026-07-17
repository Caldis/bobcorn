import { create } from 'zustand';
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): icon.import, group.list
import db from '../database';
import config, { getOption, setOption } from '../config';
import { resolveTheme, applyThemeClass } from '../config/themes';
import { applyContentInvalidation } from './contentCache';

// ── Types ─────────────────────────────────────────────────────────

export interface State {
  // UI State
  splashScreenVisible: boolean;
  selectedGroup: string;
  selectedIcon: string | null;
  selectedSource: 'local' | 'cloud';
  sideMenuVisible: boolean;
  sideEditorVisible: boolean;
  darkMode: boolean;
  themeMode: 'light' | 'dark' | 'system';

  // Batch selection
  selectedIcons: Set<string>;
  batchMode: boolean;
  lastClickedIconId: string | null;
  // 拖拽聚合中的图标 — 画布上调淡显示「暂离」(useIconStackDrag 维护)
  draggingIcons: Set<string>;

  // Data
  groupData: any[];
  // 图标内容版本号 — 递增触发 SideEditor 刷新
  iconContentVersion: number;
  // 每图标内容修订号 — 数据层内容写入后经 invalidateIconContent 递增,
  // IconBlock 订阅自己的 rev 以自动重载 (失效逻辑见 contentCache.ts)
  iconContentRevs: Record<string, number>;
  // 热更新的图标内容 — IconBlock 优先读这里的内容
  patchedIcons: Record<string, string>;
  // 批量预取的图标内容 — 虚拟滚动可见区域批量加载
  prefetchedContent: Record<string, string>;

  // Project
  // projectName = 图标字码前缀 (技术: 字体名/CSS 类名/导出目录)
  projectName: string;
  // projectDisplayName = 项目名称 (用户可见, 可空 → UI 回退文件名/前缀)
  projectDisplayName: string | null;
  projectDescription: string | null;
  projectColor: string | null;

  // File state
  currentFilePath: string | null;
  isDirty: boolean;

  // Update state (UI only, not persisted)
  updateStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  updateVersion: string | null;
  updateReleaseNotes: string | null;
  updateProgress: number;
  updateError: string | null;

  // Analytics consent (synced with main process)
  analyticsBasicEnabled: boolean;
  analyticsDetailedEnabled: boolean;
  analyticsConsentShown: boolean;

  // Variant generation progress
  variantProgress: { current: number; total: number; active: boolean } | null;

  // Variant counts cache — plain object for Zustand equality check
  variantCounts: Record<string, number>;

  // 重复字码缓存 (归一化大写 hex → true) — 供 IconBlock/SideEditor 撞码标识, 单次 GROUP BY 查询避免 N+1
  duplicateCodes: Record<string, true>;

  // 越界字码缓存 (归一化大写 hex → true) — 所属分组声明了区间且图标字码落在区间外; 仿 duplicateCodes 在 syncLeft 刷新
  outOfRangeCodes: Record<string, true>;

  // 图标网格排序 — 字段 + 方向 (默认字码升序，等价历史行为)
  iconSortField: 'createTime' | 'updateTime' | 'iconCode' | 'iconName';
  iconSortDirection: 'asc' | 'desc';

  // 图标网格筛选 — 开启时仅显示字码不在所属分组声明区间内的图标 (基于 outOfRangeCodes)
  filterOutOfRange: boolean;
}

export interface Actions {
  showSplashScreen: (show: boolean) => void;
  selectGroup: (groupId: string) => void;
  selectIcon: (iconId: string | null) => void;
  selectSource: (source: 'local' | 'cloud') => void;
  setSideMenuVisible: (visible: boolean) => void;
  setSideEditorVisible: (visible: boolean) => void;
  setThemeMode: (mode: State['themeMode']) => void;
  // Batch selection
  toggleBatchMode: () => void;
  toggleIconSelection: (id: string) => void;
  setIconSelection: (ids: string[]) => void;
  selectAllIcons: (ids: string[]) => void;
  invertSelection: (visibleIds: string[]) => void;
  clearBatchSelection: () => void;
  setLastClickedIconId: (id: string | null) => void;
  setDraggingIcons: (ids: string[]) => void;
  // 分级同步
  syncLeft: () => void; // 重：刷新分组列表 + 图标网格（增删/移动图标/增删分组时用）
  syncIconContent: () => void; // 轻：递增版本号，触发 SideEditor 刷新
  patchIconContent: (iconId: string, content: string) => void; // 最轻：热更新单个图标内容
  prefetchIconContent: (ids: string[]) => void; // 批量预取可见图标的 SVG 内容
  invalidateIconContent: (ids: string[]) => void; // 数据层内容写入的统一失效入口 (bootstrap 注册到 db 广播)
  resetIconContentCaches: () => void; // 项目边界清空内容缓存（防复制的 .icp 同 id 串内容）
  syncAll: () => void;

  // File state
  setCurrentFilePath: (path: string | null) => void;
  markDirty: () => void;
  markClean: () => void;

  // Update actions
  setUpdateStatus: (status: State['updateStatus'], version?: string) => void;
  setUpdateProgress: (percent: number) => void;
  setUpdateError: (error: string | null) => void;

  // Analytics
  setAnalyticsConsent: (basic: boolean, detailed: boolean) => void;
  markConsentShown: () => void;
  loadAnalyticsConsent: () => Promise<void>;

  // Variant actions
  setVariantProgress: (
    progress: { current: number; total: number; active: boolean } | null
  ) => void;
  refreshVariantCounts: () => void;
  refreshDuplicateCodes: () => void;
  refreshOutOfRangeCodes: () => void;

  // 图标网格排序
  setIconSortField: (field: State['iconSortField']) => void;
  setIconSortDirection: (direction: State['iconSortDirection']) => void;

  // 图标网格筛选
  setFilterOutOfRange: (value: boolean) => void;
}

const useAppStore = create<State & Actions>((set, get) => ({
  // UI State
  splashScreenVisible: true,
  selectedGroup: config.defaultSelectedGroup,
  selectedIcon: null,
  selectedSource: 'local',
  sideMenuVisible: true,
  sideEditorVisible: true,
  darkMode: false,
  themeMode: 'system' as const,

  // Batch selection
  selectedIcons: new Set<string>(),
  batchMode: false,
  lastClickedIconId: null,
  draggingIcons: new Set<string>(),

  // Data
  groupData: [],
  iconContentVersion: 0,
  iconContentRevs: {},
  patchedIcons: {},
  prefetchedContent: {},

  // Project
  projectName: 'iconfont',
  projectDisplayName: null,
  projectDescription: null,
  projectColor: null,

  // File state
  currentFilePath: (getOption('currentFilePath') as string | null) ?? null,
  isDirty: false,

  // Update state
  updateStatus: 'idle',
  updateVersion: null,
  updateReleaseNotes: null,
  updateProgress: 0,
  updateError: null,

  // Analytics consent
  analyticsBasicEnabled: true,
  analyticsDetailedEnabled: false,
  analyticsConsentShown: false,

  // Variant generation progress
  variantProgress: null,

  // Variant counts cache
  variantCounts: {},
  duplicateCodes: {},
  outOfRangeCodes: {},

  // 图标网格排序 — 默认字码升序，等价历史行为
  iconSortField: 'iconCode',
  iconSortDirection: 'asc',

  // 图标网格筛选 — 默认关闭
  filterOutOfRange: false,

  // Actions
  showSplashScreen: (show: boolean) => set({ splashScreenVisible: show }),

  selectGroup: (groupId: string) => {
    set({
      selectedGroup: groupId,
      selectedIcon: null,
      selectedSource: 'local',
      selectedIcons: new Set<string>(),
      batchMode: false,
      lastClickedIconId: null,
    });
    set({ sideEditorVisible: true });
  },

  selectIcon: (iconId: string | null) => {
    set({ selectedIcon: iconId });
  },

  selectSource: (source: 'local' | 'cloud') => {
    set({ selectedSource: source });
    if (source === 'cloud') set({ sideEditorVisible: false });
    if (source === 'local') set({ sideEditorVisible: true });
  },

  setSideMenuVisible: (visible: boolean) => set({ sideMenuVisible: visible }),
  setSideEditorVisible: (visible: boolean) => set({ sideEditorVisible: visible }),

  setThemeMode: (mode) => {
    const { isDark } = resolveTheme(mode);
    applyThemeClass(isDark ? 'dark' : 'light');
    set({ themeMode: mode, darkMode: isDark });
    setOption({ themeMode: mode, darkMode: isDark });
  },

  // Batch selection actions
  toggleBatchMode: () => {
    const { batchMode, selectedIcon } = get();
    // When entering batch mode, carry over the currently single-selected icon
    const next = !batchMode && selectedIcon ? new Set<string>([selectedIcon]) : new Set<string>();
    set({ batchMode: !batchMode, selectedIcons: next, lastClickedIconId: null });
  },
  toggleIconSelection: (id: string) => {
    const { selectedIcons, selectedIcon } = get();
    const next = new Set(selectedIcons);
    // Carry over single-selected icon when first entering batch mode (Ctrl+click)
    if (next.size === 0 && selectedIcon) {
      next.add(selectedIcon);
    }
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Auto-enter batch mode when any icon selected, auto-exit when all deselected
    const batchMode = next.size > 0;
    // Clear single-select highlight to unify visual state in batch mode
    set({
      selectedIcons: next,
      batchMode,
      lastClickedIconId: id,
      selectedIcon: batchMode ? null : selectedIcon,
    });
  },
  setIconSelection: (ids: string[]) => {
    const next = new Set(ids);
    // Clear single-select highlight to unify visual state in batch mode
    set({
      selectedIcons: next,
      batchMode: next.size > 0,
      selectedIcon: next.size > 0 ? null : get().selectedIcon,
    });
  },
  selectAllIcons: (ids: string[]) => {
    const next = new Set(ids);
    set({
      selectedIcons: next,
      batchMode: next.size > 0,
      lastClickedIconId: ids[ids.length - 1] ?? null,
    });
  },
  invertSelection: (visibleIds: string[]) => {
    const current = get().selectedIcons;
    const next = new Set(visibleIds.filter((id) => !current.has(id)));
    set({ selectedIcons: next, batchMode: next.size > 0, lastClickedIconId: null });
  },
  clearBatchSelection: () => {
    set({ selectedIcons: new Set<string>(), batchMode: false, lastClickedIconId: null });
  },
  setLastClickedIconId: (id: string | null) => {
    set({ lastClickedIconId: id });
  },
  // 拖拽聚合中的图标集 — 画布上对应 IconBlock 调淡; 空数组即清空
  setDraggingIcons: (ids: string[]) => {
    set({ draggingIcons: new Set(ids) });
  },

  // 项目元数据轻同步：只刷新 projectName/displayName/description/color，不触发分组列表/图标重载
  syncProjectMeta: () => {
    let projectName = 'iconfont';
    let projectDisplayName: string | null = null;
    let projectDescription: string | null = null;
    let projectColor: string | null = null;
    try {
      projectName = (db as any).getProjectName() || 'iconfont';
      projectDisplayName = (db as any).getProjectDisplayName?.() ?? null;
      projectDescription = (db as any).getProjectDescription?.() ?? null;
      projectColor = (db as any).getProjectColor?.() ?? null;
    } catch {
      /* db not initialized yet */
    }
    set({ projectName, projectDisplayName, projectDescription, projectColor });
  },

  // 重同步：刷新分组列表（触发 ResourceNav 计数 + GroupList 计数 + IconGridLocal 重载）
  syncLeft: () => {
    const data = (db as any).getGroupList();
    let projectName = 'iconfont';
    let projectDisplayName: string | null = null;
    let projectDescription: string | null = null;
    let projectColor: string | null = null;
    try {
      projectName = (db as any).getProjectName() || 'iconfont';
      projectDisplayName = (db as any).getProjectDisplayName?.() ?? null;
      projectDescription = (db as any).getProjectDescription?.() ?? null;
      projectColor = (db as any).getProjectColor?.() ?? null;
    } catch {
      /* db not initialized yet */
    }
    set({ groupData: data, projectName, projectDisplayName, projectDescription, projectColor });
    // 字码变动路径 (导入/复制/改码/修复/载入项目) 都会走 syncLeft, 顺带刷新撞码 + 越界缓存
    get().refreshDuplicateCodes();
    get().refreshOutOfRangeCodes();
  },

  // 轻同步：只通知图标内容变了（不触发分组列表/计数/网格重载）
  syncIconContent: () => {
    set({ iconContentVersion: get().iconContentVersion + 1 });
  },

  // 最轻同步：热更新单个图标内容（直接更新 IconBlock，不查 DB 不重载网格）
  patchIconContent: (iconId: string, content: string) => {
    set({ patchedIcons: { ...get().patchedIcons, [iconId]: content } });
  },

  // 数据层内容写入的统一失效入口 — db.registerOnIconContentChanged 在 bootstrap
  // 桥接到这里。rev 递增使 IconBlock 自动重载, 同时清掉旧的 patched/prefetched
  // 缓存条目并递增 iconContentVersion (SideEditor 刷新)。写入 callsite 不需要
  // 再手工 patch/syncIconContent; 高频路径可在其后 patchIconContent 作快路径
  invalidateIconContent: (ids: string[]) => {
    const next = applyContentInvalidation(get(), ids);
    if (!next) return;
    set({ ...next, iconContentVersion: get().iconContentVersion + 1 });
  },

  // 批量预取可见图标的 SVG 内容（虚拟滚动新行可见时，一次 SQL 查询取回所有内容）
  prefetchIconContent: (ids: string[]) => {
    const map: Map<string, string> = (db as any).getIconContentBatch(ids);
    const patch: Record<string, string> = {};
    map.forEach((content, id) => {
      patch[id] = content;
    });
    if (Object.keys(patch).length > 0) {
      set({ prefetchedContent: { ...get().prefetchedContent, ...patch } });
    }
  },

  // 项目打开/新建时清空 patched/prefetched 缓存与修订号 —— 复制出的 .icp 图标
  // id 相同，不清空会把上一个项目的内容缓存串到新项目的画布上
  resetIconContentCaches: () => {
    set({ patchedIcons: {}, prefetchedContent: {}, iconContentRevs: {} });
  },

  syncAll: () => {
    get().syncLeft();
  },

  // File state
  setCurrentFilePath: (path: string | null) => {
    set({ currentFilePath: path });
    setOption({ currentFilePath: path });
    // Sync project context for analytics
    if (path) {
      const projectName = (window as any).electronAPI.pathBasename(path, '.icp');
      (window as any).electronAPI.analyticsSetProject(projectName);
    } else {
      (window as any).electronAPI.analyticsSetProject(null);
    }
  },
  markDirty: () => {
    if (!get().isDirty) set({ isDirty: true });
  },
  markClean: () => {
    if (get().isDirty) set({ isDirty: false });
  },

  // Update actions
  setUpdateStatus: (status, version?) => {
    set({
      updateStatus: status,
      ...(version !== undefined ? { updateVersion: version } : {}),
      ...(status === 'idle'
        ? { updateVersion: null, updateReleaseNotes: null, updateProgress: 0, updateError: null }
        : {}),
    });
  },
  setUpdateProgress: (percent) => set({ updateProgress: percent }),
  setUpdateError: (error) => set({ updateError: error }),

  // Analytics actions
  setAnalyticsConsent: (basic: boolean, detailed: boolean) => {
    set({ analyticsBasicEnabled: basic, analyticsDetailedEnabled: detailed });
    (window as any).electronAPI.analyticsUpdateConsent({
      basicEnabled: basic,
      detailedEnabled: detailed,
    });
  },

  markConsentShown: () => {
    set({ analyticsConsentShown: true });
    (window as any).electronAPI.analyticsUpdateConsent({
      consentShownAt: new Date().toISOString(),
    });
  },

  loadAnalyticsConsent: async () => {
    const consent = await (window as any).electronAPI.analyticsGetConsent();
    set({
      analyticsBasicEnabled: consent.basicEnabled,
      analyticsDetailedEnabled: consent.detailedEnabled,
      analyticsConsentShown: !!consent.consentShownAt,
    });
  },

  // Variant actions
  setVariantProgress: (progress) => {
    set({ variantProgress: progress });
  },
  refreshVariantCounts: () => {
    try {
      // Single GROUP BY query replaces N per-icon queries
      const db = require('../database').default;
      const map: Map<string, number> = db.getAllVariantCounts();
      // Convert Map to plain object for Zustand shallow equality
      const obj: Record<string, number> = {};
      map.forEach((count: number, id: string) => {
        obj[id] = count;
      });
      set({ variantCounts: obj });
    } catch {
      set({ variantCounts: {} });
    }
  },

  // 重复字码缓存刷新 — 单次 GROUP BY, 在 syncLeft 内触发 (所有字码变动路径都会 syncLeft)
  refreshDuplicateCodes: () => {
    try {
      const list: string[] = (db as any).getDuplicateIconCodes();
      const obj: Record<string, true> = {};
      list.forEach((code) => {
        obj[code] = true;
      });
      set({ duplicateCodes: obj });
    } catch {
      set({ duplicateCodes: {} });
    }
  },

  // 越界字码缓存刷新 — 分组区间 (getGroupList) × 各组图标码位 (getAllIconsGrouped) 客户端一次算出,
  // 归一化大写 hex → true, 供 IconBlock 网格越界标识。在 syncLeft 内触发。
  refreshOutOfRangeCodes: () => {
    try {
      const groups: any[] = (db as any).getGroupList();
      const ranges = new Map<string, { start: number; end: number }>();
      for (const g of groups) {
        const s = g.codeRangeStart;
        const e = g.codeRangeEnd;
        if (s !== null && s !== undefined && e !== null && e !== undefined) {
          ranges.set(g.id, { start: Number(s), end: Number(e) });
        }
      }
      const obj: Record<string, true> = {};
      if (ranges.size > 0) {
        const grouped: Record<string, any[]> = (db as any).getAllIconsGrouped();
        ranges.forEach((range, gid) => {
          const icons = grouped[gid];
          if (!icons) return;
          for (const ic of icons) {
            const hex = String(ic.iconCode ?? '')
              .trim()
              .toUpperCase();
            if (!/^[0-9A-F]{4}$/.test(hex)) continue;
            const dec = parseInt(hex, 16);
            if (dec < range.start || dec > range.end) obj[hex] = true;
          }
        });
      }
      set({ outOfRangeCodes: obj });
    } catch {
      set({ outOfRangeCodes: {} });
    }
  },

  // 图标网格排序
  setIconSortField: (field) => set({ iconSortField: field }),
  setIconSortDirection: (direction) => set({ iconSortDirection: direction }),

  // 图标网格筛选
  setFilterOutOfRange: (value) => set({ filterOutOfRange: value }),
}));

/**
 * Track an analytics event from the renderer process.
 * Import this instead of calling electronAPI directly.
 */
export function analyticsTrack(event: string, params?: Record<string, unknown>): void {
  (window as any).electronAPI.analyticsTrack(event, params);
}

export default useAppStore;
