import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { cn } from '../../lib/utils';

export interface InputRef {
  focus: () => void;
  blur: () => void;
  input: HTMLInputElement | null;
}

interface InputProps {
  value?: string | null;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPressEnter?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  type?: string;
}

export const Input = forwardRef<InputRef, InputProps>(function Input(
  {
    value,
    onChange,
    onPressEnter,
    placeholder,
    autoFocus,
    className,
    disabled,
    style,
    type = 'text',
  },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    input: inputRef.current,
  }));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onPressEnter?.();
    }
  };

  return (
    <input
      ref={inputRef}
      type={type}
      value={value ?? ''}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      style={style}
      className={cn(
        'w-full h-8 px-3 py-1',
        'rounded-md border border-border',
        'bg-surface text-sm text-foreground',
        'placeholder:text-foreground-muted/50',
        'outline-none',
        'transition-colors duration-200',
        'focus:border-accent focus:ring-2 focus:ring-ring/30',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    />
  );
});

export default Input;
