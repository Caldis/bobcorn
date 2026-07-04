// ── Pure ViewModel for IconGridLocal ─────────────────────────────────
// Transforms raw icon data into a 1D row stream for virtual rendering.
// No React hooks — fully testable as a pure function.

export interface IconItem {
  id: string;
  iconName: string;
  iconCode: string;
  iconContent: string;
  [key: string]: any;
}

export interface GroupItem {
  id: string;
  groupName: string;
  [key: string]: any;
}

export type VirtualRow =
  | {
      kind: 'header';
      key: string;
      groupId: string;
      groupName: string;
      groupDescription?: string;
      groupIcon?: string;
      count: number;
    }
  | { kind: 'row'; key: string; icons: IconItem[]; startIndex: number };

export interface IconGridViewModel {
  rows: VirtualRow[];
  flatIconIds: string[];
  idToFlatIndex: Map<string, number>;
  idToRowIndex: Map<string, number>;
  totalIconCount: number;
}

// ── Sort (shared logic) ──────────────────────────────────────────────

export type IconSortField = 'createTime' | 'updateTime' | 'iconCode' | 'iconName';
export type IconSortDirection = 'asc' | 'desc';

// iconCode 是 4 位十六进制 Unicode 码点 (如 "E001")，按数值比较而非字符串比较
function hexToNum(code: unknown): number {
  const n = parseInt(String(code ?? ''), 16);
  return Number.isNaN(n) ? 0 : n;
}

