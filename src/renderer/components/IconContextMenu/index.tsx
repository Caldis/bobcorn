// Icon right-click context menu — presentation-only.
//
// A portal-based floating menu positioned at the cursor. It holds no
// business logic and never touches the database: the mounting component
// (IconGridLocal) builds the item list (labels via t(), db writes guarded
// by variantGuard) and passes it in. This keeps the component outside the
// scope of the core-boundary / variant-guard static tests.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export interface ContextMenuItem {
  key: string;
  label?: string;
  icon?: React.ReactNode;
  /** Render a divider instead of a clickable row. */
  separator?: boolean;
  /** Style as a destructive action (red). */
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

interface IconContextMenuProps {
  open: boolean;
  /** Cursor position (viewport coordinates). */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const IconContextMenu: React.FC<IconContextMenuProps> = ({ open, x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [ready, setReady] = useState(false);

  // Position at cursor, flipping when it would overflow the viewport.
  // Measured after mount (kept invisible until then to avoid a flash).
  useLayoutEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    let left = x;
    let top = y;
    if (left + w > vw - margin) left = Math.max(margin, x - w);
    if (top + h > vh - margin) top = Math.max(margin, y - h);
    setPos({ left, top });
    setReady(true);
  }, [open, x, y, items]);

  // Dismiss on any outside interaction.
  useEffect(() => {
    if (!open) return;
    const isInside = (target: EventTarget | null) => menuRef.current?.contains(target as Node);
    const onPointerDown = (e: MouseEvent) => {
      if (!isInside(e.target)) onClose();
    };
    const onContextMenuGlobal = (e: MouseEvent) => {
      // A right-click elsewhere closes this menu; the target's own handler
      // (if any) re-opens a fresh menu at the new position.
      if (!isInside(e.target)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onScroll = () => onClose();
    const onBlur = () => onClose();

    // Defer pointer/context listeners one tick so the very event that opened
    // the menu (mousedown → contextmenu) doesn't immediately close it.
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown, true);
      document.addEventListener('contextmenu', onContextMenuGlobal, true);
    }, 0);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('blur', onBlur);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('contextmenu', onContextMenuGlobal, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('blur', onBlur);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        visibility: ready ? 'visible' : 'hidden',
      }}
      className={cn(
        'z-[9999] min-w-[180px] py-1',
        'rounded-lg border border-border bg-surface-elevated shadow-xl',
        'animate-in fade-in zoom-in-95 duration-100'
      )}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.key} className="my-1 mx-2 h-px bg-border" />
        ) : (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect?.();
              onClose();
            }}
            className={cn(
              'flex w-full items-center gap-2.5 px-3 py-1.5 text-left',
              'text-[13px] transition-colors duration-75',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              item.danger
                ? 'text-danger hover:bg-danger/10'
                : 'text-foreground-muted hover:bg-surface-accent hover:text-foreground'
            )}
          >
            {item.icon && (
              <span className="shrink-0 flex items-center text-current">{item.icon}</span>
            )}
            <span className="truncate">{item.label}</span>
          </button>
        )
      )}
    </div>,
    document.body
  );
};

export default IconContextMenu;
