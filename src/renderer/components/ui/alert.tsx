import React from 'react';
import { cn } from '../../lib/utils';

interface AlertProps {
  message?: React.ReactNode;
  description?: React.ReactNode;
  type?: 'warning' | 'error' | 'info';
  className?: string;
}

const ALERT_STYLES = {
  warning: {
    container: 'border-warning bg-warning-subtle',
    icon: 'text-warning',
    title: 'text-foreground',
    desc: 'text-foreground-muted',
  },
  error: {
    container: 'border-danger bg-danger-subtle',
    icon: 'text-danger',
    title: 'text-foreground',
    desc: 'text-foreground-muted',
  },
  info: {
    container: 'border-info bg-info-subtle',
    icon: 'text-info',
    title: 'text-foreground',
    desc: 'text-foreground-muted',
  },
};

const ICONS = {
  warning: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  error: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  info: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

export function Alert({ message: title, description, type = 'info', className }: AlertProps) {
  const styles = ALERT_STYLES[type];

  return (
    <div className={cn('flex gap-3 rounded-lg border p-3', styles.container, className)}>
      <span className={cn('shrink-0 mt-0.5', styles.icon)}>{ICONS[type]}</span>
      <div className="flex-1 min-w-0">
        {title && <div className={cn('text-sm font-medium', styles.title)}>{title}</div>}
        {description && <div className={cn('mt-1 text-sm', styles.desc)}>{description}</div>}
      </div>
    </div>
  );
}

export default Alert;
