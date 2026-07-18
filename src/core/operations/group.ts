/**
 * Core group operations — list, add, rename, delete groups.
 *
 * Environment-agnostic: no browser globals or build-time env vars.
 * All file I/O goes through IoAdapter.
 */
import type { IoAdapter } from '../io';
import type { GroupData } from '../types';
import { openProject, saveProject } from '../database';
import { PUA_MIN, PUA_MAX } from '../code-allocation';
import {
  rangeViolations as rangeViolationsCommand,
  validateGroupCodeRange as validateGroupCodeRangeCommand,
} from '../commands';
import { generateUUID } from '../uuid';

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List all groups in a project with their icon counts.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @returns Array of group data records
 */
export async function listGroups(io: IoAdapter, projectPath: string): Promise<GroupData[]> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    return db.getGroupList();
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

export interface AddGroupResult {
  id: string;
  groupName: string;
  groupOrder: number;
}

/**
 * Create a new group in the project.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param name - Group name
 */
export async function addGroup(
  io: IoAdapter,
  projectPath: string,
  name: string
): Promise<AddGroupResult> {
  // 名称落库前 trim — GUI 与 CLI 同口径, 拒绝纯空白名
  const finalName = name.trim();
  if (!finalName) {
    throw new Error('Group name cannot be empty');
  }
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    // Check for duplicate group name
    const existing = db.findGroupByName(finalName);
    if (existing) {
      throw new Error(`Group already exists: ${finalName}`);
    }

    const id = generateUUID();
    const result = db.addGroup(id, finalName);
    await saveProject(io, resolvedPath, db);

    return result;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

export interface RenameGroupResult {
  id: string;
  oldName: string;
  newName: string;
}

/**
 * Rename an existing group.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param oldName - Current group name
 * @param newName - New group name
 */
export async function renameGroup(
  io: IoAdapter,
  projectPath: string,
  oldName: string,
  newName: string
): Promise<RenameGroupResult> {
  // 名称落库前 trim — GUI 与 CLI 同口径, 拒绝纯空白名
  const finalName = newName.trim();
  if (!finalName) {
    throw new Error('Group name cannot be empty');
  }
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const group = db.findGroupByName(oldName);
    if (!group) {
      throw new Error(`Group not found: ${oldName}`);
    }

    const id = group.id as string;
    db.setGroupName(id, finalName);
    await saveProject(io, resolvedPath, db);

    return { id, oldName, newName: finalName };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export interface DeleteGroupResult {
  id: string;
  name: string;
  iconsMovedToUncategorized: number;
}

/**
 * Delete a group. Icons in the group are moved to "uncategorized".
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param name - Group name to delete
 */
export async function deleteGroup(
  io: IoAdapter,
  projectPath: string,
  name: string
): Promise<DeleteGroupResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const group = db.findGroupByName(name);
    if (!group) {
      throw new Error(`Group not found: ${name}`);
    }

    const id = group.id as string;
    const iconCount = db.getIconCountForGroup(id);

    db.deleteGroup(id);
    await saveProject(io, resolvedPath, db);

    return { id, name, iconsMovedToUncategorized: iconCount };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------

export interface ReorderGroupsResult {
  reordered: number;
  order: string[];
}

/**
 * Reorder groups by setting groupOrder for each group based on the order of names provided.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param names - Group names in desired order
 */
export async function reorderGroups(
  io: IoAdapter,
  projectPath: string,
  names: string[]
): Promise<ReorderGroupsResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    for (let i = 0; i < names.length; i++) {
      const group = db.findGroupByName(names[i]);
      if (!group) {
        throw new Error(`Group not found: ${names[i]}`);
      }
      db.setGroupOrder(group.id as string, i);
    }

    await saveProject(io, resolvedPath, db);

    return { reordered: names.length, order: names };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Set Description
// ---------------------------------------------------------------------------

export interface SetDescriptionResult {
  id: string;
  groupName: string;
  description: string;
}

/**
 * Set a text description for a group.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param name - Group name
 * @param description - New description text
 */
export async function setGroupDescription(
  io: IoAdapter,
  projectPath: string,
  name: string,
  description: string
): Promise<SetDescriptionResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const group = db.findGroupByName(name);
    if (!group) {
      throw new Error(`Group not found: ${name}`);
    }

    const id = group.id as string;
    db.setGroupDescription(id, description);
    await saveProject(io, resolvedPath, db);

    return { id, groupName: name, description };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Set / clear code range
// ---------------------------------------------------------------------------

export interface SetCodeRangeResult {
  id: string;
  groupName: string;
  /** Decimal code points, or null when cleared. */
  codeRangeStart: number | null;
  codeRangeEnd: number | null;
  cleared: boolean;
}

/** Uppercase 4-digit hex string of a PUA code point. */
function hex4(dec: number): string {
  return dec.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Set (or clear) a group's PUA code range.
 *
 * Pass range = null to clear. Otherwise the range is validated:
 *   - both bounds inside the PUA range E000-F8FF (57344-63743)
 *   - start <= end
 *   - no overlap with any OTHER group's declared range (overlap is forbidden)
 * Icons added to the group afterwards allocate their codes inside this range;
 * the global pool (unassigned / no-range groups) skips the reserved range.
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param name - Group name
 * @param range - { start, end } decimal code points, or null to clear
 */
export async function setGroupCodeRange(
  io: IoAdapter,
  projectPath: string,
  name: string,
  range: { start: number; end: number } | null
): Promise<SetCodeRangeResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const group = db.findGroupByName(name);
    if (!group) {
      throw new Error(`Group not found: ${name}`);
    }
    const id = group.id as string;

    if (range === null) {
      db.setGroupCodeRange(id, null, null);
      await saveProject(io, resolvedPath, db);
      return { id, groupName: name, codeRangeStart: null, codeRangeEnd: null, cleared: true };
    }

    const { start, end } = range;
    // Integer-ness is an input-parsing concern and stays at the operations edge;
    // the semantic validation (PUA bounds / order / overlap) lives in the command.
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new Error(`INVALID_CODE_RANGE: range bounds must be integer code points`);
    }
    const validation = validateGroupCodeRangeCommand(db, id, range);
    if (!validation.ok) {
      if (validation.reason === 'out-of-pua') {
        throw new Error(
          `INVALID_CODE_RANGE: range ${hex4(start)}-${hex4(end)} is outside the PUA range ${hex4(PUA_MIN)}-${hex4(PUA_MAX)}`
        );
      }
      if (validation.reason === 'inverted') {
        throw new Error(
          `INVALID_CODE_RANGE: range start ${hex4(start)} must be <= end ${hex4(end)}`
        );
      }
      // 'overlap' — rebuild the historical message from the conflicting group.
      const o = db.getGroupRanges().find((r) => r.id === validation.conflictGroupId);
      throw new Error(
        `CODE_RANGE_OVERLAP: range ${hex4(start)}-${hex4(end)} overlaps group ` +
          `"${o?.groupName ?? ''}" (${hex4(o?.start ?? 0)}-${hex4(o?.end ?? 0)})`
      );
    }

    db.setGroupCodeRange(id, start, end);
    await saveProject(io, resolvedPath, db);
    return { id, groupName: name, codeRangeStart: start, codeRangeEnd: end, cleared: false };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Inspect (single group: range + occupancy)
// ---------------------------------------------------------------------------

export interface InspectGroupResult {
  id: string;
  groupName: string;
  groupDescription: string | null;
  /** Decimal code points, or null when no range is declared. */
  codeRangeStart: number | null;
  codeRangeEnd: number | null;
  /** Hex form for display convenience, or null. */
  codeRangeStartHex: string | null;
  codeRangeEndHex: string | null;
  iconCount: number;
  /** Range occupancy (null when no range). used = occupied code points inside the range across ALL icons. */
  rangeCapacity: number | null;
  rangeUsed: number | null;
  rangeFree: number | null;
  /** Icons in THIS group whose code is outside the declared range (null when no range). */
  outOfRangeCount: number | null;
}

/**
 * Inspect a single group: its declared code range (if any) and occupancy stats
 * (range capacity / used / free, and how many of the group's own icons fall
 * outside the range).
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 * @param name - Group name
 */
export async function inspectGroup(
  io: IoAdapter,
  projectPath: string,
  name: string
): Promise<InspectGroupResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const group = db.findGroupByName(name);
    if (!group) {
      throw new Error(`Group not found: ${name}`);
    }
    const id = group.id as string;
    const range = db.getGroupCodeRange(id);
    const iconCount = db.getIconCountForGroup(id);

    let rangeCapacity: number | null = null;
    let rangeUsed: number | null = null;
    let rangeFree: number | null = null;
    let outOfRangeCount: number | null = null;
    if (range) {
      const occ = db.getRangeOccupancy(range.start, range.end);
      rangeCapacity = occ.capacity;
      rangeUsed = occ.used;
      rangeFree = occ.free;
      outOfRangeCount = db.countGroupIconsOutOfRange(id, range.start, range.end);
    }

    return {
      id,
      groupName: name,
      groupDescription: (group.groupDescription as string | null) ?? null,
      codeRangeStart: range ? range.start : null,
      codeRangeEnd: range ? range.end : null,
      codeRangeStartHex: range ? hex4(range.start) : null,
      codeRangeEndHex: range ? hex4(range.end) : null,
      iconCount,
      rangeCapacity,
      rangeUsed,
      rangeFree,
      outOfRangeCount,
    };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Range violations (icons whose code is outside their group's range)
// ---------------------------------------------------------------------------

export interface RangeViolation {
  id: string;
  iconName: string;
  iconCode: string;
  groupId: string;
  groupName: string;
  codeRangeStart: number;
  codeRangeEnd: number;
  codeRangeStartHex: string;
  codeRangeEndHex: string;
}

export interface RangeViolationsResult {
  violations: RangeViolation[];
  /** Number of groups that declare a range (the checked set). */
  checkedGroups: number;
}

/**
 * List every icon whose unicode code falls outside the code range declared by
 * its own group. Groups without a range are not checked. Feeds the GUI's
 * out-of-range grid markers + code-health "one-click fix" (Wave C).
 *
 * @param io - File system adapter
 * @param projectPath - Path to the .icp file
 */
export async function rangeViolations(
  io: IoAdapter,
  projectPath: string
): Promise<RangeViolationsResult> {
  const resolvedPath = io.resolve(projectPath);
  const db = await openProject(io, resolvedPath);

  try {
    const rows = rangeViolationsCommand(db);
    const violations: RangeViolation[] = rows.map((row) => ({
      id: row.iconId,
      iconName: row.iconName,
      iconCode: row.code,
      groupId: row.groupId,
      groupName: row.groupName,
      codeRangeStart: row.range.start,
      codeRangeEnd: row.range.end,
      codeRangeStartHex: hex4(row.range.start),
      codeRangeEndHex: hex4(row.range.end),
    }));
    return { violations, checkedGroups: db.getGroupRanges().length };
  } finally {
    db.close();
  }
}
