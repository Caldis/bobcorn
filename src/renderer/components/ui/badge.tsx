import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps {
  count?: number;
  children?: React.ReactNode;
  className?: string;
  /** Status dot mode (for EnhanceBadge) */
  status?: 'success' | 'processing' | 'default' | 'error' | 'warning';
  text?: string;
  /** Plain standalone label pill (e.g. tagging a list item as "System") */
  label?: string;
}

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-success',
  processing: 'bg-info',
  default: 'bg-foreground-subtle',
  error: 'bg-danger',
  warning: 'bg-warning',
};

export function Badge({ count, children, className, status, text, label }: BadgeProps) {
  // Plain label pill mode
  if (label) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center',
          'px-1.5 py-0.5 rounded',
          'bg-surface-muted text-foreground-muted',
          't-pill',
          className
        )}
      >
        {label}
      </span>
    );
  }

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
        {text && (
          <span
            className={cn(
              't-caption',
              status === 'error' && 'text-danger',
              status === 'warning' && 'text-warning'
            )}
          >
            {text}
          </span>
        )}
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
              't-pill'
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
          't-pill',
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
