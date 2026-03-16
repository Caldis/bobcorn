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
  const barColor =
    strokeColor ||
    (status === 'exception'
      ? 'bg-red-500'
      : status === 'success'
        ? 'bg-green-500'
        : 'bg-brand-500');

  return (
    <div className={cn('w-full', className)}>
      <div className="h-2 w-full rounded-full bg-surface-accent dark:bg-white/10 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300 ease-out',
            typeof barColor === 'string' && !barColor.startsWith('bg-') ? '' : barColor,
            status === 'active' && 'animate-pulse'
          )}
          style={{
            width: `${Math.min(100, Math.max(0, percent))}%`,
            ...(strokeColor ? { backgroundColor: strokeColor } : {}),
          }}
        />
      </div>
    </div>
  );
}

export default Progress;
