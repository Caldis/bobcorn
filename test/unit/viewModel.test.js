import { describe, it, expect } from 'vitest';
import { computeIconGridViewModel } from '../../src/renderer/components/IconGridLocal/viewModel';

function makeIcons(n, group = 'g1') {
  return Array.from({ length: n }, (_, i) => ({
    id: `${group}-icon-${i}`,
    iconName: `icon_${i}`,
    iconCode: `E${String(i).padStart(3, '0')}`,
    iconContent: `<svg>${i}</svg>`,
  }));
}

const defaultParams = (overrides = {}) => ({
  iconData: {},
  selectedGroup: 'g1',
  searchKeyword: null,
  columns: 4,
  groupList: [],
  ...overrides,
});

describe('computeIconGridViewModel', () => {
  it('returns empty for no icons', () => {
    const vm = computeIconGridViewModel(defaultParams());
    expect(vm.rows).toEqual([]);
    expect(vm.flatIconIds).toEqual([]);
    expect(vm.totalIconCount).toBe(0);
  });

  it('single group with 1 icon', () => {
    const icons = makeIcons(1);
    const vm = computeIconGridViewModel(defaultParams({ iconData: { g1: icons } }));
    expect(vm.rows).toHaveLength(1);
    expect(vm.rows[0].kind).toBe('row');
    expect(vm.rows[0].icons).toHaveLength(1);
    expect(vm.flatIconIds).toEqual(['g1-icon-0']);
    expect(vm.totalIconCount).toBe(1);
  });

  it('chunks into rows based on column count', () => {
    const icons = makeIcons(10);
    const vm = computeIconGridViewModel(defaultParams({ iconData: { g1: icons }, columns: 4 }));
    expect(vm.rows).toHaveLength(3); // 4+4+2
    expect(vm.rows[0].icons).toHaveLength(4);
    expect(vm.rows[1].icons).toHaveLength(4);
    expect(vm.rows[2].icons).toHaveLength(2);
  });

  it('exact column multiple produces full rows', () => {
    const icons = makeIcons(8);
    const vm = computeIconGridViewModel(defaultParams({ iconData: { g1: icons }, columns: 4 }));
    expect(vm.rows).toHaveLength(2);
    expect(vm.rows[0].icons).toHaveLength(4);
    expect(vm.rows[1].icons).toHaveLength(4);
  });

  it('columns=1 produces one icon per row', () => {
    const icons = makeIcons(3);
    const vm = computeIconGridViewModel(defaultParams({ iconData: { g1: icons }, columns: 1 }));
    expect(vm.rows).toHaveLength(3);
    vm.rows.forEach((r) => expect(r.icons).toHaveLength(1));
  });

  it('columns <= 0 clamps to 1', () => {
    const icons = makeIcons(3);
    const vm = computeIconGridViewModel(defaultParams({ iconData: { g1: icons }, columns: 0 }));
    expect(vm.rows).toHaveLength(3);
  });

  it('search filters by name (case-insensitive regex)', () => {
    const icons = [
      { id: 'a', iconName: 'Arrow', iconCode: 'E001', iconContent: '' },
      { id: 'b', iconName: 'Button', iconCode: 'E002', iconContent: '' },
      { id: 'c', iconName: 'arrow-left', iconCode: 'E003', iconContent: '' },
    ];
    const vm = computeIconGridViewModel(
      defaultParams({ iconData: { g1: icons }, searchKeyword: 'arrow' })
    );
    expect(vm.flatIconIds).toEqual(['a', 'c']);
  });

  it('search filters by code', () => {
    const icons = [
      { id: 'a', iconName: 'foo', iconCode: 'E001', iconContent: '' },
      { id: 'b', iconName: 'bar', iconCode: 'E999', iconContent: '' },
    ];
    const vm = computeIconGridViewModel(
      defaultParams({ iconData: { g1: icons }, searchKeyword: '999' })
    );
    expect(vm.flatIconIds).toEqual(['b']);
  });

  it('invalid regex falls back to includes', () => {
    const icons = [
      { id: 'a', iconName: 'test[1]', iconCode: 'E001', iconContent: '' },
      { id: 'b', iconName: 'test2', iconCode: 'E002', iconContent: '' },
    ];
    const vm = computeIconGridViewModel(
      defaultParams({ iconData: { g1: icons }, searchKeyword: 'test[1' })
    );
    expect(vm.flatIconIds).toEqual(['a']);
  });

  it('search with empty result', () => {
    const icons = makeIcons(5);
    const vm = computeIconGridViewModel(
      defaultParams({ iconData: { g1: icons }, searchKeyword: 'zzzznotfound' })
    );
    expect(vm.rows).toEqual([]);
    expect(vm.totalIconCount).toBe(0);
  });

  // ── resource-all view ───────────────────────────────────────────────

  it('resource-all: multiple groups with headers', () => {
    const g1Icons = makeIcons(3, 'g1');
    const g2Icons = makeIcons(2, 'g2');
    const vm = computeIconGridViewModel(
      defaultParams({
        selectedGroup: 'resource-all',
        iconData: { g1: g1Icons, g2: g2Icons },
        groupList: [
          { id: 'g1', groupName: 'Group 1' },
          { id: 'g2', groupName: 'Group 2' },
        ],
        columns: 3,
      })
    );
    // header + 1 row for g1, header + 1 row for g2
    expect(vm.rows).toHaveLength(4);
    expect(vm.rows[0]).toMatchObject({ kind: 'header', groupId: 'g1', count: 3 });
    expect(vm.rows[1]).toMatchObject({ kind: 'row' });
    expect(vm.rows[1].icons).toHaveLength(3);
    expect(vm.rows[2]).toMatchObject({ kind: 'header', groupId: 'g2', count: 2 });
    expect(vm.rows[3].icons).toHaveLength(2);
    expect(vm.totalIconCount).toBe(5);
  });

  it('resource-all: empty groups are filtered out', () => {
    const g1Icons = makeIcons(2, 'g1');
    const vm = computeIconGridViewModel(
      defaultParams({
        selectedGroup: 'resource-all',
        iconData: { g1: g1Icons, g2: [] },
        groupList: [
          { id: 'g1', groupName: 'Group 1' },
          { id: 'g2', groupName: 'Empty' },
        ],
        columns: 4,
      })
    );
    expect(vm.rows).toHaveLength(2); // header + 1 row for g1 only
  });

  it('resource-all: uncategorized shown first', () => {
    const uncatIcons = makeIcons(2, 'uncat');
    const g1Icons = makeIcons(1, 'g1');
    const vm = computeIconGridViewModel(
      defaultParams({
        selectedGroup: 'resource-all',
        iconData: { 'resource-uncategorized': uncatIcons, g1: g1Icons },
        groupList: [{ id: 'g1', groupName: 'Group 1' }],
        columns: 4,
      })
    );
    expect(vm.rows[0]).toMatchObject({ kind: 'header', groupId: 'resource-uncategorized' });
  });

  it('resource-all + search: groups with zero results disappear', () => {
    const g1Icons = [{ id: 'a', iconName: 'arrow', iconCode: 'E001', iconContent: '' }];
    const g2Icons = [{ id: 'b', iconName: 'button', iconCode: 'E002', iconContent: '' }];
    const vm = computeIconGridViewModel(
      defaultParams({
        selectedGroup: 'resource-all',
        iconData: { g1: g1Icons, g2: g2Icons },
        groupList: [
          { id: 'g1', groupName: 'G1' },
          { id: 'g2', groupName: 'G2' },
        ],
        searchKeyword: 'arrow',
        columns: 4,
      })
    );
    expect(vm.rows).toHaveLength(2); // header + row for g1 only
    expect(vm.rows[0]).toMatchObject({ kind: 'header', groupId: 'g1' });
  });

  // ── idToFlatIndex / idToRowIndex correctness ────────────────────────

  it('idToFlatIndex maps first/middle/last correctly', () => {
    const icons = makeIcons(10);
    const vm = computeIconGridViewModel(defaultParams({ iconData: { g1: icons }, columns: 4 }));
    expect(vm.idToFlatIndex.get('g1-icon-0')).toBe(0);
    expect(vm.idToFlatIndex.get('g1-icon-5')).toBe(5);
    expect(vm.idToFlatIndex.get('g1-icon-9')).toBe(9);
  });

  it('idToRowIndex maps icons to correct row indices', () => {
    const icons = makeIcons(10);
    const vm = computeIconGridViewModel(defaultParams({ iconData: { g1: icons }, columns: 4 }));
    // Row 0: icons 0-3, Row 1: icons 4-7, Row 2: icons 8-9
    expect(vm.idToRowIndex.get('g1-icon-0')).toBe(0);
    expect(vm.idToRowIndex.get('g1-icon-3')).toBe(0);
    expect(vm.idToRowIndex.get('g1-icon-4')).toBe(1);
    expect(vm.idToRowIndex.get('g1-icon-9')).toBe(2);
  });

  it('idToFlatIndex across groups in resource-all', () => {
    const g1Icons = makeIcons(3, 'g1');
    const g2Icons = makeIcons(2, 'g2');
    const vm = computeIconGridViewModel(
      defaultParams({
        selectedGroup: 'resource-all',
        iconData: { g1: g1Icons, g2: g2Icons },
        groupList: [
          { id: 'g1', groupName: 'G1' },
          { id: 'g2', groupName: 'G2' },
        ],
        columns: 10,
      })
    );
    expect(vm.idToFlatIndex.get('g1-icon-0')).toBe(0);
    expect(vm.idToFlatIndex.get('g1-icon-2')).toBe(2);
    expect(vm.idToFlatIndex.get('g2-icon-0')).toBe(3);
    expect(vm.idToFlatIndex.get('g2-icon-1')).toBe(4);
  });

  // ── Stability ───────────────────────────────────────────────────────

  it('same input produces identical flatIconIds ordering', () => {
    const icons = makeIcons(20);
    const params = defaultParams({ iconData: { g1: icons }, columns: 5 });
    const vm1 = computeIconGridViewModel(params);
    const vm2 = computeIconGridViewModel(params);
    expect(vm1.flatIconIds).toEqual(vm2.flatIconIds);
  });
});
