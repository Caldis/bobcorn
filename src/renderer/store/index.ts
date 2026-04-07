import { create } from 'zustand';
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): icon.import, group.list
import db from '../database';
import config, { getOption, setOption } from '../config';
import { resolveTheme, applyThemeClass } from '../config/themes';

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

  // Data
  groupData: any[];
  // 图标内容版本号 — 递增触发 SideEditor 刷新
  iconContentVersion: number;
  // 热更新的图标内容 — IconBlock 优先读这里的内容
  patchedIcons: Record<string, string>;
  // 批量预取的图标内容 — 虚拟滚动可见区域批量加载
  prefetchedContent: Record<string, string>;

  // Project
  projectName: string;
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

  // Variant generation progress
  variantProgress: { current: number; total: number; active: boolean } | null;

  // Variant counts cache — plain object for Zustand equality check
  variantCounts: Record<string, number>;
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
  // 分级同步
  syncLeft: () => void; // 重：刷新分组列表 + 图标网格（增删/移动图标/增删分组时用）
  syncIconContent: () => void; // 轻：递增版本号，触发 SideEditor 刷新
  patchIconContent: (iconId: string, content: string) => void; // 最轻：热更新单个图标内容
  prefetchIconContent: (ids: string[]) => void; // 批量预取可见图标的 SVG 内容
  syncAll: () => void;

  // File state
  setCurrentFilePath: (path: string | null) => void;
  markDirty: () => void;
  markClean: () => void;

  // Update actions
  setUpdateStatus: (status: State['updateStatus'], version?: string) => void;
  setUpdateProgress: (percent: number) => void;
  setUpdateError: (error: string | null) => void;

  // Variant actions
  setVariantProgress: (
    progress: { current: number; total: number; active: boolean } | null
  ) => void;
  refreshVariantCounts: () => void;
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

  // Data
  groupData: [],
  iconContentVersion: 0,
  patchedIcons: {},
  prefetchedContent: {},

  // Project
  projectName: 'iconfont',
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

  // Variant generation progress
  variantProgress: null,

  // Variant counts cache
  variantCounts: {},

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

  // 项目元数据轻同步：只刷新 projectName/description/color，不触发分组列表/图标重载
  syncProjectMeta: () => {
    let projectName = 'iconfont';
    let projectDescription: string | null = null;
    let projectColor: string | null = null;
    try {
      projectName = (db as any).getProjectName() || 'iconfont';
      projectDescription = (db as any).getProjectDescription?.() ?? null;
      projectColor = (db as any).getProjectColor?.() ?? null;
    } catch {
      /* db not initialized yet */
    }
    set({ projectName, projectDescription, projectColor });
  },

  // 重同步：刷新分组列表（触发 ResourceNav 计数 + GroupList 计数 + IconGridLocal 重载）
  syncLeft: () => {
    const data = (db as any).getGroupList();
    let projectName = 'iconfont';
    let projectDescription: string | null = null;
    let projectColor: string | null = null;
    try {
      projectName = (db as any).getProjectName() || 'iconfont';
      projectDescription = (db as any).getProjectDescription?.() ?? null;
      projectColor = (db as any).getProjectColor?.() ?? null;
    } catch {
      /* db not initialized yet */
    }
    set({ groupData: data, projectName, projectDescription, projectColor });
  },

  // 轻同步：只通知图标内容变了（不触发分组列表/计数/网格重载）
  syncIconContent: () => {
    set({ iconContentVersion: get().iconContentVersion + 1 });
  },

  // 最轻同步：热更新单个图标内容（直接更新 IconBlock，不查 DB 不重载网格）
  patchIconContent: (iconId: string, content: string) => {
    set({ patchedIcons: { ...get().patchedIcons, [iconId]: content } });
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

  syncAll: () => {
    get().syncLeft();
  },

  // File state
  setCurrentFilePath: (path: string | null) => {
    set({ currentFilePath: path });
    setOption({ currentFilePath: path });
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
}));

export default useAppStore;
