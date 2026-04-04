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
}

export interface SideMenuProps {
  handleGroupSelected: (groupId: string) => void;
  selectedGroup: string;
}
