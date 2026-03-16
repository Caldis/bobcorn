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
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const items = menu?.items || [];
  const onClick = menu?.onClick;

  useEffect(() => {
    if (!open) return;
    // 计算菜单位置
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 4, left: rect.left });
    }
    const handleClose = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    setTimeout(() => document.addEventListener('mousedown', handleClose), 0);
    return () => document.removeEventListener('mousedown', handleClose);
  }, [open]);

  // 克隆子元素，注入 ref 和 onClick
  const trigger = React.cloneElement(children, {
    ref: triggerRef,
    onClick: (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      setOpen(!open);
    },
  });

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: 'translateY(-100%)',
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
