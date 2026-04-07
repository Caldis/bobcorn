import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useRecentProjects, getFileDisplayName } from '../../hooks/useRecentProjects';
import { ProjectAvatar, ProjectItem } from '../ProjectItem';
import useAppStore from '../../store';

const ProjectSwitcher = React.memo(function ProjectSwitcher() {
  const { t } = useTranslation();
  const projectName = useAppStore((s: any) => s.projectName);
  const currentFilePath = useAppStore((s: any) => s.currentFilePath);
  const { histProj, removeHistItem, refresh } = useRecentProjects();

  const [open, setOpen] = useState(false);
  const [posReady, setPosReady] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ top: 0, left: 0 });

  // Filter out current project from recent list
  const recentProjects = currentFilePath ? histProj.filter((p) => p !== currentFilePath) : histProj;

  // Re-read history from localStorage each time popover opens
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // Compute position synchronously before paint
  useLayoutEffect(() => {
    if (!open) {
      setPosReady(false);
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      posRef.current = { top: rect.top - 6, left: rect.left };
      setPosReady(true);
    }
  }, [open]);

  // Outside click
  useEffect(() => {
    if (!open) return;
    const handleClose = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    setTimeout(() => document.addEventListener('mousedown', handleClose), 0);
    return () => document.removeEventListener('mousedown', handleClose);
  }, [open]);

  // Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleOpenRecent = useCallback((path: string) => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('bobcorn:open-project', { detail: { path } }));
  }, []);

  const handleSettingsClick = useCallback(() => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('bobcorn:open-settings'));
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        data-testid="project-switcher-btn"
        className={cn(
          'inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md min-w-0 max-w-full',
          'text-[13px] font-medium text-foreground-muted',
          'transition-colors duration-100',
          'hover:bg-surface-accent hover:text-foreground',
          open && 'bg-surface-accent text-foreground'
        )}
      >
        <ProjectAvatar name={projectName} size={20} />
        <span className="truncate">{projectName}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('shrink-0 transition-transform duration-150', open && 'rotate-180')}
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      {open &&
        posReady &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: posRef.current.top,
              left: posRef.current.left,
              transform: 'translateY(-100%)',
            }}
            className={cn(
              'z-[9999] w-[280px] overflow-hidden rounded-lg',
              'border border-border bg-surface shadow-xl',
              'animate-in fade-in slide-in-from-bottom-2 duration-150'
            )}
          >
            {/* ── Current project ─────────────────────── */}
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <ProjectAvatar name={projectName} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-foreground truncate">
                    {projectName}
                  </div>
                  {currentFilePath && (
                    <div
                      className="text-[11px] text-foreground-muted truncate"
                      title={currentFilePath}
                    >
                      {currentFilePath}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mx-2 h-px bg-border" />

            {/* ── Project settings ────────────────────── */}
            <div className="py-1">
              <button
                onClick={handleSettingsClick}
                className={cn(
                  'w-full text-left px-3 py-1.5',
                  'flex items-center gap-2.5',
                  'text-[13px] text-foreground-muted',
                  'transition-colors duration-75',
                  'hover:bg-surface-accent hover:text-foreground',
                  'group'
                )}
              >
                <Settings
                  size={14}
                  className="shrink-0 text-foreground-muted group-hover:text-accent transition-colors duration-75"
                />
                <span>{t('project.settings')}</span>
              </button>
            </div>

            <div className="mx-2 h-px bg-border" />

            {/* ── Recent projects ─────────────────────── */}
            <div className="py-1">
              <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-foreground-muted/50">
                {t('project.recent')}
              </div>

              {recentProjects.length > 0 ? (
                <div className="max-h-[240px] overflow-y-auto">
                  {recentProjects.map((path) => (
                    <ProjectItem
                      key={path}
                      name={getFileDisplayName(path)}
                      path={path}
                      onClick={() => handleOpenRecent(path)}
                      onRemove={() => removeHistItem(path)}
                      removeTitle={t('project.removeRecord')}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-[11px] text-foreground-muted/40">
                  {t('project.noRecent')}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
});

export default ProjectSwitcher;
