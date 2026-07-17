export interface GroupData {
  id: string;
  groupName: string;
  groupOrder?: number;
  groupColor?: string;
  groupDescription?: string;
  groupIcon?: string;
  [key: string]: any;
}

export interface ExportGroupOption {
  label: string;
  value: string;
  /** 分组内可导出的图标数 (回收站与变体不计入); 0 时该分组不可勾选 */
  count: number;
}

export interface SideMenuProps {
  handleGroupSelected: (groupId: string) => void;
  selectedGroup: string;
}
