import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted mocks — shared between the database / @core/commands module factories
// and the assertions below (vi.mock factories are hoisted above const declarations)
const h = vi.hoisted(() => {
  const coreDb = { getIcon: vi.fn(() => null) };
  return {
    coreDb,
    getCoreDb: vi.fn(() => coreDb),
    notifyExternalMutation: vi.fn(),
    currentCodeMode: vi.fn(() => 'append'),
    db: {
      getGroupList: vi.fn(() => []),
      getAllVariantCounts: vi.fn(() => new Map()),
    },
    commands: {
      planMoveIcons: vi.fn(),
      moveIcons: vi.fn(),
      copyIcons: vi.fn(),
      deleteIcons: vi.fn(),
      rangeViolations: vi.fn(() => []),
    },
  };
});

// Mock the database module before importing store
vi.mock('../../src/renderer/database', () => ({
  default: h.db,
  getCoreDb: h.getCoreDb,
  notifyExternalMutation: h.notifyExternalMutation,
  currentCodeMode: h.currentCodeMode,
}));

// Mock the core command bodies — batch actions must delegate to these
vi.mock('@core/commands', () => h.commands);

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
    isDirty: false,
    currentFilePath: null,
  });
}

describe('useAppStore', () => {
  beforeEach(() => {
    resetStore();
  });

  // ── showSplashScreen ────────────────────────────────────────────
  describe('showSplashScreen', () => {
    it('sets splashScreenVisible=true when show=true', () => {
      useAppStore.getState().showSplashScreen(true);
      const state = useAppStore.getState();
      expect(state.splashScreenVisible).toBe(true);
    });

    it('sets splashScreenVisible=false when show=false', () => {
      useAppStore.getState().showSplashScreen(true);
      useAppStore.getState().showSplashScreen(false);
      const state = useAppStore.getState();
      expect(state.splashScreenVisible).toBe(false);
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

  // ── batch operation actions (Stage C 薄编排层) ──────────────────
  describe('batch operation actions', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // clearAllMocks 清 calls 也清 mockReturnValue 之外的实现? 不 — 只清调用记录;
      // 但为稳妥, 恢复默认返回值
      h.getCoreDb.mockReturnValue(h.coreDb);
      h.currentCodeMode.mockReturnValue('append');
      h.commands.rangeViolations.mockReturnValue([]);
      h.db.getGroupList.mockReturnValue([]);
      h.db.getAllVariantCounts.mockReturnValue(new Map());
    });

    it('planMove delegates to commands.planMoveIcons read-only (no dirty, no refresh)', () => {
      const plan = { targetGroupId: 'g1', variantCount: 2, outOfRange: null };
      h.commands.planMoveIcons.mockReturnValue(plan);

      const result = useAppStore.getState().planMove(['a', 'b'], 'g1');

      expect(h.commands.planMoveIcons).toHaveBeenCalledWith(h.coreDb, ['a', 'b'], 'g1');
      expect(result).toBe(plan);
      expect(h.notifyExternalMutation).not.toHaveBeenCalled();
      expect(h.db.getGroupList).not.toHaveBeenCalled(); // no syncLeft
    });

    it('moveIconsTo calls commands.moveIcons with codeMode + reassign opt, marks dirty and refreshes', () => {
      const outcome = { moved: 2, reassigned: [{ id: 'a', oldCode: 'E001', newCode: 'F001' }], warnings: [] };
      h.commands.moveIcons.mockReturnValue(outcome);
      h.currentCodeMode.mockReturnValue('fill');

      const result = useAppStore
        .getState()
        .moveIconsTo(['a', 'b'], 'g1', { reassignOutOfRange: true });

      expect(h.commands.moveIcons).toHaveBeenCalledWith(h.coreDb, ['a', 'b'], 'g1', {
        reassignOutOfRange: true,
        codeMode: 'fill',
      });
      expect(result).toBe(outcome);
      expect(h.notifyExternalMutation).toHaveBeenCalledTimes(1);
      expect(h.notifyExternalMutation).toHaveBeenCalledWith(); // 不改 iconContent — 无内容失效 ids
      // syncLeft 刷新集合被触发 (含 refreshOutOfRangeCodes → rangeViolations)
      expect(h.db.getGroupList).toHaveBeenCalled();
      expect(h.commands.rangeViolations).toHaveBeenCalled();
    });

    it('moveIconsTo still marks dirty when the command throws (move already persisted)', () => {
      h.commands.moveIcons.mockImplementation(() => {
        throw new Error('GROUP_RANGE_EXHAUSTED: no free code points');
      });

      expect(() => useAppStore.getState().moveIconsTo(['a'], 'g1')).toThrow(
        'GROUP_RANGE_EXHAUSTED'
      );
      expect(h.notifyExternalMutation).toHaveBeenCalledTimes(1);
      expect(h.db.getGroupList).not.toHaveBeenCalled(); // 错误路径不刷新 (对齐原 callback 语义)
    });

    it('copyIconsTo passes codeMode, marks dirty only when something was copied', () => {
      const outcome = { copied: 2, failed: 0, icons: [], warnings: [], stopError: null };
      h.commands.copyIcons.mockReturnValue(outcome);

      const result = useAppStore.getState().copyIconsTo(['a', 'b'], 'g2');

      expect(h.commands.copyIcons).toHaveBeenCalledWith(h.coreDb, ['a', 'b'], 'g2', {
        codeMode: 'append',
      });
      expect(result).toBe(outcome);
      expect(h.notifyExternalMutation).toHaveBeenCalledTimes(1);
      expect(h.db.getGroupList).toHaveBeenCalled();
    });

    it('copyIconsTo does NOT mark dirty when nothing was copied, but still refreshes', () => {
      const outcome = { copied: 0, failed: 2, icons: [], warnings: [], stopError: new Error('PUA_EXHAUSTED') };
      h.commands.copyIcons.mockReturnValue(outcome);

      const result = useAppStore.getState().copyIconsTo(['a', 'b'], 'g2');

      expect(result).toBe(outcome);
      expect(h.notifyExternalMutation).not.toHaveBeenCalled();
      expect(h.db.getGroupList).toHaveBeenCalled(); // 原 callback 恒执行 → syncLeft 恒刷新
    });

    it('recycleIconsAction maps to deleteIcons mode=recycle, marks dirty and refreshes variant counts', () => {
      const outcome = { deleted: 2, ids: ['a', 'b'], warnings: [{ type: 'variant-follow', count: 3 }] };
      h.commands.deleteIcons.mockReturnValue(outcome);

      const result = useAppStore.getState().recycleIconsAction(['a', 'b']);

      expect(h.commands.deleteIcons).toHaveBeenCalledWith(h.coreDb, ['a', 'b'], 'recycle');
      expect(result).toBe(outcome);
      expect(h.notifyExternalMutation).toHaveBeenCalledTimes(1);
      expect(h.db.getGroupList).toHaveBeenCalled();
      expect(h.db.getAllVariantCounts).toHaveBeenCalled();
    });

    it('deleteIconsPermanently maps to deleteIcons mode=permanent', () => {
      const outcome = { deleted: 1, ids: ['a'], warnings: [{ type: 'variant-cascade-delete', count: 2 }] };
      h.commands.deleteIcons.mockReturnValue(outcome);

      const result = useAppStore.getState().deleteIconsPermanently(['a']);

      expect(h.commands.deleteIcons).toHaveBeenCalledWith(h.coreDb, ['a'], 'permanent');
      expect(result).toBe(outcome);
      expect(h.notifyExternalMutation).toHaveBeenCalledTimes(1);
      expect(h.db.getAllVariantCounts).toHaveBeenCalled();
    });
  });

  // ── refreshOutOfRangeCodes (rangeViolations 委托 + 原口径过滤) ───
  describe('refreshOutOfRangeCodes', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      h.getCoreDb.mockReturnValue(h.coreDb);
    });

    it('marks normalized hex codes from rangeViolations, keeping the legacy scope', () => {
      h.commands.rangeViolations.mockReturnValue([
        // 合法越界父图标 — 计入 (归一化大写)
        { iconId: 'p1', iconName: 'a', code: '00e9', groupId: 'g', groupName: 'G', range: { start: 1, end: 2 } },
        // 变体行 — command 计入但原口径排除
        { iconId: 'v1', iconName: 'b', code: 'F0F0', groupId: 'g', groupName: 'G', range: { start: 1, end: 2 } },
        // 非 4 位 hex 的非法字码 — 原口径排除
        { iconId: 'p2', iconName: 'c', code: '12G4', groupId: 'g', groupName: 'G', range: { start: 1, end: 2 } },
      ]);
      h.coreDb.getIcon.mockImplementation((id) =>
        id === 'v1' ? { id, variantOf: 'p1' } : { id, variantOf: null }
      );

      useAppStore.getState().refreshOutOfRangeCodes();

      expect(useAppStore.getState().outOfRangeCodes).toEqual({ '00E9': true });
    });

    it('resets to empty when rangeViolations throws', () => {
      useAppStore.setState({ outOfRangeCodes: { AAAA: true } });
      h.commands.rangeViolations.mockImplementation(() => {
        throw new Error('boom');
      });

      useAppStore.getState().refreshOutOfRangeCodes();

      expect(useAppStore.getState().outOfRangeCodes).toEqual({});
    });
  });

  // ── refreshVariantCounts (静态 import, 无动态 require) ───────────
  describe('refreshVariantCounts', () => {
    it('converts the Map from getAllVariantCounts into a plain object', () => {
      h.db.getAllVariantCounts.mockReturnValue(
        new Map([
          ['a', 2],
          ['b', 1],
        ])
      );

      useAppStore.getState().refreshVariantCounts();

      expect(useAppStore.getState().variantCounts).toEqual({ a: 2, b: 1 });
    });
  });
});
