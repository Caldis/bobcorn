// React
import React, { useState, useEffect, useCallback } from 'react';
// Utils
import { cn } from '../../../lib/utils';
// Electron API (via preload contextBridge)
const { electronAPI } = window;

/** Apply or remove maximized-state styles on body/root */
function applyMaximizedStyles(isMaximized: boolean, border: number) {
  const body = document.querySelector('body')!;
  const root = document.querySelector<HTMLElement>('#root')!;
  if (isMaximized) {
    // Add padding to compensate for window extending beyond screen edges
    body.style.padding = border > 0 ? `${border}px` : '0';
    root.style.borderRadius = '0';
  } else {
    body.style.removeProperty('padding');
    root.style.removeProperty('border-radius');
  }
}

function TitleBarButtonGroup() {
  const [maximized, setMaximized] = useState(() => electronAPI.windowIsMaximized());
  const [border, setBorder] = useState(0);
  const [pinned, setPinned] = useState(false);

  // Listen to ALL maximize/unmaximize events (button click, double-click title bar, Win+Up, etc.)
  useEffect(() => {
    return electronAPI.onMaximizedChange((isMaximized, borderSize) => {
      setMaximized(isMaximized);
      setBorder(borderSize);
      applyMaximizedStyles(isMaximized, borderSize);
    });
  }, []);

  const handleWindowMinimum = useCallback(() => {
    electronAPI.windowMinimize();
  }, []);

  const handleWindowMaximum = useCallback(() => {
    electronAPI.windowMaximize();
  }, []);

  const handleWindowClose = useCallback(() => {
    electronAPI.windowClose();
  }, []);

  const buttonBase = cn(
    'w-[40px] h-[30px]',
    'inline-flex items-center justify-center',
    'bg-transparent p-0 m-0 border-none rounded-md',
    'cursor-pointer outline-none',
    'text-foreground-muted',
    'hover:text-foreground hover:bg-surface-accent',
    'active:bg-surface-accent/80',
    'transition-colors duration-150'
  );

  const iconProps = {
    width: 12,
    height: 12,
    viewBox: '0 0 10 10',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1,
  } as const;

  // Center buttons in the 58px safe area: (58-30)/2 = 14px from content edge
  // When maximized, add border offset to compensate for window oversize
  const offset = { top: border + 14, right: border + 14 };

  return (
    <div
      className={cn(
        'fixed z-[10000]',
        'inline-flex flex-row items-center gap-0.5',
        '[-webkit-app-region:no-drag]'
      )}
      style={{ top: offset.top, right: offset.right }}
      id="titleBarButtonGroup"
    >
      <button
        className={cn(buttonBase, pinned && 'text-accent')}
        onClick={() => {
          const next = !pinned;
          setPinned(next);
          electronAPI.windowSetAlwaysOnTop(next);
        }}
      >
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={pinned ? undefined : { transform: 'rotate(45deg)' }}
        >
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
        </svg>
      </button>
      <button className={cn(buttonBase)} onClick={handleWindowMinimum}>
        <svg {...iconProps}>
          <line x1="1" y1="5" x2="9" y2="5" />
        </svg>
      </button>
      <button className={cn(buttonBase)} onClick={handleWindowMaximum}>
        {maximized ? (
          <svg {...iconProps}>
            <rect x="2.5" y="0.5" width="7" height="7" rx="1" />
            <rect x="0.5" y="2.5" width="7" height="7" rx="1" fill="hsl(var(--surface))" />
          </svg>
        ) : (
          <svg {...iconProps}>
            <rect x="1" y="1" width="8" height="8" rx="1" />
          </svg>
        )}
      </button>
      <button
        className={cn(buttonBase, 'hover:!bg-danger hover:!text-white', 'active:!bg-danger/80')}
        onClick={handleWindowClose}
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
        >
          <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" />
          <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" />
        </svg>
      </button>
    </div>
  );
}

export default TitleBarButtonGroup;
