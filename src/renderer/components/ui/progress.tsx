import React from 'react';
import { cn } from '../../lib/utils';

interface ProgressProps {
  percent?: number;
  status?: 'active' | 'success' | 'exception';
  strokeColor?: string;
  className?: string;
}

export function Progress({
  percent = 0,
  status = 'active',
  strokeColor,
  className,
}: ProgressProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const barColor =
    strokeColor ||
    (status === 'exception'
      ? 'bg-red-500'
      : status === 'success'
        ? 'bg-green-500'
        : 'bg-brand-500');

  return (
    <div className={cn('w-full flex items-center gap-3', className)}>
      <div className="flex-1 h-2 rounded-full bg-surface-accent dark:bg-white/10 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300 ease-out',
            typeof barColor === 'string' && !barColor.startsWith('bg-') ? '' : barColor
          )}
          style={{
            width: `${clampedPercent}%`,
            ...(strokeColor ? { backgroundColor: strokeColor } : {}),
          }}
        />
      </div>
      <span
        className={cn(
          'text-xs font-medium tabular-nums shrink-0 w-9 text-right',
          status === 'exception'
            ? 'text-red-500'
            : status === 'success'
              ? 'text-green-500'
              : 'text-foreground-muted'
        )}
      >
        {Math.round(clampedPercent)}%
      </span>
    </div>
  );
}

export default Progress;
