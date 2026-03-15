import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database module before importing store
vi.mock('../../src/renderer/database', () => ({
  default: {
    getGroupList: vi.fn(() => []),
  },
}));

// Mock the config module before importing store
vi.mock('../../src/renderer/config', () => ({
  default: {
    defaultSelectedGroup: 'resource-all',
  },
}));

// Import store after mocks are set up
const { default: useAppStore } = await import('../../src/renderer/store/index.js');

/** Helper: reset the store to its initial state before each test */
function resetStore() {
  useAppStore.setState({
    splashScreenVisible: false,
    contentVisible: 0,
    selectedGroup: 'resource-all',
    selectedIcon: null,
    selectedSource: 'local',
    sideMenuVisible: true,
    sideEditorVisible: true,
    groupData: [],
  });
}

describe('useAppStore', () => {
  beforeEach(() => {
    resetStore();
  });

  // ── showSplashScreen ────────────────────────────────────────────
  describe('showSplashScreen', () => {
    it('sets splashScreenVisible=true and contentVisible=0 when show=true', () => {
      useAppStore.getState().showSplashScreen(true);
      const state = useAppStore.getState();
      expect(state.splashScreenVisible).toBe(true);
      expect(state.contentVisible).toBe(0);
    });

    it('sets splashScreenVisible=false and contentVisible=1 when show=false', () => {
      // First show, then hide
      useAppStore.getState().showSplashScreen(true);
      useAppStore.getState().showSplashScreen(false);
      const state = useAppStore.getState();
      expect(state.splashScreenVisible).toBe(false);
      expect(state.contentVisible).toBe(1);
    });
  });

  // ── selectGroup ─────────────────────────────────────────────────
  describe('selectGroup', () => {
    it('updates selectedGroup to given id', () => {
      useAppStore.getState().selectGroup('my-group');
      expect(useAppStore.getState().selectedGroup).toBe('my-group');
    });

    it('clears selectedIcon when selecting a group', () => {
      useAppStore.getState().selectIcon('icon-42');
      useAppStore.getState().selectGroup('my-group');
      expect(useAppStore.getState().selectedIcon).toBeNull();
    });

    it('resets selectedSource to local', () => {
      useAppStore.getState().selectSource('cloud');
      useAppStore.getState().selectGroup('my-group');
      expect(useAppStore.getState().selectedSource).toBe('local');
    });

    it('sets sideEditorVisible to true', () => {
      useAppStore.setState({ sideEditorVisible: false });
      useAppStore.getState().selectGroup('my-group');
      expect(useAppStore.getState().sideEditorVisible).toBe(true);
    });
  });

  // ── selectSource ────────────────────────────────────────────────
  describe('selectSource', () => {
    it('hides side editor when source is cloud', () => {
      useAppStore.getState().selectSource('cloud');
      const state = useAppStore.getState();
      expect(state.selectedSource).toBe('cloud');
      expect(state.sideEditorVisible).toBe(false);
    });

    it('shows side editor when source is local', () => {
      // Start from cloud (editor hidden)
      useAppStore.getState().selectSource('cloud');
      useAppStore.getState().selectSource('local');
      const state = useAppStore.getState();
      expect(state.selectedSource).toBe('local');
      expect(state.sideEditorVisible).toBe(true);
    });
  });

  // ── selectIcon ──────────────────────────────────────────────────
  describe('selectIcon', () => {
    it('updates selectedIcon', () => {
      useAppStore.getState().selectIcon('icon-7');
      expect(useAppStore.getState().selectedIcon).toBe('icon-7');
    });

    it('can set selectedIcon to null', () => {
      useAppStore.getState().selectIcon('icon-7');
      useAppStore.getState().selectIcon(null);
      expect(useAppStore.getState().selectedIcon).toBeNull();
    });
  });

  // ── setSideMenuVisible ──────────────────────────────────────────
  describe('setSideMenuVisible', () => {
    it('sets sideMenuVisible to false', () => {
      useAppStore.getState().setSideMenuVisible(false);
      expect(useAppStore.getState().sideMenuVisible).toBe(false);
    });

    it('sets sideMenuVisible to true', () => {
      useAppStore.getState().setSideMenuVisible(false);
      useAppStore.getState().setSideMenuVisible(true);
      expect(useAppStore.getState().sideMenuVisible).toBe(true);
    });
  });

  // ── setSideEditorVisible ────────────────────────────────────────
  describe('setSideEditorVisible', () => {
    it('sets sideEditorVisible to false', () => {
      useAppStore.getState().setSideEditorVisible(false);
      expect(useAppStore.getState().sideEditorVisible).toBe(false);
    });

    it('sets sideEditorVisible to true', () => {
      useAppStore.getState().setSideEditorVisible(false);
      useAppStore.getState().setSideEditorVisible(true);
      expect(useAppStore.getState().sideEditorVisible).toBe(true);
    });
  });
});
