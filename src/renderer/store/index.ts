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

  // Data
  groupData: any[];
  // 图标内容版本号 — 递增触发 SideEditor/IconBlock 刷新，不触发分组重建
  iconContentVersion: number;
}

export interface Actions {
  showSplashScreen: (show: boolean) => void;
  selectGroup: (groupId: string) => void;
  selectIcon: (iconId: string | null) => void;
  selectSource: (source: 'local' | 'cloud') => void;
  setSideMenuVisible: (visible: boolean) => void;
  setSideEditorVisible: (visible: boolean) => void;
  toggleDarkMode: () => void;
  // 分级同步
  syncLeft: () => void; // 重：刷新分组列表 + 图标网格（增删/移动图标/增删分组时用）
  syncIconContent: () => void; // 轻：只递增版本号，触发 SideEditor 刷新（改名/改码/改色时用）
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

  // Data
  groupData: [],
  iconContentVersion: 0,

  // Actions
  showSplashScreen: (show: boolean) =>
    set({
      splashScreenVisible: show,
      contentVisible: show ? 0 : 1,
    }),

  selectGroup: (groupId: string) => {
    set({ selectedGroup: groupId, selectedIcon: null, selectedSource: 'local' });
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

  // 重同步：刷新分组列表（触发 ResourceNav 计数 + GroupList 计数 + IconGridLocal 重载）
  syncLeft: () => {
    const data = (db as any).getGroupList();
    set({ groupData: data });
  },

  // 轻同步：只通知图标内容变了（不触发分组列表/计数/网格重载）
  syncIconContent: () => {
    set({ iconContentVersion: get().iconContentVersion + 1 });
  },

  syncAll: () => {
    get().syncLeft();
  },
}));

export default useAppStore;
