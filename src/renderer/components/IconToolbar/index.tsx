// React
import React, { useState } from 'react';
// i18n
import { useTranslation } from 'react-i18next';
// UI
import { Button, Slider, Switch } from '../ui';
import { RadioGroup, RadioButton } from '../ui/radio';
import {
  X,
  Eye,
  Search,
  ToggleLeft,
  ToggleRight,
  CheckSquare,
  CheckCircle,
  XCircle,
} from 'lucide-react';
// Utils
import { cn } from '../../lib/utils';
// Store
import useAppStore from '../../store';

interface IconToolbarProps {
  defaultIconWidth?: number;
  updateIconWidth?: (width: number) => void;
  defaultNameVisible?: boolean;
  updateNameVisible?: (visible: boolean) => void;
  defaultCodeVisible?: boolean;
  updateCodeVisible?: (visible: boolean) => void;
  updateSearchKeyword?: (keyword: string) => void;
  visibleIconIds?: string[];
}

function IconToolbar({
  defaultIconWidth = 100,
  updateIconWidth = () => {},
  defaultNameVisible = true,
  updateNameVisible = () => {},
  defaultCodeVisible = true,
  updateCodeVisible = () => {},
  updateSearchKeyword = () => {},
  visibleIconIds = [],
}: IconToolbarProps) {
  const { t } = useTranslation();
  const batchMode = useAppStore((state: any) => state.batchMode);
  const selectedIcons = useAppStore((state: any) => state.selectedIcons);
  const toggleBatchMode = useAppStore((state: any) => state.toggleBatchMode);
  const selectAllIcons = useAppStore((state: any) => state.selectAllIcons);
  const invertSelection = useAppStore((state: any) => state.invertSelection);
  const clearBatchSelection = useAppStore((state: any) => state.clearBatchSelection);

  const [orderType, setOrderType] = useState<string>('addTime');
  const [orderDirection, setOrderDirection] = useState<string>('forward');
  const [showActionBar, setShowActionBar] = useState<boolean>(false);
  const [actionBarType, setActionBarType] = useState<string | null>(null);
  const [showName, setShowName] = useState<boolean>(defaultNameVisible);
  const [showCode, setShowCode] = useState<boolean>(defaultCodeVisible);

  // 控制动作条可见性
  const handleToggleActionBar = (type: string) => {
    setShowActionBar(actionBarType === type ? !showActionBar : true);
    setActionBarType(type);
  };
  const handelHideActionBar = () => {
    setShowActionBar(false);
    setActionBarType(null);
  };

  // 控制图标名字可见性
  const handleNameVisibilityChange = (e: { target: { value: any } }) => {
    setShowName(e.target.value);
    updateNameVisible(e.target.value);
  };
  // 控制图标字码可见性
  const handleCodeVisibilityChange = (e: { target: { value: any } }) => {
    setShowCode(e.target.value);
    updateCodeVisible(e.target.value);
  };
  // 排序动作条相关
  const handleOrderTypeChange = (e: { target: { value: any } }) => {
    setOrderType(e.target.value);
  };
  const handleOrderDirectionChange = (e: { target: { value: any } }) => {
    setOrderDirection(e.target.value);
  };

  // 控制图标大小
  const handleIconWidthChange = (value: number) => {
    updateIconWidth(value);
  };
  // 格式化滑动条提示
  const iconWidthControllerTipFormatter = (value?: number) => {
    return `${(value ?? 100) - 50}%`;
  };

  const showBatchControls = batchMode || selectedIcons.size > 0;

  return (
    <div className="relative w-full h-[49px] pb-1 border-t border-border">
      {/* 过滤控制器浮层 */}
      <div
        className={cn(
          'absolute w-full h-10 -mt-[40px]',
          'flex flex-row items-center',
          'px-2 pt-px',
          'border-y border-border',
          'transition-all duration-300',
          'bg-surface/80 dark:bg-surface/80'
        )}
        style={{
          opacity: showActionBar ? 1 : 0,
          pointerEvents: showActionBar ? 'initial' : 'none',
          backdropFilter: showActionBar ? 'blur(12px)' : 'blur(0)',
        }}
      >
        {actionBarType === 'visual' && (
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-foreground">
              <span>{t('toolbar.iconName')}</span>
              <Switch
                size="small"
                checked={showName}
                onChange={(checked) => {
                  setShowName(checked);
                  updateNameVisible(checked);
                }}
              />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-foreground">
              <span>{t('toolbar.iconCode')}</span>
              <Switch
                size="small"
                checked={showCode}
                onChange={(checked) => {
                  setShowCode(checked);
                  updateCodeVisible(checked);
                }}
              />
            </label>
          </div>
        )}
        {actionBarType === 'order' && (
          <div className="flex items-center gap-2">
            <RadioGroup value={orderType} onChange={handleOrderTypeChange}>
              <RadioButton value="addTime">{t('toolbar.sortByAddTime')}</RadioButton>
              <RadioButton value="editTime">{t('toolbar.sortByEditTime')}</RadioButton>
              <RadioButton value="name">{t('toolbar.sortByName')}</RadioButton>
              <RadioButton value="code">{t('toolbar.sortByCode')}</RadioButton>
              <RadioButton value="size">{t('toolbar.sortBySize')}</RadioButton>
            </RadioGroup>
            <RadioGroup value={orderDirection} onChange={handleOrderDirectionChange}>
              <RadioButton value="forward">{t('toolbar.ascending')}</RadioButton>
              <RadioButton value="reverse">{t('toolbar.descending')}</RadioButton>
            </RadioGroup>
          </div>
        )}
        <div className="ml-auto">
          <Button
            className="absolute right-1.5 top-1.5 !border-none !bg-transparent hover:!bg-transparent active:!bg-transparent"
            shape="circle"
            icon={<X size={14} />}
            onClick={handelHideActionBar}
          />
        </div>
      </div>

      {/* 主工具栏 */}
      <div className="h-full flex flex-row items-center">
        {/* 图标显示控制按钮 */}
        <div className="flex flex-row px-1.5">
          <div className="pr-1.5">
            <Button
              shape="circle"
              icon={<Eye size={16} />}
              onClick={() => handleToggleActionBar('visual')}
            />
          </div>
        </div>

        {/* 图标大小 Slider */}
        <div className="flex-grow">
          <Slider
            defaultValue={defaultIconWidth}
            min={50}
            max={150}
            tooltip={{ formatter: iconWidthControllerTipFormatter }}
            onChange={handleIconWidthChange}
          />
        </div>

        {/* 批量模式控制 */}
        <div className="flex items-center gap-0.5 ml-2">
          <button
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
              batchMode
                ? 'bg-brand-500 text-white'
                : 'text-foreground-muted hover:text-foreground hover:bg-surface-accent'
            )}
            onClick={toggleBatchMode}
            title={t('toolbar.batchMode')}
          >
            {batchMode ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            {t('toolbar.batch')}
          </button>

          {showBatchControls && (
            <>
              <button
                className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded text-xs text-foreground-muted hover:text-foreground hover:bg-surface-accent"
                onClick={() => selectAllIcons(visibleIconIds)}
                title={t('toolbar.selectAll')}
              >
                <CheckSquare size={12} /> {t('toolbar.selectAll')}
              </button>
              <button
                className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded text-xs text-foreground-muted hover:text-foreground hover:bg-surface-accent"
                onClick={() => invertSelection(visibleIconIds)}
                title={t('toolbar.invertSelection')}
              >
                <CheckCircle size={12} /> {t('toolbar.invertSelection')}
              </button>
              {selectedIcons.size > 0 && (
                <button
                  className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded text-xs text-foreground-muted hover:text-foreground hover:bg-surface-accent"
                  onClick={clearBatchSelection}
                  title={t('toolbar.cancelAll')}
                >
                  <XCircle size={12} /> {t('toolbar.cancel')}
                </button>
              )}
            </>
          )}
        </div>

        {/* 搜索栏 */}
        <div className="ml-2 mr-1.5">
          <div className="relative">
            <Search
              size={12}
              className={cn(
                'absolute left-2.5 top-1/2 -translate-y-1/2 z-10',
                'text-foreground-muted/60',
                'pointer-events-none'
              )}
            />
            <input
              type="text"
              placeholder={t('toolbar.search')}
              onChange={(e) => updateSearchKeyword(e.target.value)}
              className={cn(
                'w-48 h-8 pl-7 pr-3 py-1',
                'rounded-md border border-border',
                'bg-surface-muted/50 dark:bg-surface-muted',
                'text-sm text-foreground placeholder:text-foreground-muted/50',
                'outline-none',
                'transition-all duration-200',
                'focus:border-brand-400 focus:ring-2 focus:ring-ring/30',
                'dark:focus:border-brand-500 dark:focus:ring-ring/20'
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default IconToolbar;
