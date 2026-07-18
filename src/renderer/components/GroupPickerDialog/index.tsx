// src/renderer/components/GroupPickerDialog/index.tsx
//
// Shared "move/copy to group" picker dialog. Presentation-only: it never
// touches the database directly — all icon mutations (moveIconsTo,
// copyIconsTo, ...) stay in the calling component (SideEditor / BatchPanel /
// IconGridLocal), which goes through the store batch actions. This keeps
// the component outside the scope of test/unit/variant-guard.test.js.
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, FolderMinus } from 'lucide-react';
import { Dialog, Button, Badge } from '../ui';
import { Radio, RadioGroup } from '../ui/radio';
import GroupIconPreview from '../GroupIconPreview';

/** Sentinel group id meaning "no group" — matches db.ts / ResourceNav conventions. */
export const UNGROUPED_GROUP_ID = 'resource-uncategorized';

export interface GroupPickerGroup {
  id: string;
  groupName: string;
  groupIcon?: string | null;
}

export interface GroupPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether this picker is for a move or a copy/duplicate operation. */
  mode: 'move' | 'copy';
  /** Selectable real groups (already excludes pseudo-views like resource-all). */
  groups: GroupPickerGroup[];
  /**
   * The group the icon(s) currently belong to, if there's a single unambiguous
   * one (e.g. a single icon's own group, or a per-group batch context).
   * Used only to disable picking "Ungrouped" when already ungrouped — pass
   * `null`/omit for batch selections spanning multiple groups.
   */
  currentGroupId?: string | null;
  /** Preselected target group id. Ignored if it doesn't match a real option. */
  initialTargetId?: string | null;
  /** Whether to offer "Ungrouped" as a pickable target. Default true. */
  showUngrouped?: boolean;
  /** Dialog title. Defaults to the standard move/copy title based on `mode`. */
  title?: React.ReactNode;
  /** Optional extra warning content rendered above the group list (e.g. variant warning). */
  warning?: React.ReactNode;
  /**
   * Move mode only. Given the currently-selected target group id, return how many
   * of the pending icons have a code outside that group's declared range (0 = the
   * target has no range or nothing is out of range → the reassignment row is hidden).
   * The caller owns any db access; this component stays presentation-only.
   */
  getOutOfRangeCount?: (targetGroupId: string) => number;
  /**
   * Confirm callback. `opts.reassignOutOfRange` is passed only when the target has a
   * range and some pending icons are out of range (the user picked between
   * "reassign into range" / "keep codes"); otherwise it is omitted.
   */
  onConfirm: (targetGroupId: string, opts?: { reassignOutOfRange: boolean }) => void;
}

export function GroupPickerDialog({
  open,
  onOpenChange,
  mode,
  groups,
  currentGroupId = null,
  initialTargetId = null,
  showUngrouped = true,
  title,
  warning,
  getOutOfRangeCount,
  onConfirm,
}: GroupPickerDialogProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<string | null>(null);
  // 越界内联选择: true = 重新分配到区间内 (默认), false = 保持原字码。
  const [reassign, setReassign] = useState(true);

  // Reset selection every time the dialog opens — also guards against a stale
  // preselection that no longer maps to a real, pickable option (e.g. the
  // caller's "current view" was a pseudo-group like resource-favorite).
  useEffect(() => {
    if (!open) return;
    const validIds = new Set(groups.map((g) => g.id));
    if (showUngrouped) validIds.add(UNGROUPED_GROUP_ID);
    setTarget(initialTargetId && validIds.has(initialTargetId) ? initialTargetId : null);
    setReassign(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resolvedTitle =
    title ?? (mode === 'copy' ? t('editor.copyToGroup') : t('editor.moveToGroup'));

  const ungroupedDisabled = showUngrouped && currentGroupId === UNGROUPED_GROUP_ID;
  const confirmDisabled = !target || (target === UNGROUPED_GROUP_ID && ungroupedDisabled);

  // 目标组有区间且有越界图标时, 展示"重分配/保持"单选 (仅移动模式)。
  const outOfRangeCount =
    mode === 'move' && target && getOutOfRangeCount ? getOutOfRangeCount(target) : 0;
  const showReassignRow = outOfRangeCount > 0;

  const handleClose = () => onOpenChange(false);
  const handleConfirm = () => {
    if (confirmDisabled || !target) return;
    onConfirm(target, showReassignRow ? { reassignOutOfRange: reassign } : undefined);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={resolvedTitle}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          {t('common.cancel')}
        </Button>,
        <Button
          key="ensure"
          type="primary"
          disabled={confirmDisabled}
          onClick={handleConfirm}
          data-testid="group-picker-confirm"
        >
          {t('common.confirm')}
        </Button>,
      ]}
    >
      <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2">
        {mode === 'copy' && <p className="mb-2 t-help">{t('editor.duplicateHint')}</p>}
        {warning}
        <RadioGroup onChange={(e) => setTarget(e.target.value)} value={target}>
          {showUngrouped && (
            <Radio key={UNGROUPED_GROUP_ID} value={UNGROUPED_GROUP_ID} disabled={ungroupedDisabled}>
              <span className="flex w-full min-w-0 items-center gap-2">
                <FolderMinus size={14} className="shrink-0 text-foreground-muted" />
                <span className="min-w-0 flex-1 truncate">{t('group.ungrouped')}</span>
                <Badge label={t('group.ungroupedTag')} className="shrink-0" />
              </span>
            </Radio>
          )}
          {groups.map((group) => (
            <Radio key={group.id} value={group.id}>
              <span className="flex w-full min-w-0 items-center gap-2">
                {group.groupIcon ? (
                  <GroupIconPreview
                    iconId={group.groupIcon}
                    className="h-3.5 w-3.5 shrink-0 opacity-80"
                  />
                ) : (
                  <Folder size={14} className="shrink-0 text-foreground-muted" />
                )}
                <span className="min-w-0 flex-1 truncate">{group.groupName}</span>
              </span>
            </Radio>
          ))}
        </RadioGroup>

        {showReassignRow && (
          <div
            data-testid="group-picker-reassign"
            className="mt-3 rounded-md border border-warning/30 bg-warning-subtle px-2.5 py-2"
          >
            <p className="mb-1.5 text-xs font-medium text-warning">
              {t('groupPicker.outOfRange', { count: outOfRangeCount })}
            </p>
            <RadioGroup
              onChange={(e) => setReassign(e.target.value === 'reassign')}
              value={reassign ? 'reassign' : 'keep'}
            >
              <Radio value="reassign">
                <span className="text-xs">{t('groupPicker.reassign')}</span>
              </Radio>
              <Radio value="keep">
                <span className="text-xs">{t('groupPicker.keepCodes')}</span>
              </Radio>
            </RadioGroup>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default GroupPickerDialog;
