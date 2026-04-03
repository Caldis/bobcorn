// Electron API (via preload contextBridge)
const { electronAPI } = window;
// React
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
// UI
import { Dialog, Button, message, confirm } from '../ui';
import { Radio, RadioGroup } from '../ui/radio';
// Color picker
import { HexColorPicker } from 'react-colorful';
import { RefreshCw, Download, Trash2, Copy, ArrowRightLeft } from 'lucide-react';
// Components
import EnhanceInput from '../enhance/input';
// Utils
import { cn } from '../../lib/utils';
import { sanitizeSVG } from '../../utils/sanitize';
import { extractSvgColors, replaceSvgColor, parseCssColor } from '../../utils/svg/colors';
import { platform } from '../../utils/tools';
// Database
import db from '../../database';
// Images
import selectedIconHint from '../../resources/imgs/nodata/selectedIconHint.png';
// Store
import useAppStore from '../../store';

const radioStyle: React.CSSProperties = {};

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

  const [iconData, setIconData] = useState<IconDataRecord>({} as IconDataRecord);
  const [iconName, setIconName] = useState<string | null>(null);
  const [iconNameErrText, setIconNameErrText] = useState<string | null>(null);
  const [iconCode, setIconCode] = useState<string | null>(null);
  const [iconCodeErrText, setIconCodeErrText] = useState<string | null>(null);
  const [iconGroupEditModelType, setIconGroupEditModelType] = useState<string | null>(null);
  const [iconGroupEditModelTitle, setIconGroupEditModelTitle] = useState<string | null>(null);
  const [iconGroupEditModelVisible, setIconGroupEditModelVisible] = useState<boolean>(false);
  const [iconGroupEditModelTarget, setIconGroupEditModelTarget] = useState<string | null>(
    selectedGroup || null
  );

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
      setIconGroupEditModelTarget(selectedGroup);
    }
  };

  useEffect(() => {
    if (selectedIcon) {
      sync(selectedIcon);
    }
  }, []);

  // Subscribe to store changes to trigger re-sync
  const groupData = useAppStore((state: any) => state.groupData);
  const iconContentVersion = useAppStore((state: any) => state.iconContentVersion);
  useEffect(() => {
    if (selectedIcon) {
      sync(selectedIcon);
    }
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
          sync(selectedIcon);
        });
      }
    } else {
      setIconCodeErrText(t('editor.codeEmpty'));
    }
  };

  // 替换图标相关
  const handleIconContentUpdate = async () => {
    const result = await electronAPI.showOpenDialog({
      title: t('editor.selectSvgFile'),
      filters: [{ name: t('editor.svgFileFilter'), extensions: ['svg'] }],
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const newIconFileData = Object.assign({}, iconData, { path: result.filePaths[0] });
      db.renewIconData(selectedIcon, newIconFileData, () => {
        message.success(t('editor.dataUpdated'));
        syncIconContent();
      });
    }
  };

  // 图标导出相关
  const handleIconExport = async () => {
    const result = await electronAPI.showSaveDialog({
      title: t('editor.exportIcon'),
      defaultPath: `${iconData.iconName}.${iconData.iconType}`,
    });
    if (!result.canceled && result.filePath) {
      electronAPI
        .writeFile(result.filePath, iconData.iconContent)
        .then(() => message.success(t('editor.exported')))
        .catch((err: Error) => message.error(t('editor.exportError', { error: err.message })));
    }
  };
  const handleAllIconExport = async () => {
    const result = await electronAPI.showSaveDialog({
      title: t('editor.exportAllIcons'),
      defaultPath: `${db.getProjectName()}`,
    });
    if (!result.canceled && result.filePath) {
      const dirPath = result.filePath;
      if (!electronAPI.accessSync(dirPath)) {
        electronAPI.mkdirSync(dirPath);
      }
      try {
        const icons = db.getIconList();
        icons.forEach((icon: any) => {
          electronAPI.writeFileSync(
            `${dirPath}/${icon.iconName}-${icon.iconCode}.${icon.iconType}`,
            icon.iconContent
          );
        });
        message.success(t('editor.allExported', { count: icons.length }));
      } catch (err: any) {
        message.error(t('editor.exportError', { error: err.message }));
      }
    }
  };

  // 删除图标相关
  const handleIconRecycle = () => {
    confirm({
      title: t('editor.recycleTitle'),
      content: t('editor.recycleContent'),
      onOk() {
        db.moveIconGroup(selectedIcon, 'resource-recycleBin', () => {
          message.success(t('editor.recycled'));
          syncLeft();
          selectIcon(null);
        });
      },
    });
  };
  const handleIconDelete = () => {
    confirm({
      title: t('editor.deleteTitle'),
      content: t('editor.deleteContent'),
      onOk() {
        db.delIcon(selectedIcon, () => {
          message.success(t('editor.deleted'));
          syncLeft();
          selectIcon(null);
        });
      },
    });
  };

  // 复制/移动图标相关
  const handleShowIconGroupEdit = (type: string) => {
    if (type === 'duplicate') {
      setIconGroupEditModelType('duplicate');
      setIconGroupEditModelTitle(t('editor.copyToGroup'));
      setIconGroupEditModelVisible(true);
      setIconGroupEditModelTarget(
        selectedGroup === 'resource-uncategorized' ? null : iconGroupEditModelTarget
      );
    }
    if (type === 'move') {
      setIconGroupEditModelType('move');
      setIconGroupEditModelTitle(t('editor.moveToGroup'));
      setIconGroupEditModelVisible(true);
      setIconGroupEditModelTarget(
        selectedGroup === 'resource-uncategorized' ? null : iconGroupEditModelTarget
      );
    }
  };
  const handleEnsureIconGroupEdit = () => {
    if (iconGroupEditModelType === 'duplicate') {
      db.duplicateIconGroup(selectedIcon, iconGroupEditModelTarget, () => {
        message.success(t('editor.copiedToGroup'));
        syncLeft();
        selectIcon(null);
      });
    }
    if (iconGroupEditModelType === 'move') {
      db.moveIconGroup(selectedIcon, iconGroupEditModelTarget, () => {
        message.success(t('editor.movedToGroup'));
        syncLeft();
        selectIcon(null);
      });
    }
    setIconGroupEditModelVisible(false);
  };
  const handleCancelIconGroupEdit = () => {
    setIconGroupEditModelVisible(false);
  };
  const onTargetGroupChange = (e: { target: { value: any } }) => {
    setIconGroupEditModelTarget(e.target.value);
  };

  // Cache group list — re-derive only when groupData subscription changes
  const groupList = useMemo(() => db.getGroupList(), [groupData]);

  // 构建模态框内的分组列表
  const buildSelectableGroupList = () => {
    return groupList.map((group: any) => {
      return (
        <Radio key={group.id} style={radioStyle} value={group.id}>
          {group.groupName}
        </Radio>
      );
    });
  };

  const groupNum = groupList.length;

  // 颜色编辑
  const colorSectionRef = useRef<HTMLDivElement>(null);
  const [editingColorIdx, setEditingColorIdx] = useState<number | null>(null);
  const [colorInputValue, setColorInputValue] = useState<string>('');
  const [colorInputError, setColorInputError] = useState<boolean>(false);
  const [originalIconContent, setOriginalIconContent] = useState<string | null>(null);

  const svgColors = useMemo(() => {
    if (!iconData.iconContent) return [];
    return extractSvgColors(iconData.iconContent);
  }, [iconData.iconContent]);

  // 点击颜色区域外部时关闭编辑面板（取色期间跳过）
  useEffect(() => {
    if (editingColorIdx === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (isPickingRef.current) return;
      if (colorSectionRef.current && !colorSectionRef.current.contains(e.target as Node)) {
        setEditingColorIdx(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingColorIdx]);

  // 当切换编辑的颜色时，同步输入框
  useEffect(() => {
    if (editingColorIdx !== null && svgColors[editingColorIdx]) {
      setColorInputValue(svgColors[editingColorIdx].color);
      setColorInputError(false);
    }
  }, [editingColorIdx]);

  const applyColor = useCallback(
    (newColor: string) => {
      if (editingColorIdx === null || !svgColors[editingColorIdx]) return;
      db.ensureOriginalContent(selectedIcon);
      const oldColor = svgColors[editingColorIdx].color;
      const updatedSvg = replaceSvgColor(iconData.iconContent, oldColor, newColor);
      const escaped = updatedSvg.replace(/'/g, "''");
      db.setIconData(selectedIcon, { iconContent: `'${escaped}'` });
      sync(selectedIcon);
      syncIconContent();
      patchIconContent(selectedIcon, updatedSvg);
    },
    [editingColorIdx, svgColors, iconData.iconContent, selectedIcon]
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

  const colorChanged = originalIconContent !== null && iconData.iconContent !== originalIconContent;

  const handleResetColors = useCallback(() => {
    if (!originalIconContent || !selectedIcon) return;
    const escaped = originalIconContent.replace(/'/g, "''");
    db.setIconData(selectedIcon, { iconContent: `'${escaped}'` });
    sync(selectedIcon);
    syncIconContent();
    patchIconContent(selectedIcon, originalIconContent);
    setEditingColorIdx(null);
  }, [originalIconContent, selectedIcon]);

  return (
    <div
      className={cn('relative w-full h-full flex flex-col', 'border-l border-border', 'bg-surface')}
    >
      {/* Win32 title bar spacer */}
      {platform() === 'win32' && <div className="w-full h-5 shrink-0" />}

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
          </div>

          {/* Section: 基本信息 */}
          <div className="mb-4">
            <h4
              className={cn(
                'text-xs font-semibold uppercase tracking-wider',
                'text-foreground-muted',
                'mb-2 pb-1.5',
                'border-b border-border'
              )}
            >
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
            <div className="mb-4" ref={colorSectionRef}>
              <h4
                className={cn(
                  'text-xs font-semibold uppercase tracking-wider',
                  'text-foreground-muted',
                  'mb-2 pb-1.5',
                  'border-b border-border'
                )}
              >
                {t('editor.color')}
              </h4>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {svgColors.map((c, i) => (
                  <button
                    key={c.color}
                    title={c.color}
                    onClick={() => setEditingColorIdx(editingColorIdx === i ? null : i)}
                    className={cn(
                      'w-7 h-7 rounded-md border-2 transition-all duration-150',
                      'hover:scale-110 hover:shadow-md',
                      editingColorIdx === i
                        ? 'border-accent ring-2 ring-ring/30 scale-110'
                        : 'border-border'
                    )}
                    style={{ backgroundColor: c.color }}
                  />
                ))}
              </div>
              {editingColorIdx !== null && svgColors[editingColorIdx] && (
                <div
                  className={cn(
                    'absolute left-0 right-0 z-50 mx-3',
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
                </div>
              )}
              {colorChanged && (
                <button
                  onClick={handleResetColors}
                  className={cn(
                    'mt-2 w-full py-1 rounded text-xs',
                    'border border-border',
                    'text-foreground-muted hover:text-foreground',
                    'bg-surface hover:bg-surface-accent',
                    'transition-colors duration-150 cursor-pointer'
                  )}
                >
                  {t('editor.resetColors')}
                </button>
              )}
            </div>
          )}

          {/* Section: 高级操作 */}
          <div className="mb-2">
            <h4
              className={cn(
                'text-xs font-semibold uppercase tracking-wider',
                'text-foreground-muted',
                'mb-2 pb-1.5',
                'border-b border-border'
              )}
            >
              {t('editor.advancedOps')}
            </h4>
            <Button className="!w-full" icon={<Download size={14} />} onClick={handleIconExport}>
              {t('editor.export')}
            </Button>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <Button
                className="!w-full"
                icon={<RefreshCw size={14} />}
                onClick={handleIconContentUpdate}
              >
                {t('editor.replace')}
              </Button>
              <Button
                className="!w-full"
                icon={<Trash2 size={14} />}
                onClick={
                  selectedGroup === 'resource-recycleBin' ? handleIconDelete : handleIconRecycle
                }
              >
                {selectedGroup === 'resource-recycleBin' ? t('editor.delete') : t('editor.recycle')}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <Button
                disabled={groupNum === 0}
                className="!w-full"
                icon={<Copy size={14} />}
                onClick={() => handleShowIconGroupEdit('duplicate')}
              >
                {t('editor.copy')}
              </Button>
              <Button
                disabled={groupNum === 0}
                className="!w-full"
                icon={<ArrowRightLeft size={14} />}
                onClick={() => handleShowIconGroupEdit('move')}
              >
                {t('editor.move')}
              </Button>
            </div>
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
          <p className="text-sm mb-1">{t('editor.selectIconHint')}</p>
          <p className="text-xs">{t('editor.editPropsHint')}</p>
        </div>
      )}

      {/* 组选择模态框 */}
      <Dialog
        open={iconGroupEditModelVisible}
        onClose={handleCancelIconGroupEdit}
        title={iconGroupEditModelTitle}
        footer={[
          <Button key="cancel" onClick={handleCancelIconGroupEdit}>
            {t('common.cancel')}
          </Button>,
          <Button
            disabled={
              iconGroupEditModelTarget === 'resource-uncategorized' ||
              iconGroupEditModelTarget === 'resource-all' ||
              !iconGroupEditModelTarget
            }
            key="ensure"
            type="primary"
            onClick={handleEnsureIconGroupEdit}
          >
            {t('common.confirm')}
          </Button>,
        ]}
      >
        <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2">
          {iconGroupEditModelType === 'duplicate' && (
            <p className="mb-2 text-xs text-foreground-muted">{t('editor.duplicateHint')}</p>
          )}
          <RadioGroup onChange={onTargetGroupChange} value={iconGroupEditModelTarget}>
            {buildSelectableGroupList()}
          </RadioGroup>
        </div>
      </Dialog>
    </div>
  );
});

export default SideEditor;
