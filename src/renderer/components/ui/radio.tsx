import React from 'react';
import { cn } from '../../lib/utils';

// ── RadioGroup ────────────────────────────────────────────────────

interface RadioGroupProps {
  value?: any;
  onChange?: (e: { target: { value: any } }) => void;
  children?: React.ReactNode;
  className?: string;
}

export function RadioGroup({ value, onChange, children, className }: RadioGroupProps) {
  const handleChange = (newValue: any) => {
    onChange?.({ target: { value: newValue } });
  };

  return (
    <div className={cn('flex flex-col gap-0', className)}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement<any>(child)) {
          return React.cloneElement(child, {
            _selected: child.props.value === value,
            _onChange: handleChange,
          } as any);
        }
        return child;
      })}
    </div>
  );
}

// ── RadioButton (toggle-style) ──────────────────────────────────

interface RadioButtonProps {
  value?: any;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  // Internal props injected by RadioGroup
  _selected?: boolean;
  _onChange?: (value: any) => void;
}

export function RadioButton({
  value,
  children,
  className,
  style,
  _selected,
  _onChange,
}: RadioButtonProps) {
  return (
    <button
      type="button"
      onClick={() => _onChange?.(value)}
      style={style}
      className={cn(
        'inline-flex items-center px-3 py-1 text-xs font-medium',
        'border border-border',
        'transition-colors duration-150',
        '-ml-px first:ml-0 first:rounded-l-md last:rounded-r-md',
        _selected
          ? 'bg-brand-500 text-white border-brand-500 z-[1]'
          : 'bg-surface text-foreground hover:bg-surface-muted hover:text-brand-500',
        className
      )}
    >
      {children}
    </button>
  );
}

// ── Radio (standard radio) ──────────────────────────────────────

interface RadioProps {
  value?: any;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  // Internal props injected by RadioGroup
  _selected?: boolean;
  _onChange?: (value: any) => void;
}

export function Radio({ value, children, style, className, _selected, _onChange }: RadioProps) {
  return (
    <label
      className={cn('flex items-center gap-2 cursor-pointer text-sm', className)}
      style={style}
    >
      <input
        type="radio"
        checked={_selected}
        onChange={() => _onChange?.(value)}
        className="accent-brand-500"
      />
      <span className="text-foreground">{children}</span>
    </label>
  );
}

export default RadioGroup;
