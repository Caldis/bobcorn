import React from 'react';
import { cn } from '../lib/utils';

// ── Avatar colors & helpers ────────────────────────────────────────

export const AVATAR_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#ef4444',
  '#a855f7',
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const clean = name.replace(/\.[^.]+$/, '');
  const parts = clean.split(/[-_\s]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.substring(0, 2).toUpperCase();
}

// ── Project Avatar ─────────────────────────────────────────────────

export function ProjectAvatar({
  name,
  size,
  color: colorOverride,
}: {
  name: string;
  size: number;
  color?: string | null;
}) {
  const color = colorOverride || AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length];
  const initials = getInitials(name);

  return (
    <div
      className="shrink-0 flex items-center justify-center rounded font-semibold text-white select-none"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: Math.round(size * 0.4),
        lineHeight: 1,
      }}
    >
      {initials}
    </div>
  );
}

// ── Project Item ───────────────────────────────────────────────────

interface ProjectItemProps {
  name: string;
  path: string;
  onClick: () => void;
  onRemove?: () => void;
  removeTitle?: string;
  avatarSize?: number;
}

/**
 * Shared project display row — used in both SplashScreen history and
 * ProjectSwitcher recent list. Shows avatar + name + path with an
 * optional hover-reveal delete button.
 */
export function ProjectItem({
  name,
  path,
  onClick,
  onRemove,
  removeTitle,
  avatarSize = 24,
}: ProjectItemProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2.5 w-full px-2 py-1.5',
        'transition-colors duration-75',
        'hover:bg-surface-accent rounded-md'
      )}
    >
      <button
        onClick={onClick}
        title={path}
        className="flex items-center gap-2.5 min-w-0 flex-1 focus:outline-none"
      >
        <ProjectAvatar name={name} size={avatarSize} />
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[13px] font-medium text-foreground truncate">{name}</div>
          <div className="text-[10px] text-foreground-muted/60 truncate">{path}</div>
        </div>
      </button>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title={removeTitle}
          className={cn(
            'shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100',
            'text-foreground-muted/40 hover:text-danger',
            'transition-all duration-150',
            'focus:outline-none focus:opacity-100'
          )}
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
