import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FilePlus2, FolderOpen, Save, SaveAll, Import, Upload, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import { platform } from '../../utils/tools';

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
}

const menuGroups: FileMenuItem[][] = [
  [
    {
      key: 'new-project',
      icon: <FilePlus2 size={15} />,
      label: '新建项目',
      description: '创建空白项目',
      shortcut: `${mod}N`,
    },
    {
      key: 'open-project',
      icon: <FolderOpen size={15} />,
      label: '打开',
      description: '打开 .icp 项目文件',
      shortcut: `${mod}O`,
    },
    {
      key: 'save',
      icon: <Save size={15} />,
      label: '保存',
      description: '保存当前项目',
      shortcut: `${mod}S`,
    },
    {
      key: 'save-as',
      icon: <SaveAll size={15} />,
      label: '另存为',
      description: '保存到新路径',
      shortcut: `${mod}⇧S`,
    },
  ],
  [
    {
      key: 'import-icons',
      icon: <Import size={15} />,
      label: '导入图标',
      description: '添加 SVG 图标到当前项目',
    },
    {
      key: 'export-fonts',
      icon: <Upload size={15} />,
      label: '导出字体',
      description: '导出图标字体文件供网页使用',
      shortcut: `${mod}E`,
    },
  ],
  [
    {
      key: 'settings',
      icon: <Settings size={15} />,
      label: '设置',
      description: '字体前缀与项目配置',
    },
  ],
];

const FileMenuBar = React.memo(function FileMenuBar({ onMenuAction }: FileMenuBarProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Always open above the trigger (bottom bar)
      setPos({ top: rect.top - 6, left: rect.left });
    }
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

  return (
    <>
      <div className="flex shrink-0 items-center border-t border-border px-2.5 h-[42px]">
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
          文件
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
      </div>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
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
                    <span className="mt-0.5 shrink-0 text-foreground-muted group-hover:text-brand-500 transition-colors duration-75">
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
