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
  getOption: vi.fn(() => ({})),
  setOption: vi.fn(),
}));

// Import store after mocks are set up
const { default: useAppStore } = await import('../../src/renderer/store/index');

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
    darkMode: false,
    selectedIcons: new Set(),
    batchMode: false,
    lastClickedIconId: null,
    iconContentVersion: 0,
    patchedIcons: {},
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

  // ── batch selection ─────────────────────────────────────────────
  describe('batch selection', () => {
    it('selectAllIcons enters batch mode and tracks the last selected id', () => {
      useAppStore.getState().selectAllIcons(['a', 'b', 'c']);
      const state = useAppStore.getState();

      expect([...state.selectedIcons]).toEqual(['a', 'b', 'c']);
      expect(state.batchMode).toBe(true);
      expect(state.lastClickedIconId).toBe('c');
    });

    it('selectAllIcons with an empty list clears batch mode and last clicked id', () => {
      useAppStore.setState({
        selectedIcons: new Set(['x']),
        batchMode: true,
        lastClickedIconId: 'x',
      });

      useAppStore.getState().selectAllIcons([]);
      const state = useAppStore.getState();

      expect([...state.selectedIcons]).toEqual([]);
      expect(state.batchMode).toBe(false);
      expect(state.lastClickedIconId).toBeNull();
    });

    it('invertSelection keeps batch mode enabled when icons remain selected', () => {
      useAppStore.setState({
        selectedIcons: new Set(['b']),
        batchMode: true,
        lastClickedIconId: 'b',
      });

      useAppStore.getState().invertSelection(['a', 'b', 'c']);
      const state = useAppStore.getState();

      expect([...state.selectedIcons]).toEqual(['a', 'c']);
      expect(state.batchMode).toBe(true);
      expect(state.lastClickedIconId).toBeNull();
    });

    it('invertSelection exits batch mode when the result is empty', () => {
      useAppStore.setState({
        selectedIcons: new Set(['a', 'b']),
        batchMode: true,
        lastClickedIconId: 'b',
      });

      useAppStore.getState().invertSelection(['a', 'b']);
      const state = useAppStore.getState();

      expect([...state.selectedIcons]).toEqual([]);
      expect(state.batchMode).toBe(false);
      expect(state.lastClickedIconId).toBeNull();
    });

    // ── toggleIconSelection carry-over ────────────────────────────
    it('toggleIconSelection carries over selectedIcon on first Ctrl+click', () => {
      // Simulate: user clicked icon A (single-select), then Ctrl+clicks icon B
      useAppStore.setState({ selectedIcon: 'a', selectedIcons: new Set(), batchMode: false });

      useAppStore.getState().toggleIconSelection('b');
      const state = useAppStore.getState();

      expect([...state.selectedIcons]).toEqual(expect.arrayContaining(['a', 'b']));
      expect(state.selectedIcons.size).toBe(2);
      expect(state.batchMode).toBe(true);
      // Single-select cleared to unify visual state
      expect(state.selectedIcon).toBeNull();
    });

    it('toggleIconSelection on same icon as selectedIcon enters then exits batch', () => {
      // Simulate: user clicked icon A, then Ctrl+clicks A again → deselect
      useAppStore.setState({ selectedIcon: 'a', selectedIcons: new Set(), batchMode: false });

      useAppStore.getState().toggleIconSelection('a');
      const state = useAppStore.getState();

      // A was carried over, then toggled off → empty
      expect(state.selectedIcons.size).toBe(0);
      expect(state.batchMode).toBe(false);
    });

    it('toggleIconSelection without selectedIcon does not carry over', () => {
      useAppStore.setState({ selectedIcon: null, selectedIcons: new Set(), batchMode: false });

      useAppStore.getState().toggleIconSelection('x');
      const state = useAppStore.getState();

      expect([...state.selectedIcons]).toEqual(['x']);
      expect(state.batchMode).toBe(true);
    });

    it('toggleIconSelection in existing batch mode does not carry over again', () => {
      // Already in batch with {a, b}, Ctrl+click c
      useAppStore.setState({ selectedIcon: null, selectedIcons: new Set(['a', 'b']), batchMode: true });

      useAppStore.getState().toggleIconSelection('c');
      const state = useAppStore.getState();

      expect([...state.selectedIcons]).toEqual(expect.arrayContaining(['a', 'b', 'c']));
      expect(state.selectedIcons.size).toBe(3);
    });

    // ── setIconSelection clears selectedIcon ──────────────────────
    it('setIconSelection clears selectedIcon when entering batch', () => {
      useAppStore.setState({ selectedIcon: 'a', selectedIcons: new Set(), batchMode: false });

      useAppStore.getState().setIconSelection(['b', 'c', 'd']);
      const state = useAppStore.getState();

      expect([...state.selectedIcons]).toEqual(['b', 'c', 'd']);
      expect(state.batchMode).toBe(true);
      expect(state.selectedIcon).toBeNull();
    });
  });
});
