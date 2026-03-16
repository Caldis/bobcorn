import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

interface MenuItem {
  key: string;
  label?: React.ReactNode;
  disabled?: boolean;
}

interface MenuConfig {
  items?: MenuItem[];
  onClick?: (info: { key: string }) => void;
}

interface DropdownProps {
  menu?: MenuConfig;
  children: React.ReactElement;
}

export function Dropdown({ menu, children }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, above: true });
  const items = menu?.items || [];
  const onClick = menu?.onClick;

  useEffect(() => {
    if (!open) return;
    // 计算菜单位置 — 根据空间动态选上方或下方
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow > 120 || spaceBelow > spaceAbove) {
        // 下方空间足够，显示在下方
        setPos({ top: rect.bottom + 4, left: rect.left, above: false });
      } else {
        // 上方显示
        setPos({ top: rect.top - 4, left: rect.left, above: true });
      }
    }
    const handleClose = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    setTimeout(() => document.addEventListener('mousedown', handleClose), 0);
    return () => document.removeEventListener('mousedown', handleClose);
  }, [open]);

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setOpen(true), 200);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setOpen(false), 300);
  }, []);

  const handleMenuMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  const handleMenuMouseLeave = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => setOpen(false), 300);
  }, []);

  // 克隆子元素，注入 ref + click（hover 已禁用，代码保留）
  const trigger = React.cloneElement(children, {
    ref: triggerRef,
    onClick: (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      setOpen(!open);
    },
    // onMouseEnter: handleMouseEnter,
    // onMouseLeave: handleMouseLeave,
  });

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            onMouseEnter={handleMenuMouseEnter}
            onMouseLeave={handleMenuMouseLeave}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: pos.above ? 'translateY(-100%)' : undefined,
            }}
            className={cn(
              'z-[9999] min-w-[120px] overflow-hidden rounded-md',
              'border border-border bg-surface shadow-lg',
              'p-1'
            )}
          >
            {items.map((item) => (
              <button
                key={item.key}
                disabled={item.disabled}
                onClick={() => {
                  onClick?.({ key: item.key });
                  setOpen(false);
                }}
                className={cn(
                  'w-full text-left rounded-sm px-3 py-1.5 text-sm text-foreground',
                  'transition-colors duration-100',
                  'hover:bg-surface-accent hover:text-brand-500',
                  'disabled:opacity-50 disabled:pointer-events-none'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

export default Dropdown;