function compareIcons(a: IconItem, b: IconItem, field: IconSortField): number {
  if (field === 'iconName') {
    return String(a.iconName ?? '').localeCompare(String(b.iconName ?? ''));
  }
  if (field === 'iconCode') {
    return hexToNum(a.iconCode) - hexToNum(b.iconCode);
  }
  // createTime / updateTime — 固定格式的 ISO 风格日期时间字符串，直接字符串比较即正确
  const av = String(a[field] ?? '');
  const bv = String(b[field] ?? '');
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

function sortIcons(
  icons: IconItem[],
  field: IconSortField,
  direction: IconSortDirection
): IconItem[] {
  const dir = direction === 'desc' ? -1 : 1;
  return icons.slice().sort((a, b) => compareIcons(a, b, field) * dir);
}

// ── Search filter (shared logic) ────────────────────────────────────

function filterIcons(icons: IconItem[], keyword: string | null): IconItem[] {
  if (!keyword) return icons;
  try {
    const re = new RegExp(keyword, 'ig');
    return icons.filter((icon) => {
      re.lastIndex = 0;
      if (re.test(icon.iconName)) return true;
      re.lastIndex = 0;
      return re.test(icon.iconCode);
    });
  } catch {
    const kw = keyword.toLowerCase();
    return icons.filter(
      (icon) => icon.iconName.toLowerCase().includes(kw) || icon.iconCode.toLowerCase().includes(kw)
    );
  }
}

// ── Out-of-range filter (shared logic) ──────────────────────────────
// outOfRangeCodes is keyed by normalized (uppercase) hex code — same cache
// IconBlock uses for the amber "out of range" badge (store.outOfRangeCodes,
// refreshed in syncLeft). Icons already reflect their own group's icons
// (iconData[groupId]), so a straight code lookup is correct per-section too.

function filterOutOfRangeIcons(
  icons: IconItem[],
  outOfRangeCodes: Record<string, true> | undefined,
  enabled: boolean | undefined
): IconItem[] {
  if (!enabled || !outOfRangeCodes) return icons;
  return icons.filter((icon) => !!outOfRangeCodes[String(icon.iconCode ?? '').toUpperCase()]);
}

// ── Chunk icons into rows of N columns ──────────────────────────────

function chunkIntoRows(
  icons: IconItem[],
  columns: number,
  keyPrefix: string,
  startFlatIndex: number
): VirtualRow[] {
  const rows: VirtualRow[] = [];
  for (let i = 0; i < icons.length; i += columns) {
    rows.push({
      kind: 'row',
      key: `${keyPrefix}-r${Math.floor(i / columns)}`,
      icons: icons.slice(i, i + columns),
      startIndex: startFlatIndex + i,
    });
  }
  return rows;
}

// ── Main ViewModel computation ──────────────────────────────────────

export function computeIconGridViewModel(params: {
  iconData: Record<string, IconItem[]>;
  selectedGroup: string;
  searchKeyword: string | null;
  columns: number;
  groupList: GroupItem[];
  sortField?: IconSortField;
  sortDirection?: IconSortDirection;
  /** 越界字码缓存 (归一化大写 hex → true), 来自 store.outOfRangeCodes */
  outOfRangeCodes?: Record<string, true>;
  /** 开启后仅保留字码越界（不在所属分组声明区间内）的图标 */
  filterOutOfRange?: boolean;
}): IconGridViewModel {
  const {
    iconData,
    selectedGroup,
    searchKeyword,
    columns,
    groupList,
    sortField = 'iconCode',
    sortDirection = 'asc',
    outOfRangeCodes,
    filterOutOfRange,
  } = params;
  const cols = Math.max(1, columns);

  const rows: VirtualRow[] = [];
  const flatIconIds: string[] = [];
  const idToFlatIndex = new Map<string, number>();
  const idToRowIndex = new Map<string, number>();

  if (selectedGroup === 'resource-all') {
    // "All" view: uncategorized first, then each group with headers
    const sections: { group: GroupItem; icons: IconItem[] }[] = [];

    const uncatIcons = sortIcons(
      filterOutOfRangeIcons(
        filterIcons(iconData['resource-uncategorized'] || [], searchKeyword),
        outOfRangeCodes,
        filterOutOfRange
      ),
      sortField,
      sortDirection
    );
    if (uncatIcons.length > 0) {
      sections.push({
        group: { id: 'resource-uncategorized', groupName: '\u672A\u5206\u7EC4' },
        icons: uncatIcons,
      });
    }

    for (const g of groupList) {
      const filtered = sortIcons(
        filterOutOfRangeIcons(
          filterIcons(iconData[g.id] || [], searchKeyword),
          outOfRangeCodes,
          filterOutOfRange
        ),
        sortField,
        sortDirection
      );
      if (filtered.length > 0) {
        sections.push({ group: g, icons: filtered });
      }
    }

    for (const { group, icons } of sections) {
      // Header row
      rows.push({
        kind: 'header',
        key: `hdr-${group.id}`,
        groupId: group.id,
        groupName: group.groupName,
        groupDescription: group.groupDescription || undefined,
        groupIcon: group.groupIcon || undefined,
        count: icons.length,
      });

      // Icon rows
      const startFlat = flatIconIds.length;
      const iconRows = chunkIntoRows(icons, cols, group.id, startFlat);
      for (const row of iconRows) {
        const rowIdx = rows.length;
        rows.push(row);
        if (row.kind === 'row') {
          for (const icon of row.icons) {
            const flatIdx = flatIconIds.length;
            flatIconIds.push(icon.id);
            idToFlatIndex.set(icon.id, flatIdx);
            idToRowIndex.set(icon.id, rowIdx);
          }
        }
      }
    }
  } else {
    // Single group view
    const icons = sortIcons(
      filterOutOfRangeIcons(
        filterIcons(iconData[selectedGroup] || [], searchKeyword),
        outOfRangeCodes,
        filterOutOfRange
      ),
      sortField,
      sortDirection
    );
    const iconRows = chunkIntoRows(icons, cols, selectedGroup, 0);
    for (const row of iconRows) {
      const rowIdx = rows.length;
      rows.push(row);
      if (row.kind === 'row') {
        for (const icon of row.icons) {
          const flatIdx = flatIconIds.length;
          flatIconIds.push(icon.id);
          idToFlatIndex.set(icon.id, flatIdx);
          idToRowIndex.set(icon.id, rowIdx);
        }
      }
    }
  }

  return {
    rows,
    flatIconIds,
    idToFlatIndex,
    idToRowIndex,
    totalIconCount: flatIconIds.length,
  };
}
