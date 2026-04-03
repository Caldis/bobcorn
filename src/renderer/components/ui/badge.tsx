import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps {
  count?: number;
  children?: React.ReactNode;
  className?: string;
  /** Status dot mode (for EnhanceBadge) */
  status?: 'success' | 'processing' | 'default' | 'error' | 'warning';
  text?: string;
}

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-success',
  processing: 'bg-info',
  default: 'bg-foreground-subtle',
  error: 'bg-danger',
  warning: 'bg-warning',
};

export function Badge({ count, children, className, status, text }: BadgeProps) {
  // Status dot mode
  if (status) {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        <span
          className={cn(
            'inline-block h-1.5 w-1.5 rounded-full',
            STATUS_COLORS[status] || STATUS_COLORS.default
          )}
        />
        {text && <span className="text-xs text-foreground-muted">{text}</span>}
      </span>
    );
  }

  // Count badge mode
  if (children) {
    return (
      <span className={cn('relative inline-flex', className)}>
        {children}
        {count != null && count > 0 && (
          <span
            className={cn(
              'absolute -top-1.5 -right-2.5 z-10',
              'inline-flex items-center justify-center',
              'min-w-[18px] h-[18px] px-1',
              'rounded-full',
              'bg-danger text-accent-foreground',
              'text-[10px] font-medium leading-none'
            )}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </span>
    );
  }

  // Standalone count
  if (count != null && count > 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center',
          'min-w-[18px] h-[18px] px-1',
          'rounded-full',
          'bg-danger text-accent-foreground',
          'text-[10px] font-medium leading-none',
          className
        )}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  }

  return <>{children}</>;
}

export default Badge;
