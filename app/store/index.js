import { create } from 'zustand';
import db from '../database';
import config from '../config';

const useAppStore = create((set, get) => ({
  // UI State
  splashScreenVisible: false,
  contentVisible: 0,
  selectedGroup: config.defaultSelectedGroup,
  selectedIcon: null,
  selectedSource: 'local',
  sideMenuVisible: true,
  sideEditorVisible: true,

  // Data (previously in component local state, synced via events)
  groupData: [],

  // Actions
  showSplashScreen: (show) => set({
    splashScreenVisible: show,
    contentVisible: show ? 0 : 1,
  }),

  selectGroup: (groupId) => {
    set({ selectedGroup: groupId, selectedIcon: null, selectedSource: 'local' });
    // When selecting a group, ensure editor is visible (local mode)
    set({ sideEditorVisible: true });
  },

  selectIcon: (iconId) => {
    set({ selectedIcon: iconId });
  },

  selectSource: (source) => {
    set({ selectedSource: source });
    if (source === 'cloud') set({ sideEditorVisible: false });
    if (source === 'local') set({ sideEditorVisible: true });
  },

  setSideMenuVisible: (visible) => set({ sideMenuVisible: visible }),
  setSideEditorVisible: (visible) => set({ sideEditorVisible: visible }),

  // Sync actions (replace SyncLeft/SyncCenter/SyncRight events)
  syncLeft: () => {
    const data = db.getGroupList();
    set({ groupData: data });
  },

  // Combined sync for operations that affect multiple panels
  syncAll: () => {
    get().syncLeft();
  },
}));

export default useAppStore;
