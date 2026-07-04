// Electron API (via preload contextBridge)
const { electronAPI } = window;
// React
import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
// UI
import { Button, message, confirm } from '../ui';
// Color picker
import { HexColorPicker } from 'react-colorful';
import {
  RefreshCw,
  Download,
  Trash2,
  Copy,
  ArrowRightLeft,
  Info,
  Palette,
  Wrench,
  TriangleAlert,
} from 'lucide-react';
// Components
import EnhanceInput from '../enhance/input';
// Utils
import { cn } from '../../lib/utils';
import { sanitizeSVG } from '../../utils/sanitize';
import {
  extractSvgColors,
  replaceSvgColor,
  parseCssColor,
  resolveCurrentColor,
} from '../../utils/svg/colors';
import { platform } from '../../utils/tools';
import { checkVariants, buildVariantWarning } from '../../utils/variantGuard';
// Database
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): icon.rename, icon.delete, icon.set-code, icon.replace, icon.export-svg, icon.get-content
import db from '../../database';
// Images
import selectedIconHint from '../../resources/imgs/nodata/selectedIconHint.png';
// Store
import useAppStore, { analyticsTrack } from '../../store';
// Variant panel
import VariantPanel from './VariantPanel';
// Export dialog
import { IconExportDialog } from '../IconExportDialog';
import type { IconExportTarget } from '../IconExportDialog';
// Group picker (move/copy to group)
import { GroupPickerDialog } from '../GroupPickerDialog';
import type { GroupPickerGroup } from '../GroupPickerDialog';
import { parseHex } from '../CodeMatrix/rangeMath';

interface IconDataRecord {
  id: string;
  iconName: string;
  iconCode: string;
  iconGroup: string;
  iconSize: number;
  iconType: string;
  iconContent: string;
  createTime: string;
  updateTime: string;
  variantOf: string | null;
  variantMeta: string | null;
  [key: string]: any;
}

interface SideEditorProps {
  selectedGroup: string;
  selectedIcon: string | null;
}

