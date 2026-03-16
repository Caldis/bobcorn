import React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  type?: 'default' | 'primary' | 'danger';
  size?: 'default' | 'large' | 'small';
  shape?: 'circle' | 'default';
  icon?: React.ReactNode;
  danger?: boolean;
  'data-testid'?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    type = 'default',
    size = 'default',
    shape,
    icon,
    disabled = false,
    onClick,
    className,
    children,
    style,
    danger,
    'data-testid': testId,
    ...rest
  },
  ref
) {
  const effectiveType = danger ? 'danger' : type;

  return (
    <button
      ref={ref}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={style}
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-1.5',
        'font-medium transition-colors duration-150',
        'border',
        'focus:outline-none focus:ring-2 focus:ring-ring/40',
        'disabled:opacity-50 disabled:pointer-events-none',
        size === 'small' && 'text-xs px-2 py-0.5',
        size === 'default' && 'text-sm px-3 py-1',
        size === 'large' && 'text-base px-4 py-2',
        shape === 'circle'
          ? cn(
              'rounded-full',
              size === 'small' && '!p-1 w-6 h-6',
              size === 'default' && '!p-1.5 w-8 h-8',
              size === 'large' && '!p-2 w-10 h-10'
            )
          : 'rounded-md',
        effectiveType === 'default' &&
          'border-border bg-surface text-foreground hover:bg-surface-muted hover:border-brand-400 dark:hover:border-brand-500 data-[state=open]:bg-surface-muted data-[state=open]:border-brand-400',
        effectiveType === 'primary' &&
          'border-brand-500 bg-brand-500 text-white hover:bg-brand-600 hover:border-brand-600',
        effectiveType === 'danger' &&
          'border-red-500 bg-red-500 text-white hover:bg-red-600 hover:border-red-600',
        className
      )}
    >
      {icon && <span className="inline-flex items-center justify-center shrink-0">{icon}</span>}
      {children}
    </button>
  );
});

interface ButtonGroupProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ButtonGroup({ children, className, style }: ButtonGroupProps) {
  return (
    <div
      className={cn('inline-flex', '[&>*]:-ml-px [&>*:first-child]:ml-0', className)}
      style={style}
    >
      {children}
    </div>
  );
}

export default Button;
