import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Shuffle, X, ChevronRight, TriangleAlert } from 'lucide-react';
import { Dialog, Button, confirm } from '../ui';
import { message } from '../ui/toast';
import EnhanceInput from '../enhance/input';
import { cn } from '../../lib/utils';
import { sanitizeSVG } from '../../utils/sanitize';
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): group.add, group.rename, group.delete, group.set-description
import db from '../../database';
import useAppStore, { analyticsTrack } from '../../store';
import type { GroupData } from './types';
import { normalizeIconCode } from './codeCoverage';
import CodeMatrix from '../CodeMatrix';
import {
  decToHex4,
  countCodesOutsideRange,
  type CodeRange,
  type ReservedRange,
  type RangeError,
} from '../CodeMatrix/rangeMath';

interface GroupDialogsProps {
  addGroupVisible: boolean;
  onCloseAddGroup: () => void;
  onGroupAdded: (groupId: string) => void;
  sideMenuWrapperRef: React.RefObject<HTMLDivElement>;
  renameGroupData: GroupData | null;
  renameGroupVisible: boolean;
  onCloseRenameGroup: () => void;
  onGroupRenamed: (groupId: string) => void;
}

// ── Mini icon picker for group icon selection ──────────────────────────
function GroupIconPicker({
  groupId,
  selectedIconId,
  onSelect,
}: {
  groupId: string;
  selectedIconId: string | null;
  onSelect: (iconId: string | null) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [iconContents, setIconContents] = useState<Map<string, string>>(new Map());

  const icons = useMemo(() => {
    return db.getIconListFromGroup(groupId);
  }, [groupId]);

  // Batch load SVG content when expanded
  useEffect(() => {
    if (!expanded || icons.length === 0) return;
    const ids = icons.map((i) => i.id);
    const contents = db.getIconContentBatch(ids);
    setIconContents(contents);
  }, [expanded, icons]);

  // Load selected icon content for preview
  const selectedContent = useMemo(() => {
    if (!selectedIconId) return '';
    if (iconContents.has(selectedIconId)) return iconContents.get(selectedIconId) || '';
    return db.getIconContent(selectedIconId);
  }, [selectedIconId, iconContents]);

  const handleRandom = useCallback(() => {
    if (icons.length === 0) return;
    const idx = Math.floor(Math.random() * icons.length);
    onSelect(icons[idx].id);
  }, [icons, onSelect]);

  const handleClear = useCallback(() => {
    onSelect(null);
    setExpanded(false);
  }, [onSelect]);

  if (icons.length === 0) {
    return <div className="t-caption py-2">{t('group.iconEmpty')}</div>;
  }

  return (
    <div>
      {/* Selected preview + actions */}
      <div className="flex items-center gap-2">
        {selectedIconId && selectedContent ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={cn(
              'w-9 h-9 rounded-lg border flex items-center justify-center',
              'transition-colors cursor-pointer',
              'border-accent/50 bg-accent/5',
              '[&>svg]:w-5 [&>svg]:h-5'
            )}
            dangerouslySetInnerHTML={{ __html: sanitizeSVG(selectedContent) }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={cn(
              'w-9 h-9 rounded-lg border flex items-center justify-center',
              'transition-colors cursor-pointer',
              'border-border border-dashed bg-surface-muted/50 hover:border-foreground-muted/30'
            )}
          >
            <span className="text-foreground-muted/30 text-lg leading-none">+</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleRandom}
          className={cn(
            'h-7 px-2 rounded-md text-xs flex items-center gap-1',
            'border border-border text-foreground-muted',
            'hover:bg-surface-muted hover:text-foreground',
            'transition-colors cursor-pointer'
          )}
        >
          <Shuffle size={12} />
          {t('group.iconRandom')}
        </button>

        {selectedIconId && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              'h-7 px-2 rounded-md text-xs flex items-center gap-1',
              'border border-border text-foreground-muted',
              'hover:bg-surface-muted hover:text-foreground',
              'transition-colors cursor-pointer'
            )}
          >
            <X size={12} />
            {t('group.iconClear')}
          </button>
        )}
      </div>

      {/* Expandable icon grid */}
      {expanded && (
        <div
          className={cn(
            'mt-2 rounded-lg border border-border bg-surface-muted/30',
            'overflow-y-auto overscroll-contain',
            'grid grid-cols-8 gap-px p-1'
          )}
          style={{ maxHeight: '160px' }}
        >
          {icons.map((icon) => {
            const content = iconContents.get(icon.id) || '';
            const isSelected = icon.id === selectedIconId;
            return (
              <button
                type="button"
                key={icon.id}
                onClick={() => {
                  onSelect(icon.id);
                  setExpanded(false);
                }}
                className={cn(
                  'aspect-square rounded-md flex items-center justify-center p-1.5',
                  'transition-colors cursor-pointer',
                  'hover:bg-surface-accent',
                  isSelected && 'ring-1.5 ring-accent bg-accent/10',
                  '[&>svg]:w-full [&>svg]:h-full'
                )}
                dangerouslySetInnerHTML={{ __html: sanitizeSVG(content) }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Optional "code range" section for the add/edit group dialogs ──────────
// 纯展示壳: 折叠开关 + 共享 CodeMatrix (range-select)。校验/吸附/hex 输入均由 CodeMatrix 内置,
// 越界/重叠时经 onValidityChange 上报, 由弹窗禁用确认按钮。usedCodes/reservedRanges 由父组件下传。
function GroupCodeRangeSection({
  value,
  onChange,
  onValidityChange,
  usedCodes,
  reservedRanges,
  ownCodes,
}: {
  value: CodeRange | null;
  onChange: (range: CodeRange | null) => void;
  onValidityChange: (error: RangeError | null) => void;
  usedCodes: Set<number>;
  reservedRanges: ReservedRange[];
  /** 本组已有图标的码位 (编辑分组时警示区间外码位用); 新建分组无需传入。 */
  ownCodes?: Set<number>;
}) {
  const { t } = useTranslation();
  const [userOpen, setUserOpen] = useState(false);
  // 已设区间时恒展开 (让已配置的区间始终可见); 未设时由折叠开关控制。
  const open = userOpen || value != null;

  return (
    <div data-testid="group-range-section">
      <button
        type="button"
        data-testid="group-range-toggle"
        onClick={() => setUserOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-1.5 t-label',
          'hover:text-foreground transition-colors'
        )}
      >
        <ChevronRight
          size={13}
          className={cn('shrink-0 transition-transform', open && 'rotate-90')}
        />
        <span>{t('group.codeRange')}</span>
        {value ? (
          <span className="ml-auto font-mono text-[11px] text-accent">
            {decToHex4(value.start)}–{decToHex4(value.end)}
          </span>
        ) : (
          <span className="ml-auto text-[11px] text-foreground-subtle">
            {t('group.codeRangeUnset')}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-border bg-surface-muted/20 p-2.5">
          <p className="mb-2 t-help">{t('group.codeRangeDesc')}</p>
          <CodeMatrix
            mode="range-select"
            usedCodes={usedCodes}
            reservedRanges={reservedRanges}
            ownCodes={ownCodes}
            value={value}
            onChange={onChange}
            onValidityChange={onValidityChange}
          />
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────
function GroupDialogs({
  addGroupVisible,
  onCloseAddGroup,
  onGroupAdded,
  sideMenuWrapperRef,
  renameGroupData,
  renameGroupVisible,
  onCloseRenameGroup,
  onGroupRenamed,
}: GroupDialogsProps) {
  const { t } = useTranslation();
  const syncLeft = useAppStore((state: any) => state.syncLeft);
  const groupData = useAppStore((state: any) => state.groupData);

  // 添加分组
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupDesc, setNewGroupDesc] = useState<string>('');
  const [newGroupErr, setNewGroupErr] = useState<string | null>(null);
  const [newGroupRange, setNewGroupRange] = useState<CodeRange | null>(null);
  const [newGroupRangeError, setNewGroupRangeError] = useState<RangeError | null>(null);

  // 编辑分组
  const [renameName, setRenameName] = useState<string>('');
  const [renameDesc, setRenameDesc] = useState<string>('');
  const [renameIcon, setRenameIcon] = useState<string | null>(null);
  const [renameErr, setRenameErr] = useState<string | null>(null);
  const [renameRange, setRenameRange] = useState<CodeRange | null>(null);
  const [renameRangeError, setRenameRangeError] = useState<RangeError | null>(null);
  // 本组已有图标的码位快照 (十进制) — 编辑对话框打开时取一次, 供区间变更的"本组越界"警示。
  const [renameOwnCodes, setRenameOwnCodes] = useState<Set<number>>(() => new Set<number>());

  // 全项目已用码位快照 (十进制) — 对话框打开时取一次, 供矩阵的占用热图。
  const [usedCodesSet, setUsedCodesSet] = useState<Set<number>>(() => new Set<number>());
  const snapshotUsedCodes = useCallback(() => {
    try {
      const raw: string[] = db.getAllIconCodes();
      const s = new Set<number>();
      for (const r of raw) {
        const d = normalizeIconCode(r);
        if (d !== null) s.add(d);
      }
      setUsedCodesSet(s);
    } catch {
      setUsedCodesSet(new Set<number>());
    }
  }, []);

  // 其他分组已声明区间 (reserved 图层)。add: 全部有区间的组; edit: 排除当前编辑组。
  const reservedFor = useCallback(
    (excludeId?: string): ReservedRange[] =>
      (groupData as any[])
        .filter(
          (g) =>
            g.id !== excludeId &&
            g.codeRangeStart !== null &&
            g.codeRangeStart !== undefined &&
            g.codeRangeEnd !== null &&
            g.codeRangeEnd !== undefined
        )
        .map((g) => ({
          id: g.id,
          name: g.groupName,
          start: Number(g.codeRangeStart),
          end: Number(g.codeRangeEnd),
        })),
    [groupData]
  );
  const addReservedRanges = useMemo(() => reservedFor(undefined), [reservedFor]);
  const editReservedRanges = useMemo(
    () => reservedFor(renameGroupData?.id),
    [reservedFor, renameGroupData]
  );

  // 本组已有图标的码位快照 (十进制) — 复用既有的 getIconListFromGroup (不新增 db 方法),
  // 归一化后与 renameRange 比对, 得到编辑区间时"本组越界"的数量。
  const snapshotOwnCodes = useCallback((groupId: string) => {
    try {
      const rows = db.getIconListFromGroup(groupId);
      const s = new Set<number>();
      for (const row of rows) {
        const d = normalizeIconCode(row.iconCode);
        if (d !== null) s.add(d);
      }
      setRenameOwnCodes(s);
    } catch {
      setRenameOwnCodes(new Set<number>());
    }
  }, []);
  const renameOutsideCount = useMemo(
    () => countCodesOutsideRange(renameOwnCodes, renameRange),
    [renameOwnCodes, renameRange]
  );

  // 添加对话框打开时重置
  useEffect(() => {
    if (addGroupVisible) {
      setNewGroupName('');
      setNewGroupDesc('');
      setNewGroupErr(null);
      setNewGroupRange(null);
      setNewGroupRangeError(null);
      snapshotUsedCodes();
    }
  }, [addGroupVisible, snapshotUsedCodes]);

  // 编辑对话框打开时从 DB 数据回填
  useEffect(() => {
    if (renameGroupVisible && renameGroupData) {
      setRenameName(renameGroupData.groupName);
      setRenameDesc(renameGroupData.groupDescription || '');
      setRenameIcon(renameGroupData.groupIcon || null);
      setRenameErr(null);
      const s = (renameGroupData as any).codeRangeStart;
      const e = (renameGroupData as any).codeRangeEnd;
      setRenameRange(
        s !== null && s !== undefined && e !== null && e !== undefined
          ? { start: Number(s), end: Number(e) }
          : null
      );
      setRenameRangeError(null);
      snapshotUsedCodes();
      snapshotOwnCodes(renameGroupData.id);
    }
  }, [renameGroupVisible, renameGroupData, snapshotUsedCodes, snapshotOwnCodes]);

  const handleAddGroup = () => {
    // 名称落库前 trim — 避免首尾空白名与纯空白名
    const finalName = newGroupName.trim();
    if (!finalName) {
      setNewGroupErr(t('group.nameRequired'));
      return;
    }
    if (newGroupRangeError) return; // 行内错误未清除, 阻止保存 (确认按钮已禁用, 双保险)
    const finalize = (groupId: string) => {
      message.success(t('group.addSuccess'));
      syncLeft();
      analyticsTrack('group.create');
      onCloseAddGroup();
      onGroupAdded(groupId);
      if (sideMenuWrapperRef.current) {
        sideMenuWrapperRef.current.scrollTop = 100000;
      }
    };
    db.addGroup(
      finalName,
      (group: GroupData) => {
        if (newGroupRange) {
          // 创建后补写区间 (校验在 setGroupInfo 内, 兜底 UI 已禁用非法保存)
          try {
            db.setGroupInfo(
              group.id,
              finalName,
              newGroupDesc.trim() || null,
              () => finalize(group.id),
              undefined,
              newGroupRange
            );
          } catch {
            setNewGroupErr(t('group.codeRangeInvalid'));
          }
        } else {
          finalize(group.id);
        }
      },
      newGroupDesc.trim() || undefined
    );
  };

  const handleRenameGroup = () => {
    // 名称落库前 trim — 避免首尾空白名与纯空白名
    const finalName = renameName.trim();
    if (!finalName) {
      setRenameErr(t('group.nameEmpty'));
      return;
    }
    if (renameRangeError) return; // 行内错误未清除, 阻止保存
    const persist = () => {
      try {
        db.setGroupInfo(
          renameGroupData!.id,
          finalName,
          renameDesc.trim() || null,
          () => {
            message.success(t('group.updateSuccess'));
            syncLeft();
            onCloseRenameGroup();
            onGroupRenamed(renameGroupData!.id);
          },
          renameIcon,
          renameRange
        );
      } catch {
        setRenameErr(t('group.codeRangeInvalid'));
      }
    };
    // 区间变更导致本组已有图标落在区间外时, 先二次确认再落库 (取消则停留在弹窗)。
    if (renameOutsideCount > 0) {
      confirm({
        title: t('group.codeRangeConfirmTitle'),
        content: t('group.codeRangeConfirmContent', { count: renameOutsideCount }),
        okType: 'danger',
        onOk: persist,
      });
      return;
    }
    persist();
  };

  return (
    <>
      <Dialog
        open={addGroupVisible}
        onClose={onCloseAddGroup}
        title={t('group.add')}
        footer={
          <>
            <Button onClick={onCloseAddGroup}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={handleAddGroup} disabled={!!newGroupRangeError}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="py-2 space-y-3">
          <EnhanceInput
            placeholder={t('group.name')}
            value={newGroupName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewGroupName(e.target.value)}
            onPressEnter={handleAddGroup}
            inputTitle={t('group.addInputTitle')}
            inputHintText={newGroupErr}
            inputHintBadgeType="error"
          />
          <div>
            <label className="block t-label mb-1">{t('group.descriptionOptional')}</label>
            <textarea
              className="w-full rounded-md border border-border bg-surface px-3 py-2 t-body placeholder:text-foreground-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring/30 resize-none"
              placeholder={t('group.descriptionPlaceholder')}
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              rows={2}
              maxLength={200}
            />
          </div>
          <GroupCodeRangeSection
            value={newGroupRange}
            onChange={setNewGroupRange}
            onValidityChange={setNewGroupRangeError}
            usedCodes={usedCodesSet}
            reservedRanges={addReservedRanges}
          />
        </div>
      </Dialog>

      <Dialog
        open={renameGroupVisible}
        onClose={onCloseRenameGroup}
        title={t('group.edit')}
        footer={
          <>
            <Button onClick={onCloseRenameGroup}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={handleRenameGroup} disabled={!!renameRangeError}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="py-2 space-y-3">
          <EnhanceInput
            placeholder={t('group.name')}
            value={renameName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameName(e.target.value)}
            onPressEnter={handleRenameGroup}
            inputTitle={t('group.editInputTitle')}
            inputHintText={renameErr}
            inputHintBadgeType="error"
          />
          <div>
            <label className="block t-label mb-1">{t('group.descriptionOptional')}</label>
            <textarea
              className="w-full rounded-md border border-border bg-surface px-3 py-2 t-body placeholder:text-foreground-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring/30 resize-none"
              placeholder={t('group.descriptionPlaceholder')}
              value={renameDesc}
              onChange={(e) => setRenameDesc(e.target.value)}
              rows={2}
              maxLength={200}
            />
          </div>
          <div>
            <label className="block t-label mb-1">{t('group.icon')}</label>
            <GroupIconPicker
              groupId={renameGroupData?.id || ''}
              selectedIconId={renameIcon}
              onSelect={setRenameIcon}
            />
          </div>
          <GroupCodeRangeSection
            value={renameRange}
            onChange={setRenameRange}
            onValidityChange={setRenameRangeError}
            usedCodes={usedCodesSet}
            reservedRanges={editReservedRanges}
            ownCodes={renameOwnCodes}
          />
          {renameOutsideCount > 0 && (
            <div
              data-testid="group-range-own-outside-warning"
              className="flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning"
            >
              <TriangleAlert size={13} className="shrink-0" />
              <span>{t('group.codeRangeOwnOutside', { count: renameOutsideCount })}</span>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

export default GroupDialogs;
