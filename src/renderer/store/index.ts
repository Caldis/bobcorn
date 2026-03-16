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

  // Data (previously in component local state, synced via events)
  groupData: any[];
}

export interface Actions {
  showSplashScreen: (show: boolean) => void;
  selectGroup: (groupId: string) => void;
  selectIcon: (iconId: string | null) => void;
  selectSource: (source: 'local' | 'cloud') => void;
  setSideMenuVisible: (visible: boolean) => void;
  setSideEditorVisible: (visible: boolean) => void;
  toggleDarkMode: () => void;
  syncLeft: () => void;
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

  // Data (previously in component local state, synced via events)
  groupData: [],

  // Actions
  showSplashScreen: (show: boolean) =>
    set({
      splashScreenVisible: show,
      contentVisible: show ? 0 : 1,
    }),

  selectGroup: (groupId: string) => {
    set({ selectedGroup: groupId, selectedIcon: null, selectedSource: 'local' });
    // When selecting a group, ensure editor is visible (local mode)
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

  // Sync actions (replace SyncLeft/SyncCenter/SyncRight events)
  syncLeft: () => {
    const data = (db as any).getGroupList();
    set({ groupData: data });
  },

  // Combined sync for operations that affect multiple panels
  syncAll: () => {
    get().syncLeft();
  },
}));

export default useAppStore;
