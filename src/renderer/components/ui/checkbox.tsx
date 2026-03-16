import React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cn } from '../../lib/utils';

interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  indeterminate?: boolean;
  children?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  checked = false,
  onChange,
  indeterminate = false,
  children,
  disabled = false,
  className,
}: CheckboxProps) {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 text-sm cursor-pointer select-none',
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
    >
      <CheckboxPrimitive.Root
        checked={indeterminate ? 'indeterminate' : checked}
        onCheckedChange={(state) => {
          onChange?.(state === true);
        }}
        disabled={disabled}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center',
          'rounded border border-border',
          'transition-colors duration-150',
          'data-[state=checked]:bg-brand-500 data-[state=checked]:border-brand-500',
          'data-[state=indeterminate]:bg-brand-500 data-[state=indeterminate]:border-brand-500',
          'focus:outline-none focus:ring-2 focus:ring-ring/40'
        )}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white">
          {indeterminate ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="2" y="4.5" width="6" height="1.5" rx="0.5" fill="currentColor" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M2.5 5L4.5 7L7.5 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {children && <span className="text-foreground">{children}</span>}
    </label>
  );
}

// ── CheckboxGroup ───────────────────────────────────────────────

interface CheckboxGroupOption {
  label: string;
  value: string;
}

interface CheckboxGroupProps {
  options?: CheckboxGroupOption[];
  value?: string[];
  onChange?: (values: string[]) => void;
  className?: string;
}

export function CheckboxGroup({
  options = [],
  value = [],
  onChange,
  className,
}: CheckboxGroupProps) {
  const handleToggle = (optionValue: string, checked: boolean) => {
    const newValues = checked ? [...value, optionValue] : value.filter((v) => v !== optionValue);
    onChange?.(newValues);
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {options.map((opt) => (
        <Checkbox
          key={opt.value}
          checked={value.includes(opt.value)}
          onChange={(checked) => handleToggle(opt.value, checked)}
        >
          {opt.label}
        </Checkbox>
      ))}
    </div>
  );
}

export default Checkbox;
