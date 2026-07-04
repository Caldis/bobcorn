import React from 'react';
import { cn } from '../../lib/utils';

// ── RadioGroup ────────────────────────────────────────────────────

interface RadioGroupProps {
  value?: any;
  onChange?: (e: { target: { value: any } }) => void;
  children?: React.ReactNode;
  className?: string;
  /** Layout direction. 'col' (default) keeps the existing vertical list behavior
   *  (used by the standard `Radio` list-item), 'row' lays children out as an
   *  inline segmented control (used by `RadioButton`). */
  direction?: 'row' | 'col';
}

export function RadioGroup({
  value,
  onChange,
  children,
  className,
  direction = 'col',
}: RadioGroupProps) {
  const handleChange = (newValue: any) => {
    onChange?.({ target: { value: newValue } });
  };

  return (
    <div
      className={cn(
        'flex',
        direction === 'row' ? 'flex-row items-center gap-1' : 'flex-col gap-0',
        className
      )}
    >
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
        'inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-xs font-medium',
        'transition-colors duration-150',
        _selected
          ? 'bg-accent text-accent-foreground'
          : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground',
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
  disabled?: boolean;
  // Internal props injected by RadioGroup
  _selected?: boolean;
  _onChange?: (value: any) => void;
}

export function Radio({
  value,
  children,
  style,
  className,
  disabled,
  _selected,
  _onChange,
}: RadioProps) {
  return (
    <label
      className={cn(
        'flex items-center gap-2.5 text-sm',
        'px-2.5 py-2 rounded-md transition-colors duration-150',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        _selected ? 'bg-accent-subtle' : !disabled && 'hover:bg-surface-muted',
        className
      )}
      style={style}
    >
      <input
        type="radio"
        checked={_selected}
        disabled={disabled}
        onChange={() => !disabled && _onChange?.(value)}
        className="accent-accent shrink-0 m-0 w-3.5 h-3.5"
      />
      <span className={cn('text-foreground truncate', _selected && 'font-medium text-accent')}>
        {children}
      </span>
    </label>
  );
}

export default RadioGroup;
