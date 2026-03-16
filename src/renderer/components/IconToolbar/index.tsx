// React
import React, { useState } from 'react';
// Antd
import { Button, Radio, Slider, Switch } from 'antd';
import type { RadioChangeEvent } from 'antd';
import { CloseOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
// Utils
import { cn } from '../../lib/utils';

interface IconToolbarProps {
  defaultIconWidth?: number;
  updateIconWidth?: (width: number) => void;
  defaultNameVisible?: boolean;
  updateNameVisible?: (visible: boolean) => void;
  defaultCodeVisible?: boolean;
  updateCodeVisible?: (visible: boolean) => void;
  updateSearchKeyword?: (keyword: string) => void;
}

function IconToolbar({
  defaultIconWidth = 100,
  updateIconWidth = () => {},
  defaultNameVisible = true,
  updateNameVisible = () => {},
  defaultCodeVisible = true,
  updateCodeVisible = () => {},
  updateSearchKeyword = () => {},
}: IconToolbarProps) {
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
  const handleNameVisibilityChange = (e: RadioChangeEvent) => {
    setShowName(e.target.value);
    updateNameVisible(e.target.value);
  };
  // 控制图标字码可见性
  const handleCodeVisibilityChange = (e: RadioChangeEvent) => {
    setShowCode(e.target.value);
    updateCodeVisible(e.target.value);
  };
  // 排序动作条相关
  const handleOrderTypeChange = (e: RadioChangeEvent) => {
    setOrderType(e.target.value);
  };
  const handleOrderDirectionChange = (e: RadioChangeEvent) => {
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
          'bg-surface/80 dark:bg-surface/80',
          '[&_.ant-radio-group]:mr-2'
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
              <span>图标名称</span>
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
              <span>图标字码</span>
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
            <Radio.Group value={orderType} onChange={handleOrderTypeChange}>
              <Radio.Button value="addTime">按添加时间</Radio.Button>
              <Radio.Button value="editTime">按修改时间</Radio.Button>
              <Radio.Button value="name">按名称</Radio.Button>
              <Radio.Button value="code">按字码</Radio.Button>
              <Radio.Button value="size">按大小</Radio.Button>
            </Radio.Group>
            <Radio.Group value={orderDirection} onChange={handleOrderDirectionChange}>
              <Radio.Button value="forward">升序</Radio.Button>
              <Radio.Button value="reverse">降序</Radio.Button>
            </Radio.Group>
          </div>
        )}
        <div className="ml-auto">
          <Button
            className="absolute right-1.5 top-1.5 !border-none !bg-transparent hover:!bg-transparent active:!bg-transparent"
            shape="circle"
            icon={<CloseOutlined />}
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
              icon={<EyeOutlined />}
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

        {/* 搜索栏 */}
        <div className="ml-4 mr-1.5">
          <div className="relative">
            <SearchOutlined
              className={cn(
                'absolute left-2.5 top-1/2 -translate-y-1/2 z-10',
                'text-foreground-muted/60',
                'pointer-events-none text-xs'
              )}
            />
            <input
              type="text"
              placeholder="搜索图标名称或字码"
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
