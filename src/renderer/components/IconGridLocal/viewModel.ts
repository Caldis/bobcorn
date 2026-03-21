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
  | { kind: 'header'; key: string; groupId: string; groupName: string; count: number }
  | { kind: 'row'; key: string; icons: IconItem[]; startIndex: number };

export interface IconGridViewModel {
  rows: VirtualRow[];
  flatIconIds: string[];
  idToFlatIndex: Map<string, number>;
  idToRowIndex: Map<string, number>;
  totalIconCount: number;
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
}): IconGridViewModel {
  const { iconData, selectedGroup, searchKeyword, columns, groupList } = params;
  const cols = Math.max(1, columns);

  const rows: VirtualRow[] = [];
  const flatIconIds: string[] = [];
  const idToFlatIndex = new Map<string, number>();
  const idToRowIndex = new Map<string, number>();

  if (selectedGroup === 'resource-all') {
    // "All" view: uncategorized first, then each group with headers
    const sections: { group: GroupItem; icons: IconItem[] }[] = [];

    const uncatIcons = filterIcons(iconData['resource-uncategorized'] || [], searchKeyword);
    if (uncatIcons.length > 0) {
      sections.push({
        group: { id: 'resource-uncategorized', groupName: '\u672A\u5206\u7EC4' },
        icons: uncatIcons,
      });
    }

    for (const g of groupList) {
      const filtered = filterIcons(iconData[g.id] || [], searchKeyword);
      if (filtered.length > 0) {
        sections.push({ group: g, icons: filtered });
      }
    }

    for (const { group, icons } of sections) {
      // Header row
      const headerRowIndex = rows.length;
      rows.push({
        kind: 'header',
        key: `hdr-${group.id}`,
        groupId: group.id,
        groupName: group.groupName,
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
    const icons = filterIcons(iconData[selectedGroup] || [], searchKeyword);
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