const SideEditor = React.memo(function SideEditor({
  selectedGroup,
  selectedIcon,
}: SideEditorProps) {
  const { t } = useTranslation();
  const syncLeft = useAppStore((state: any) => state.syncLeft);
  const syncIconContent = useAppStore((state: any) => state.syncIconContent);
  const patchIconContent = useAppStore((state: any) => state.patchIconContent);
  const selectIcon = useAppStore((state: any) => state.selectIcon);
  const darkMode = useAppStore((state: any) => state.darkMode);

  const [iconData, setIconData] = useState<IconDataRecord>({} as IconDataRecord);
  const [iconName, setIconName] = useState<string | null>(null);
  const [iconNameErrText, setIconNameErrText] = useState<string | null>(null);
  const [iconCode, setIconCode] = useState<string | null>(null);
  const [iconCodeErrText, setIconCodeErrText] = useState<string | null>(null);
  const [iconGroupEditModelType, setIconGroupEditModelType] = useState<string | null>(null);
  const [iconGroupEditModelVisible, setIconGroupEditModelVisible] = useState<boolean>(false);
  const [exportDialogVisible, setExportDialogVisible] = useState(false);

  const prevSelectedIconRef = useRef<string | null>(selectedIcon);

  // Sync icon data
  const sync = (iconId?: string | null) => {
    const id = iconId || selectedIcon;
    if (id) {
      const data = db.getIconData(id);
      setIconData(data);
      setIconName(data.iconName);
      setIconNameErrText(null);
      setIconCode(data.iconCode);
      setIconCodeErrText(null);
    }
  };

  useEffect(() => {
    if (selectedIcon) {
      sync(selectedIcon);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only run; selectedIcon transitions are handled by the ref-guarded effect below, adding it here would double-sync
  }, []);

  // Subscribe to store changes to trigger re-sync
  const groupData = useAppStore((state: any) => state.groupData);
  const iconContentVersion = useAppStore((state: any) => state.iconContentVersion);
  const duplicateCodes = useAppStore((state: any) => state.duplicateCodes);
  useEffect(() => {
    if (selectedIcon) {
      sync(selectedIcon);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally scoped to groupData/iconContentVersion refreshes only; `sync` is unmemoized (recreated every render) so adding it (or selectedIcon) would re-sync on every render and clobber in-progress name/code edits
  }, [groupData, iconContentVersion]);

  useEffect(() => {
    if (selectedIcon !== prevSelectedIconRef.current) {
      prevSelectedIconRef.current = selectedIcon;
      if (selectedIcon) {
        sync(selectedIcon);
        // 从数据库读取导入时的原始内容，用于颜色重置
        const data = db.getIconData(selectedIcon);
        setOriginalIconContent(db.getOriginalContent(data));
        setEditingColorIdx(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sync` is unmemoized (recreated every render); adding it here would trip a separate exhaustive-deps warning to wrap it in useCallback, which risks its own behavior change, so it's intentionally left out. The ref-guard above makes selectedIcon the only real trigger anyway
  }, [selectedIcon]);

  // 图标名称与字码修改相关
  const iconNameCanSave = (): boolean => {
    return !!(iconName && iconName !== iconData.iconName);
  };
  const handleIconNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIconName(e.target.value);
    setIconNameErrText(!e.target.value ? t('editor.nameEmpty') : null);
  };
  const handleIconNameSave = () => {
    if (iconName) {
      if (iconNameCanSave()) {
        db.setIconName(selectedIcon, iconName, () => {
          message.success(t('editor.nameChanged'));
          syncIconContent();
          syncLeft();
          sync(selectedIcon);
        });
      }
    } else {
      setIconNameErrText(t('editor.nameEmpty'));
    }
  };
  const iconCodeCanSave = (): boolean => {
    return !!(iconCode && iconCode !== iconData.iconCode && db.iconCodeCanUse(iconCode));
  };
  const handleIconCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value) {
      setIconCode(value.toUpperCase());
      setIconCodeErrText(
        value !== iconData.iconCode
          ? db.iconCodeInRange(value)
            ? db.iconCodeCanUse(value)
              ? null
              : t('editor.codeDuplicate')
            : t('editor.codeOutOfRange')
          : null
      );
    } else {
      setIconCode(value);
      setIconCodeErrText(!value ? t('editor.codeEmpty') : null);
    }
  };
  const handleIconCodeSave = () => {
    if (iconCode) {
      if (iconCodeCanSave()) {
        db.setIconCode(selectedIcon, iconCode, () => {
          message.success(t('editor.codeChanged'));
          syncIconContent();
          syncLeft();
          sync(selectedIcon);
        });
      }
    } else {
      setIconCodeErrText(t('editor.codeEmpty'));
    }
  };
  // 字码越界一键重新分配 —— 组合既有方法 (不新增 db 方法, core-parity-guard 冻结):
  // requireNewIconCode(targetGroupId) 在图标所属分组的区间内按分配模式取一个新字码
  // (区间耗尽时抛 GROUP_RANGE_EXHAUSTED / 全局池耗尽抛 PUA_EXHAUSTED), 再走既有的
  // setIconCode 改码路径落库, 与手动改码 (handleIconCodeSave) 保持一致的撞码校验/健康刷新
  const handleReassignCode = () => {
    if (!selectedIcon) return;
    try {
      const newCode = db.requireNewIconCode(iconData.iconGroup);
      db.setIconCode(selectedIcon, newCode, () => {
        message.success(t('editor.codeReassigned'));
        syncIconContent();
        syncLeft();
        sync(selectedIcon);
      });
    } catch (err) {
      if (String((err as Error)?.message).startsWith('GROUP_RANGE_EXHAUSTED')) {
        message.warning(t('editor.codeRangeExhausted'));
      } else if ((err as Error)?.message === 'PUA_EXHAUSTED') {
        message.error(t('editor.codeExhausted'));
      } else {
        throw err;
      }
    }
  };

  // 替换图标相关
  const handleIconContentUpdate = async () => {
    const guard = checkVariants(selectedIcon);
    const doReplace = async () => {
      const result = await electronAPI.showOpenDialog({
        title: t('editor.selectSvgFile'),
        filters: [{ name: t('editor.svgFileFilter'), extensions: ['svg'] }],
        properties: ['openFile'],
      });
      if (!result.canceled && result.filePaths.length > 0) {
        const newIconFileData = Object.assign({}, iconData, { path: result.filePaths[0] });
        if (guard.hasVariants) {
          db.deleteVariants(selectedIcon);
        }
        db.renewIconData(selectedIcon, newIconFileData, () => {
          message.success(t('editor.dataUpdated'));
          syncIconContent();
          syncLeft();
        });
      }
    };

    if (guard.hasVariants) {
      confirm({
        title: t('editor.replaceTitle'),
        content: buildVariantWarning(
          t('editor.replaceContent'),
          guard.count,
          t,
          'variant.replaceWarn'
        ),
        okType: 'danger',
        onOk: doReplace,
      });
    } else {
      doReplace();
    }
  };

  // 图标导出相关
  const handleIconExport = () => setExportDialogVisible(true);

  // 删除图标相关（通过 variantGuard 统一处理）
  const handleIconRecycle = () => {
    const guard = checkVariants(selectedIcon);
    confirm({
      title: t('editor.recycleTitle'),
      content: buildVariantWarning(
        t('editor.recycleContent'),
        guard.count,
        t,
        'variant.recycleNote'
      ),
      onOk() {
        db.moveIconWithVariants(selectedIcon, 'resource-recycleBin', () => {
          message.success(t('editor.recycled'));
          syncLeft();
          selectIcon(null);
        });
      },
    });
  };
  const handleIconDelete = () => {
    const guard = checkVariants(selectedIcon);
    confirm({
      title: t('editor.deleteTitle'),
      content: buildVariantWarning(
        t('editor.deleteContent'),
        guard.count,
        t,
        'variant.deleteConfirm'
      ),
      okType: 'danger',
      okText: t('common.delete'),
      onOk() {
        db.deleteIconWithVariants(selectedIcon, () => {
          message.success(t('editor.deleted'));
          syncLeft();
          analyticsTrack('icon.delete');
          selectIcon(null);
        });
      },
    });
  };

  // Custom events for screenshot automation
  useEffect(() => {
    const moveHandler = () => handleShowIconGroupEdit('move');
    const copyHandler = () => handleShowIconGroupEdit('duplicate');
    window.addEventListener('bobcorn:open-move-dialog', moveHandler);
    window.addEventListener('bobcorn:open-copy-dialog', copyHandler);
    return () => {
      window.removeEventListener('bobcorn:open-move-dialog', moveHandler);
      window.removeEventListener('bobcorn:open-copy-dialog', copyHandler);
    };
  });

  // 复制/移动图标相关
  const handleShowIconGroupEdit = (type: string) => {
    if (type === 'duplicate') {
      setIconGroupEditModelType('duplicate');
      setIconGroupEditModelVisible(true);
    }
    if (type === 'move') {
      setIconGroupEditModelType('move');
      setIconGroupEditModelVisible(true);
    }
  };
  const handleEnsureIconGroupEdit = (
    targetGroupId: string,
    opts?: { reassignOutOfRange: boolean }
  ) => {
    if (iconGroupEditModelType === 'duplicate') {
      try {
        db.duplicateIconGroup(selectedIcon, targetGroupId, () => {
          message.success(t('editor.copiedToGroup'));
          syncLeft();
          selectIcon(null);
        });
      } catch (err) {
        if ((err as Error)?.message === 'PUA_EXHAUSTED') {
          message.error(t('editor.codeExhausted'));
        } else {
          throw err;
        }
      }
    }
    if (iconGroupEditModelType === 'move') {
      db.moveIconWithVariants(
        selectedIcon,
        targetGroupId,
        (reassignedCount) => {
          if (reassignedCount && reassignedCount > 0) {
            message.success(t('editor.movedToGroupReassigned', { count: reassignedCount }));
          } else {
            message.success(t('editor.movedToGroup'));
          }
          syncLeft();
          selectIcon(null);
        },
        opts
      );
    }
    setIconGroupEditModelVisible(false);
  };
  const handleCancelIconGroupEdit = () => {
    setIconGroupEditModelVisible(false);
  };

  // Cache group list — re-derive only when groupData subscription changes
  // eslint-disable-next-line react-hooks/exhaustive-deps -- groupData intentionally used as a refresh signal only (not read in the callback), see comment above
  const groupList = useMemo(() => db.getGroupList(), [groupData]);
  const groupPickerGroups: GroupPickerGroup[] = useMemo(
    () => groupList.map((g: any) => ({ id: g.id, groupName: g.groupName, groupIcon: g.groupIcon })),
    [groupList]
  );

  // 目标分组声明的字码区间 (供移动越界内联选择)
  const groupRangeById = useMemo(() => {
    const m = new Map<string, { start: number; end: number }>();
    for (const g of groupList as any[]) {
      if (g.codeRangeStart != null && g.codeRangeEnd != null) {
        m.set(g.id, { start: Number(g.codeRangeStart), end: Number(g.codeRangeEnd) });
      }
    }
    return m;
  }, [groupList]);

  // 待移动图标 (当前单选图标) 落在目标区间外的数量: 0 或 1。
  const getMoveOutOfRangeCount = useCallback(
    (targetGroupId: string): number => {
      const r = groupRangeById.get(targetGroupId);
      if (!r || !selectedIcon) return 0;
      const data = db.getIconData(selectedIcon);
      const dec = parseHex(String(data?.iconCode ?? ''));
      if (dec === null) return 0;
      return dec < r.start || dec > r.end ? 1 : 0;
    },
    [groupRangeById, selectedIcon]
  );

  // 当前图标的已存字码是否落在其所属分组声明的区间之外 (行内提示)
  const codeOutOfGroupRange = useMemo(() => {
    const r = groupRangeById.get(String(iconData?.iconGroup ?? ''));
    if (!r || !iconData?.iconCode) return false;
    const dec = parseHex(String(iconData.iconCode));
    return dec !== null && (dec < r.start || dec > r.end);
  }, [groupRangeById, iconData]);

  const groupNum = groupList.length;

  // 组选择模态框内的变体警告 — 有变体时提示移动/复制会如何处理变体
  const buildGroupPickerWarning = (): React.ReactNode => {
    if (!selectedIcon) return null;
    const guard = checkVariants(selectedIcon);
    if (!guard.hasVariants) return null;
    const key = iconGroupEditModelType === 'duplicate' ? 'variant.copyNote' : 'variant.moveNote';
    return (
      <p className="mb-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
        <TriangleAlert size={13} className="mt-px shrink-0" />
        <span>{t(key, { count: guard.count })}</span>
      </p>
    );
  };

  // 颜色编辑
  const colorSectionRef = useRef<HTMLDivElement>(null);
  // 取色器弹窗的定位锚点（色板行）与弹窗自身节点（经 portal 渲染到 document.body）
  const swatchesRowRef = useRef<HTMLDivElement>(null);
  const pickerPanelRef = useRef<HTMLDivElement>(null);
  const [editingColorIdx, setEditingColorIdx] = useState<number | null>(null);
  const [colorInputValue, setColorInputValue] = useState<string>('');
  const [colorInputError, setColorInputError] = useState<boolean>(false);
  const [originalIconContent, setOriginalIconContent] = useState<string | null>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number; width: number } | null>(
    null
  );

  // 解析 currentColor 为当前主题的实际前景色
  // darkMode 作为依赖确保主题切换时重新解析
  // eslint-disable-next-line react-hooks/exhaustive-deps -- darkMode intentionally used as a refresh signal only (not read in the callback), see comment above
  const resolvedForeground = useMemo(() => resolveCurrentColor(), [darkMode]);

  const svgColors = useMemo(() => {
    if (!iconData.iconContent) return [];
    return extractSvgColors(iconData.iconContent, resolvedForeground);
  }, [iconData.iconContent, resolvedForeground]);

  // 点击颜色区域外部时关闭编辑面板（取色期间跳过；弹窗经 portal 渲染到 body，需一并判定）
  useEffect(() => {
    if (editingColorIdx === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (isPickingRef.current) return;
      const target = e.target as Node;
      if (colorSectionRef.current && colorSectionRef.current.contains(target)) return;
      if (pickerPanelRef.current && pickerPanelRef.current.contains(target)) return;
      setEditingColorIdx(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingColorIdx]);

  // 取色器弹窗定位 —— 经 portal 渲染到 document.body 并用 fixed 定位，
  // 紧邻色板行出现（下方优先，空间不足时翻转到上方），并 clamp 在视口内；
  // 侧栏内容区可滚动，故额外监听 resize/scroll（capture）以保持弹窗跟随色板行
  useLayoutEffect(() => {
    if (editingColorIdx === null) {
      setPickerPos(null);
      return;
    }
    const gap = 6;
    const estimatedHeight = 220;
    const updatePosition = () => {
      const triggerEl = swatchesRowRef.current;
      if (!triggerEl) return;
      const rect = triggerEl.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const placeAbove = spaceBelow < estimatedHeight + gap && spaceAbove >= estimatedHeight + gap;
      let top = placeAbove ? rect.top - estimatedHeight - gap : rect.bottom + gap;
      top = Math.min(Math.max(top, gap), Math.max(gap, window.innerHeight - estimatedHeight - gap));
      const maxLeft = window.innerWidth - rect.width - gap;
      const left = Math.min(Math.max(rect.left, gap), Math.max(gap, maxLeft));
      setPickerPos({ top, left, width: rect.width });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('scroll', updatePosition, true);
    };
  }, [editingColorIdx]);

  // 当切换编辑的颜色时，同步输入框
  useEffect(() => {
    if (editingColorIdx !== null && svgColors[editingColorIdx]) {
      setColorInputValue(svgColors[editingColorIdx].color);
      setColorInputError(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-syncs the input only when the edited swatch index changes, not on every svgColors recompute (e.g. from applying a color), to avoid clobbering in-progress input
  }, [editingColorIdx]);

  const applyColor = useCallback(
    (newColor: string) => {
      if (editingColorIdx === null || !svgColors[editingColorIdx]) return;
      db.ensureOriginalContent(selectedIcon);
      const colorInfo = svgColors[editingColorIdx];
      // currentColor 元素使用精确匹配模式，避免误改无 fill 的隐式黑色元素
      const updatedSvg = colorInfo.isCurrentColor
        ? replaceSvgColor(iconData.iconContent, colorInfo.color, newColor, true)
        : replaceSvgColor(iconData.iconContent, colorInfo.color, newColor);
      const escaped = updatedSvg.replace(/'/g, "''");
      db.setIconData(selectedIcon, { iconContent: `'${escaped}'` });
      sync(selectedIcon);
      syncIconContent();
      patchIconContent(selectedIcon, updatedSvg);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sync` is unmemoized (recreated every render); adding it would trip a separate "wrap in useCallback" warning, so it's intentionally left out (called explicitly with selectedIcon, not read from closure). syncIconContent/patchIconContent are stable store references
    [
      editingColorIdx,
      svgColors,
      iconData.iconContent,
      selectedIcon,
      syncIconContent,
      patchIconContent,
    ]
  );

  const handleColorChange = useCallback(
    (newColor: string) => {
      applyColor(newColor);
      setColorInputValue(newColor);
      setColorInputError(false);
    },
    [applyColor]
  );

  const handleColorInputConfirm = useCallback(() => {
    const hex = parseCssColor(colorInputValue);
    if (hex) {
      applyColor(hex);
      setColorInputError(false);
    } else {
      setColorInputError(true);
    }
  }, [colorInputValue, applyColor]);

  const isPickingRef = useRef(false);

  const handleEyeDropper = useCallback(async () => {
    try {
      isPickingRef.current = true;
      const hex = await (window as any).electronAPI.pickScreenColor();
      isPickingRef.current = false;
      if (hex) {
        applyColor(hex);
        setColorInputValue(hex);
        setColorInputError(false);
      }
    } catch {
      isPickingRef.current = false;
    }
  }, [applyColor]);

  const exportIcons: IconExportTarget[] = useMemo(
    () =>
      iconData
        ? [{ id: iconData.id, iconName: iconData.iconName, iconContent: iconData.iconContent }]
        : [],
    [iconData]
  );

  const colorChanged = originalIconContent !== null && iconData.iconContent !== originalIconContent;

  const handleResetColors = useCallback(() => {
    if (!originalIconContent || !selectedIcon) return;
    const escaped = originalIconContent.replace(/'/g, "''");
    db.setIconData(selectedIcon, { iconContent: `'${escaped}'` });
    sync(selectedIcon);
    syncIconContent();
    patchIconContent(selectedIcon, originalIconContent);
    setEditingColorIdx(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sync` is unmemoized (recreated every render); adding it would trip a separate "wrap in useCallback" warning, so it's intentionally left out (called explicitly with selectedIcon, not read from closure). syncIconContent/patchIconContent are stable store references
  }, [originalIconContent, selectedIcon, syncIconContent, patchIconContent]);

  return (
    <div
      className={cn('relative w-full h-full flex flex-col', 'border-l border-border', 'bg-surface')}
    >
      {/* Win32 title bar spacer — matches IconInfoBar height to clear window controls */}
      {platform() === 'win32' && (
        <div className="w-full h-[58px] shrink-0 border-b border-border [-webkit-app-region:drag]" />
      )}

      {selectedIcon ? (
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
          {/* Icon preview area */}
          <div
            className={cn(
              'flex items-center justify-center',
              'w-full aspect-square max-h-[180px]',
              'mb-4 rounded-xl',
              'bg-surface-muted',
              'border border-border',
              'transition-colors duration-200',
              // SVG sizing within preview
              '[&>svg]:w-3/5 [&>svg]:h-3/5 [&>svg]:transition-transform [&>svg]:duration-300',
              '[&:hover>svg]:scale-110'
            )}
            dangerouslySetInnerHTML={{ __html: sanitizeSVG(iconData.iconContent) }}
          />

          {/* Section: form fields */}
          <div className="mb-4 space-y-3">
            {/* 图标名称输入框 */}
            <EnhanceInput
              autoFocus={false}
              placeholder={t('editor.namePlaceholder')}
              value={iconName}
              onChange={handleIconNameChange}
              onPressEnter={handleIconNameSave}
              inputTitle={t('editor.name')}
              inputHintText={iconNameErrText}
              inputHintBadgeType="error"
              inputSave={iconNameCanSave()}
              inputSaveClick={handleIconNameSave}
            />

            {/* 图标字码输入框 */}
            <EnhanceInput
              autoFocus={false}
              placeholder={t('editor.codePlaceholder')}
              value={iconCode}
              onChange={handleIconCodeChange}
              onPressEnter={handleIconCodeSave}
              inputTitle={t('editor.code')}
              inputHintText={iconCodeErrText}
              inputHintBadgeType="error"
              inputSave={iconCodeCanSave()}
              inputSaveClick={handleIconCodeSave}
            />
            {/* 当前图标的已存字码与其他图标撞码时的警示 (如导入带入) */}
            {!!(iconData.iconCode && duplicateCodes?.[String(iconData.iconCode).toUpperCase()]) && (
              <div
                className={cn(
                  'mt-1.5 flex items-start gap-1.5 rounded-md',
                  'border border-warning/30 bg-warning-subtle px-2 py-1.5'
                )}
              >
                <TriangleAlert size={12} className="text-warning shrink-0 mt-px" />
                <span className="text-[11px] text-foreground leading-snug">
                  {t('editor.codeDuplicateBanner')}
                </span>
              </div>
            )}
            {/* 字码落在所属分组声明的区间之外时的行内提示 + 一键重新分配 */}
            {codeOutOfGroupRange && (
              <div
                className={cn(
                  'mt-1.5 flex items-start gap-1.5 rounded-md',
                  'border border-amber-500/30 bg-amber-500/10 px-2 py-1.5'
                )}
              >
                <TriangleAlert
                  size={12}
                  className="text-amber-600 dark:text-amber-400 shrink-0 mt-px"
                />
                <span className="text-[11px] text-foreground leading-snug flex-1">
                  {t('editor.codeOutOfGroupRange')}
                </span>
                <button
                  type="button"
                  onClick={handleReassignCode}
                  className={cn(
                    'shrink-0 -my-0.5 px-1.5 py-0.5 rounded',
                    'text-xs font-medium',
                    'text-amber-600 dark:text-amber-400',
                    'hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-500/15',
                    'transition-colors duration-150 cursor-pointer'
                  )}
                >
                  {t('editor.reassignCode')}
                </button>
              </div>
            )}
          </div>

          {/* Section: 基本信息 */}
          <div className="mb-4">
            <h4
              className={cn(
                'flex items-center gap-1.5',
                'text-xs font-semibold uppercase tracking-wider',
                'text-foreground-muted',
                'mb-2 pb-1.5',
                'border-b border-border'
              )}
            >
              <Info size={12} />
              {t('editor.basicInfo')}
            </h4>
            <div className="space-y-1">
              {[
                [t('editor.group'), db.getGroupName(iconData.iconGroup)],
                [t('editor.originalSize'), `${(iconData.iconSize / 512).toFixed(2)} KB`],
                [t('editor.fileFormat'), iconData.iconType && iconData.iconType.toUpperCase()],
                [t('editor.createDate'), iconData.createTime],
                [t('editor.updateDate'), iconData.updateTime],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className={cn('flex items-center justify-between', 'text-xs py-0.5')}
                >
                  <span className="text-foreground-muted">{label}</span>
                  <span className="text-foreground font-medium truncate ml-2 max-w-[120px] text-right">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section: 颜色编辑 */}
          {svgColors.length > 0 && (
            <div className="mb-4">
              <h4
                className={cn(
                  'flex items-center gap-1.5',
                  'text-xs font-semibold uppercase tracking-wider',
                  'text-foreground-muted',
                  'mb-2 pb-1.5',
                  'border-b border-border'
                )}
              >
                <Palette size={12} />
                {t('editor.color')}
                {colorChanged && (
                  <button
                    onClick={handleResetColors}
                    className={cn(
                      'ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded',
                      'text-[10px] font-medium normal-case tracking-normal',
                      'text-foreground-muted hover:text-foreground',
                      'border border-border hover:border-foreground-subtle',
                      'hover:bg-surface-accent',
                      'transition-colors duration-150 cursor-pointer'
                    )}
                  >
                    <RefreshCw size={10} />
                    {t('editor.resetColors')}
                  </button>
                )}
              </h4>
              <div ref={colorSectionRef}>
                <div ref={swatchesRowRef} className="flex flex-wrap gap-1.5 mb-2">
                  {svgColors.map((c, i) => (
                    <button
                      key={`${c.color}-${c.isCurrentColor}`}
                      title={
                        c.isCurrentColor ? `${c.color} · ${t('editor.colorFollowsTheme')}` : c.color
                      }
                      onClick={() => setEditingColorIdx(editingColorIdx === i ? null : i)}
                      className={cn(
                        'relative w-7 h-7 rounded-md border-2 transition-all duration-150',
                        'hover:scale-110 hover:shadow-md',
                        editingColorIdx === i
                          ? 'border-accent ring-2 ring-ring/30 scale-110'
                          : 'border-border'
                      )}
                      style={{ backgroundColor: c.color }}
                    >
                      {c.isCurrentColor && (
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5',
                            'w-2.5 h-2.5 rounded-full',
                            'ring-1 ring-border',
                            'shadow-sm'
                          )}
                          style={{
                            background: 'linear-gradient(135deg, #f0f0f0 50%, #222 50%)',
                          }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              {editingColorIdx !== null &&
                svgColors[editingColorIdx] &&
                pickerPos &&
                createPortal(
                  <div
                    ref={pickerPanelRef}
                    style={{
                      position: 'fixed',
                      top: pickerPos.top,
                      left: pickerPos.left,
                      width: pickerPos.width,
                    }}
                    className={cn(
                      'z-50',
                      'rounded-lg border border-border',
                      'bg-surface',
                      'shadow-lg',
                      'p-3'
                    )}
                  >
                    <HexColorPicker
                      color={svgColors[editingColorIdx].color}
                      onChange={handleColorChange}
                      style={{ width: '100%', height: 140 }}
                    />
                    {/* 颜色值输入框 — 支持 hex/rgb/hsl/hwb 等任意 CSS 颜色格式 */}
                    <div className="mt-2 flex gap-1.5 items-center">
                      <input
                        type="text"
                        value={colorInputValue}
                        onChange={(e) => {
                          setColorInputValue(e.target.value);
                          setColorInputError(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleColorInputConfirm();
                        }}
                        onBlur={handleColorInputConfirm}
                        placeholder="hex / rgb / hsl / hwb"
                        className={cn(
                          'flex-1 min-w-0 px-2 py-1 rounded text-xs font-mono',
                          'bg-surface',
                          'border transition-colors duration-150',
                          'outline-none focus:ring-1',
                          colorInputError
                            ? 'border-danger focus:ring-danger/30'
                            : 'border-border focus:ring-ring/30',
                          'text-foreground',
                          'placeholder:text-foreground-muted/50'
                        )}
                      />
                      {/* 取色器按钮 */}
                      <button
                        title={t('editor.eyeDropper')}
                        onClick={handleEyeDropper}
                        className={cn(
                          'w-7 h-7 rounded border border-border shrink-0',
                          'flex items-center justify-center',
                          'bg-surface hover:bg-surface-accent',
                          'transition-colors duration-150',
                          'text-foreground-muted hover:text-foreground',
                          'cursor-pointer'
                        )}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m2 22 1-1h3l9-9" />
                          <path d="M3 21v-3l9-9" />
                          <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3L15 6" />
                        </svg>
                      </button>
                      {/* 颜色预览色块 */}
                      <div
                        className="w-7 h-7 rounded border border-border shrink-0"
                        style={{ backgroundColor: colorInputValue }}
                      />
                    </div>
                  </div>,
                  document.body
                )}
            </div>
          )}

          {/* Section: 变体 */}
          {selectedIcon && iconData.id && (
            <VariantPanel
              iconId={iconData.id}
              iconName={iconData.iconName}
              iconContent={iconData.iconContent}
              isVariant={!!iconData.variantOf}
            />
          )}

          {/* Section: 操作 */}
          <div className="mb-4">
            <h4
              className={cn(
                'flex items-center gap-1.5',
                'text-xs font-semibold uppercase tracking-wider',
                'text-foreground-muted',
                'mb-2 pb-1.5',
                'border-b border-border'
              )}
            >
              <Wrench size={12} />
              {t('editor.operations')}
            </h4>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                size="small"
                className="!w-full"
                icon={<RefreshCw size={12} />}
                onClick={handleIconContentUpdate}
              >
                {t('editor.replace')}
              </Button>
              <Button
                size="small"
                className="!w-full"
                icon={<Trash2 size={12} />}
                onClick={
                  selectedGroup === 'resource-recycleBin' ? handleIconDelete : handleIconRecycle
                }
              >
                {selectedGroup === 'resource-recycleBin' ? t('editor.delete') : t('editor.recycle')}
              </Button>
              <Button
                size="small"
                disabled={groupNum === 0}
                className="!w-full"
                icon={<Copy size={12} />}
                onClick={() => handleShowIconGroupEdit('duplicate')}
              >
                {t('editor.copy')}
              </Button>
              <Button
                size="small"
                disabled={groupNum === 0}
                className="!w-full"
                icon={<ArrowRightLeft size={12} />}
                onClick={() => handleShowIconGroupEdit('move')}
              >
                {t('editor.move')}
              </Button>
            </div>
          </div>

          {/* Section: 导出 */}
          <div className="mb-2">
            <h4
              className={cn(
                'flex items-center gap-1.5',
                'text-xs font-semibold uppercase tracking-wider',
                'text-foreground-muted',
                'mb-2 pb-1.5',
                'border-b border-border'
              )}
            >
              <Download size={12} />
              {t('editor.export')}
            </h4>
            <Button
              size="small"
              className="!w-full"
              icon={<Download size={12} />}
              onClick={handleIconExport}
            >
              {t('iconExport.exportIconFiles')}
            </Button>
            <p className="text-[11px] text-foreground-muted mt-1">
              {t('iconExport.exportDescription')}
            </p>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'flex-1 flex flex-col items-center justify-center',
            'text-foreground-muted',
            '[-webkit-app-region:drag]'
          )}
        >
          <img className="w-[120px] mb-3 opacity-60" src={selectedIconHint} alt="" />
          <p className="text-sm text-foreground-muted">{t('editor.selectIconHint')}</p>
          <p className="text-xs text-foreground-muted/60 mt-1">{t('editor.editPropsHint')}</p>
        </div>
      )}

      {/* 组选择模态框 */}
      <GroupPickerDialog
        open={iconGroupEditModelVisible}
        onOpenChange={(open) => !open && handleCancelIconGroupEdit()}
        mode={iconGroupEditModelType === 'duplicate' ? 'copy' : 'move'}
        groups={groupPickerGroups}
        currentGroupId={iconData.iconGroup}
        initialTargetId={selectedGroup}
        warning={buildGroupPickerWarning()}
        getOutOfRangeCount={getMoveOutOfRangeCount}
        onConfirm={handleEnsureIconGroupEdit}
      />

      <IconExportDialog
        visible={exportDialogVisible}
        onClose={() => setExportDialogVisible(false)}
        icons={exportIcons}
      />
    </div>
  );
});

export default SideEditor;
