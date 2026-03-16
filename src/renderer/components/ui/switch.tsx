import React from 'react';
import { cn } from '../../lib/utils';

interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: 'small' | 'default';
  className?: string;
}

export function Switch({ checked = false, onChange, size = 'default', className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer rounded-full',
        'border-2 border-transparent',
        'transition-colors duration-200 ease-in-out',
        'focus:outline-none focus:ring-2 focus:ring-ring/40',
        checked ? 'bg-brand-500' : 'bg-surface-accent dark:bg-white/20',
        size === 'small' ? 'h-4 w-7' : 'h-5 w-9',
        className
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block rounded-full bg-white shadow-sm',
          'transform transition-transform duration-200 ease-in-out',
          size === 'small' ? 'h-3 w-3' : 'h-4 w-4',
          checked ? (size === 'small' ? 'translate-x-3' : 'translate-x-4') : 'translate-x-0'
        )}
      />
    </button>
  );
}

export default Switch;
