// React
import React, { useRef } from 'react';
// Utils
import { cn } from '../../../lib/utils';
// Store
import useAppStore from '../../../store';
// Electron API (via preload contextBridge)
const { electronAPI } = window;
// ButtonIcon
import minimize from '../../../resources/imgs/titleBarButton/minimize.svg';
import maximize from '../../../resources/imgs/titleBarButton/maximize.svg';
import close from '../../../resources/imgs/titleBarButton/close.svg';

function TitleBarButtonGroup() {
  const maximizedRef = useRef<boolean>(false);
  const paddingOfBodyRef = useRef<string>('');
  const borderRadiusOfRootRef = useRef<string>('');
  const topOfTitleBarButtonGroupRef = useRef<string>('');

  const currentFilePath = useAppStore((s: any) => s.currentFilePath);
  const isDirty = useAppStore((s: any) => s.isDirty);
  const fileName = currentFilePath ? electronAPI.pathBasename(currentFilePath, '.icp') : 'Untitled';
  const titleText = `${fileName}${isDirty ? '*' : ''} — Bobcorn`;

  // 最小化
  const handleWindowMinimum = () => {
    electronAPI.windowMinimize();
  };

  // 最大化
  const handleWindowMaximum = () => {
    const body = document.querySelector('body')!;
    const root = document.querySelector<HTMLElement>('#root')!;
    const titleBarButtonGroup = document.querySelector<HTMLElement>('#titleBarButtonGroup')!;
    if (maximizedRef.current) {
      electronAPI.windowMaximize();
      body.style.padding = paddingOfBodyRef.current;
      root.style.borderRadius = borderRadiusOfRootRef.current;
      titleBarButtonGroup.style.top = topOfTitleBarButtonGroupRef.current;
      maximizedRef.current = false;
    } else {
      electronAPI.windowMaximize();
      paddingOfBodyRef.current = window.getComputedStyle(body).padding;
      body.style.padding = '0';
      borderRadiusOfRootRef.current = window.getComputedStyle(root).borderRadius;
      root.style.borderRadius = '0';
      topOfTitleBarButtonGroupRef.current = window.getComputedStyle(titleBarButtonGroup).top;
      titleBarButtonGroup.style.top = '0';
      maximizedRef.current = true;
    }
  };

  // 关闭
  const handleWindowClose = () => {
    electronAPI.windowClose();
  };

  const buttonBase = cn(
    'w-[46px] h-[30px]',
    'inline-flex items-center justify-center',
    'bg-transparent p-0 m-0 border-none',
    'cursor-pointer outline-none',
    'hover:bg-neutral-300 dark:hover:bg-neutral-600',
    'active:bg-neutral-400 dark:active:bg-neutral-500',
    '[&>img]:h-3',
    'transition-colors duration-150'
  );

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0',
        'z-[10000]',
        'flex flex-row items-start',
        '[-webkit-app-region:drag]'
      )}
      id="titleBarButtonGroup"
      style={{ gap: 0 }}
    >
      <span
        className={cn(
          'leading-[30px] px-3 text-xs text-foreground-muted truncate flex-1 select-none',
          '[-webkit-app-region:drag]'
        )}
      >
        {titleText}
      </span>
      <div className="flex [-webkit-app-region:no-drag]">
        <button className={cn(buttonBase)} onClick={handleWindowMinimum}>
          <img src={minimize} />
        </button>
        <button className={cn(buttonBase)} onClick={handleWindowMaximum}>
          <img src={maximize} />
        </button>
        <button
          className={cn(
            buttonBase,
            'hover:!bg-[#e81123] dark:hover:!bg-[#e81123]',
            'active:!bg-[#dc5c66] dark:active:!bg-[#dc5c66]'
          )}
          onClick={handleWindowClose}
        >
          <img src={close} />
        </button>
      </div>
    </div>
  );
}

export default TitleBarButtonGroup;
