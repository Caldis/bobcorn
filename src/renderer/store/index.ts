import { create } from 'zustand';
import db from '../database';
import config, { getOption, setOption } from '../config';

// ── Types ─────────────────────────────────────────────────────────

export interface State {
  // UI State
  splashScreenVisible: boolean;
  contentVisible: number;
  selectedGroup: string;
  selectedIcon: string | null;
  selectedSource: 'local' | 'cloud';
  sideMenuVisible: boolean;
  sideEditorVisible: boolean;
  darkMode: boolean;

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
}

export interface Actions {
  showSplashScreen: (show: boolean) => void;
  selectGroup: (groupId: string) => void;
  selectIcon: (iconId: string | null) => void;
  selectSource: (source: 'local' | 'cloud') => void;
  setSideMenuVisible: (visible: boolean) => void;
  setSideEditorVisible: (visible: boolean) => void;
  toggleDarkMode: () => void;
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
  syncAll: () => void;
}

const useAppStore = create<State & Actions>((set, get) => ({
  // UI State
  splashScreenVisible: false,
  contentVisible: 0,
  selectedGroup: config.defaultSelectedGroup,
  selectedIcon: null,
  selectedSource: 'local',
  sideMenuVisible: true,
  sideEditorVisible: true,
  darkMode: false,

  // Batch selection
  selectedIcons: new Set<string>(),
  batchMode: false,
  lastClickedIconId: null,

  // Data
  groupData: [],
  iconContentVersion: 0,
  patchedIcons: {},

  // Actions
  showSplashScreen: (show: boolean) =>
    set({
      splashScreenVisible: show,
      contentVisible: show ? 0 : 1,
    }),

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

  toggleDarkMode: () => {
    const next = !get().darkMode;
    set({ darkMode: next });
    setOption({ darkMode: next });
    document.documentElement.classList.toggle('dark', next);
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

  // 重同步：刷新分组列表（触发 ResourceNav 计数 + GroupList 计数 + IconGridLocal 重载）
  syncLeft: () => {
    const data = (db as any).getGroupList();
    set({ groupData: data });
  },

  // 轻同步：只通知图标内容变了（不触发分组列表/计数/网格重载）
  syncIconContent: () => {
    set({ iconContentVersion: get().iconContentVersion + 1 });
  },

  // 最轻同步：热更新单个图标内容（直接更新 IconBlock，不查 DB 不重载网格）
  patchIconContent: (iconId: string, content: string) => {
    set({ patchedIcons: { ...get().patchedIcons, [iconId]: content } });
  },

  syncAll: () => {
    get().syncLeft();
  },
}));

export default useAppStore;
