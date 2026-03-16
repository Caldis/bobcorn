import React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '../../lib/utils';

interface MenuItem {
  key: string;
  label?: React.ReactNode;
  disabled?: boolean;
  children?: React.ReactNode;
}

interface MenuConfig {
  items?: MenuItem[];
  onClick?: (info: { key: string }) => void;
  className?: string;
}

interface DropdownProps {
  /** Legacy antd-style overlay: a React element with onClick and children Menu.Items */
  overlay?: React.ReactElement<any>;
  /** New items-based config */
  menu?: MenuConfig;
  children: React.ReactNode;
  className?: string;
}

export function Dropdown({ overlay, menu, children, className }: DropdownProps) {
  // Extract menu items from overlay (legacy antd Menu element) or menu config
  let items: MenuItem[] = [];
  let onClick: ((info: { key: string }) => void) | undefined;

  if (menu) {
    items = menu.items || [];
    onClick = menu.onClick;
  } else if (overlay && React.isValidElement(overlay)) {
    // Extract from antd-like Menu element: props.onClick, props.children (Menu.Items)
    const overlayProps = overlay.props as any;
    onClick = overlayProps.onClick;
    // Extract children as items
    React.Children.forEach(overlayProps.children, (child: any) => {
      if (React.isValidElement(child)) {
        const childProps = child.props as any;
        items.push({
          key: childProps.eventKey || childProps.key || String(items.length),
          label: childProps.children,
          disabled: childProps.disabled,
        });
      }
    });
  }

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild className={className}>
        {children}
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          sideOffset={4}
          className={cn(
            'z-50 min-w-[120px] overflow-hidden rounded-md',
            'border border-border bg-surface shadow-lg',
            'p-1',
            'animate-in fade-in-0 zoom-in-95'
          )}
        >
          {items.map((item) => (
            <DropdownMenuPrimitive.Item
              key={item.key}
              disabled={item.disabled}
              onSelect={() => onClick?.({ key: item.key })}
              className={cn(
                'relative flex cursor-pointer select-none items-center',
                'rounded-sm px-3 py-1.5 text-sm text-foreground',
                'outline-none',
                'transition-colors duration-100',
                'hover:bg-surface-accent hover:text-brand-500',
                'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none'
              )}
            >
              {item.label || item.children}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export default Dropdown;
