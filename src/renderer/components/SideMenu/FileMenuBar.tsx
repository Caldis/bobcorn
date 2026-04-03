import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FilePlus2, FolderOpen, Save, SaveAll, Import, Upload, Settings, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { platform } from '../../utils/tools';
import UpdateIndicator from './UpdateIndicator';

const mod = platform() === 'darwin' ? '⌘' : 'Ctrl+';

interface FileMenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  shortcut?: string;
}

interface FileMenuBarProps {
  onMenuAction: (key: string) => void;
  onInstallUpdate: () => void;
}

const FileMenuBar = React.memo(function FileMenuBar({
  onMenuAction,
  onInstallUpdate,
}: FileMenuBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [posReady, setPosReady] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ top: 0, left: 0 });

  // Compute position synchronously before paint to avoid flash at (0,0)
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

  // Outside click listener
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

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleItemClick = useCallback(
    (key: string) => {
      setOpen(false);
      onMenuAction(key);
    },
    [onMenuAction]
  );

  const menuGroups: FileMenuItem[][] = useMemo(
    () => [
      [
        {
          key: 'new-project',
          icon: <FilePlus2 size={15} />,
          label: t('menu.file.new'),
          description: t('menu.file.newDesc'),
          shortcut: `${mod}N`,
        },
        {
          key: 'open-project',
          icon: <FolderOpen size={15} />,
          label: t('menu.file.open'),
          description: t('menu.file.openDesc'),
          shortcut: `${mod}O`,
        },
        {
          key: 'save',
          icon: <Save size={15} />,
          label: t('menu.file.save'),
          description: t('menu.file.saveDesc'),
          shortcut: `${mod}S`,
        },
        {
          key: 'save-as',
          icon: <SaveAll size={15} />,
          label: t('menu.file.saveAs'),
          description: t('menu.file.saveAsDesc'),
          shortcut: `${mod}⇧S`,
        },
      ],
      [
        {
          key: 'import-icons',
          icon: <Import size={15} />,
          label: t('menu.file.importIcons'),
          description: t('menu.file.importIconsDesc'),
          shortcut: `${mod}I`,
        },
        {
          key: 'export-fonts',
          icon: <Upload size={15} />,
          label: t('menu.file.exportFonts'),
          description: t('menu.file.exportFontsDesc'),
          shortcut: `${mod}E`,
        },
      ],
      [
        {
          key: 'close-project',
          icon: <X size={15} />,
          label: t('menu.file.closeProject'),
          description: t('menu.file.closeProjectDesc'),
        },
      ],
      [
        {
          key: 'settings',
          icon: <Settings size={15} />,
          label: t('menu.file.settings'),
          description: t('menu.file.settingsDesc'),
        },
      ],
    ],
    [t]
  );

  return (
    <>
      <div className="flex shrink-0 items-center border-t border-border px-2.5 h-[49px] pb-1">
        <button
          ref={triggerRef}
          onClick={() => setOpen(!open)}
          data-testid="file-menu-btn"
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md',
            'text-[13px] font-medium text-foreground-muted',
            'transition-colors duration-100',
            'hover:bg-surface-accent hover:text-foreground',
            open && 'bg-surface-accent text-foreground'
          )}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          </svg>
          {t('menu.file')}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn('transition-transform duration-150', open && 'rotate-180')}
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <div className="ml-auto flex items-center">
          <UpdateIndicator onInstall={onInstallUpdate} />
        </div>
      </div>

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
              'z-[9999] w-[260px] overflow-hidden rounded-lg',
              'border border-border bg-surface shadow-xl',
              'py-1',
              'animate-in fade-in slide-in-from-bottom-2 duration-150'
            )}
          >
            {menuGroups.map((group, gi) => (
              <React.Fragment key={gi}>
                {gi > 0 && <div className="mx-2 my-1 h-px bg-border" />}
                {group.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => handleItemClick(item.key)}
                    className={cn(
                      'w-full text-left px-2.5 py-1.5 mx-0',
                      'flex items-start gap-2.5',
                      'transition-colors duration-75',
                      'hover:bg-surface-accent',
                      'group'
                    )}
                  >
                    <span className="mt-0.5 shrink-0 text-foreground-muted group-hover:text-accent transition-colors duration-75">
                      {item.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-foreground leading-tight">
                        {item.label}
                      </span>
                      <span className="block text-[11px] text-foreground-muted leading-tight mt-0.5">
                        {item.description}
                      </span>
                    </span>
                    {item.shortcut && (
                      <span className="shrink-0 mt-0.5 text-[11px] text-foreground-muted/50 font-mono tabular-nums">
                        {item.shortcut}
                      </span>
                    )}
                  </button>
                ))}
              </React.Fragment>
            ))}
          </div>,
          document.body
        )}
    </>
  );
});

export default FileMenuBar;
