// React
import React, { useState } from 'react';
// i18n
import { useTranslation } from 'react-i18next';
// UI
import { Button, Slider, Switch } from '../ui';
import { RadioGroup, RadioButton } from '../ui/radio';
import {
  X,
  SlidersHorizontal,
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
import useAppStore, { analyticsTrack } from '../../store';

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
  const iconSortField = useAppStore((state: any) => state.iconSortField);
  const iconSortDirection = useAppStore((state: any) => state.iconSortDirection);
  const setIconSortField = useAppStore((state: any) => state.setIconSortField);
  const setIconSortDirection = useAppStore((state: any) => state.setIconSortDirection);
  const filterOutOfRange = useAppStore((state: any) => state.filterOutOfRange);
  const setFilterOutOfRange = useAppStore((state: any) => state.setFilterOutOfRange);

  const [showActionBar, setShowActionBar] = useState<boolean>(false);
  const [showName, setShowName] = useState<boolean>(defaultNameVisible);
  const [showCode, setShowCode] = useState<boolean>(defaultCodeVisible);

  // 控制显示/排序面板可见性（同一入口，二次点击收起）
  const handleToggleActionBar = () => {
    setShowActionBar((prev) => !prev);
  };
  const handelHideActionBar = () => {
    setShowActionBar(false);
  };

  // 排序字段/方向变更
  const handleSortFieldChange = (e: { target: { value: any } }) => {
    setIconSortField(e.target.value);
    analyticsTrack('toolbar.action', { action: 'sortField', value: e.target.value });
  };
  const handleSortDirectionChange = (e: { target: { value: any } }) => {
    setIconSortDirection(e.target.value);
    analyticsTrack('toolbar.action', { action: 'sortDirection', value: e.target.value });
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
      {/* 显示与排序控制浮层 */}
      <div
        className={cn(
          'absolute left-0 bottom-full w-full min-h-10',
          'flex flex-row flex-wrap items-center gap-y-2',
          'px-2 py-1.5 pr-8',
          'border-y border-border',
          'transition-[opacity,transform,backdrop-filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          'bg-surface/80'
        )}
        style={{
          opacity: showActionBar ? 1 : 0,
          transform: showActionBar ? 'translateY(0)' : 'translateY(8px)',
          pointerEvents: showActionBar ? 'initial' : 'none',
          backdropFilter: showActionBar ? 'blur(12px)' : 'blur(0)',
        }}
      >
        {/* 小节：显示 */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-foreground-muted/70">{t('toolbar.sectionDisplay')}</span>
          <label className="flex items-center gap-1.5 text-xs text-foreground">
            <span>{t('toolbar.iconName')}</span>
            <Switch
              size="small"
              checked={showName}
              onChange={(checked) => {
                setShowName(checked);
                updateNameVisible(checked);
                analyticsTrack('toolbar.action', { action: 'toggleNames' });
              }}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-foreground">
            <span>{t('toolbar.iconCode')}</span>
            <Switch
              size="small"
              checked={showCode}
              onChange={(checked) => {
                setShowCode(checked);
                updateCodeVisible(checked);
                analyticsTrack('toolbar.action', { action: 'toggleCodes' });
              }}
            />
          </label>
        </div>

        <div className="w-px h-4 bg-border mx-3 shrink-0" />

        {/* 小节：排序 */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-foreground-muted/70">{t('toolbar.sectionSort')}</span>
          <RadioGroup direction="row" value={iconSortField} onChange={handleSortFieldChange}>
            <RadioButton value="createTime">{t('toolbar.sortByCreateTime')}</RadioButton>
            <RadioButton value="updateTime">{t('toolbar.sortByUpdateTime')}</RadioButton>
            <RadioButton value="iconCode">{t('toolbar.sortByIconCode')}</RadioButton>
            <RadioButton value="iconName">{t('toolbar.sortByIconName')}</RadioButton>
          </RadioGroup>
          <RadioGroup
            direction="row"
            value={iconSortDirection}
            onChange={handleSortDirectionChange}
          >
            <RadioButton value="asc">{t('toolbar.ascending')}</RadioButton>
            <RadioButton value="desc">{t('toolbar.descending')}</RadioButton>
          </RadioGroup>
        </div>

        <div className="w-px h-4 bg-border mx-3 shrink-0" />

        {/* 小节：筛选 */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-foreground-muted/70">{t('toolbar.sectionFilter')}</span>
          <label className="flex items-center gap-1.5 text-xs text-foreground">
            <span>{t('toolbar.filterOutOfRange')}</span>
            <Switch
              size="small"
              checked={filterOutOfRange}
              onChange={(checked) => {
                setFilterOutOfRange(checked);
                analyticsTrack('toolbar.action', { action: 'filterOutOfRange', value: checked });
              }}
            />
          </label>
        </div>

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
        {/* 图标显示 / 排序控制按钮 */}
        <div className="flex flex-row px-1.5">
          <div className="pr-1.5">
            <Button
              shape="circle"
              icon={<SlidersHorizontal size={16} />}
              onClick={handleToggleActionBar}
              title={t('toolbar.displaySortTooltip')}
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
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground-muted hover:text-foreground hover:bg-surface-accent'
            )}
            onClick={() => {
              toggleBatchMode();
              analyticsTrack('batch.toggle');
            }}
            title={t('toolbar.batchMode')}
          >
            {batchMode ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            {t('toolbar.batch')}
          </button>

          {/* 展开/收缩过渡：grid-template-columns 0fr↔1fr + opacity，纯 CSS 曲线过渡，收起时不卸载 DOM */}
          <div
            className={cn(
              'grid overflow-hidden',
              'transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
              showBatchControls
                ? 'grid-cols-[1fr] opacity-100'
                : 'grid-cols-[0fr] opacity-0 pointer-events-none'
            )}
          >
            <div className="min-w-0 overflow-hidden flex items-center gap-0.5">
              <button
                className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-1 rounded text-xs text-foreground-muted hover:text-foreground hover:bg-surface-accent"
                onClick={() => {
                  selectAllIcons(visibleIconIds);
                  analyticsTrack('toolbar.action', { action: 'selectAll' });
                }}
                title={t('toolbar.selectAll')}
              >
                <CheckSquare size={12} /> {t('toolbar.selectAll')}
              </button>
              <button
                className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-1 rounded text-xs text-foreground-muted hover:text-foreground hover:bg-surface-accent"
                onClick={() => {
                  invertSelection(visibleIconIds);
                  analyticsTrack('toolbar.action', { action: 'invertSelection' });
                }}
                title={t('toolbar.invertSelection')}
              >
                <CheckCircle size={12} /> {t('toolbar.invertSelection')}
              </button>
              {selectedIcons.size > 0 && (
                <button
                  className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-1 rounded text-xs text-foreground-muted hover:text-foreground hover:bg-surface-accent"
                  onClick={clearBatchSelection}
                  title={t('toolbar.cancelAll')}
                >
                  <XCircle size={12} /> {t('toolbar.cancel')}
                </button>
              )}
            </div>
          </div>
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
                'bg-surface-muted/50',
                'text-xs text-foreground placeholder:text-foreground-muted/50',
                'outline-none',
                'transition-all duration-200',
                'focus:border-accent focus:ring-2 focus:ring-ring/30'
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default IconToolbar;
