// React
import React from 'react';
// UI
import { message } from '../ui/toast';
// Utils
import { cn } from '../../lib/utils';
import { projImporter } from '../../utils/importer';
import { cpLoader, icpLoader } from '../../utils/loaders';
// Config
import { getOption } from '../../config';
// Store
import useAppStore from '../../store';
// Assets
import appIcon from '../../resources/imgs/icon.png';

function SplashScreen() {
  const showSplashScreen = useAppStore((state: any) => state.showSplashScreen);
  const selectGroup = useAppStore((state: any) => state.selectGroup);
  const syncLeft = useAppStore((state: any) => state.syncLeft);

  const handleImportProj = (path?: string) => {
    projImporter({
      path,
      onSelectCP: (project: any) => {
        cpLoader({ data: project.data }, () => {
          showSplashScreen(false);
          message.success(`项目已导入`);
          syncLeft();
          selectGroup('resource-all');
        });
      },
      onSelectICP: (project: any) => {
        icpLoader(project.data, () => {
          showSplashScreen(false);
          message.success(`项目已导入`);
          syncLeft();
          selectGroup('resource-all');
        });
      },
    });
  };

  /** Extract the filename from a full path for display */
  const getFileName = (filePath: string): string => {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || filePath;
  };

  // 历史项目列表
  const buildHistProj = () => {
    const histProj: string[] = getOption('histProj');
    if (histProj.length > 0) {
      return histProj.map((path: string, index: number) => (
        <button
          key={index}
          title={path}
          onClick={() => handleImportProj(path)}
          className={cn(
            'group flex items-center gap-2.5 w-full px-3 py-2 rounded-md',
            'text-sm text-left truncate',
            'text-foreground-muted',
            'transition-all duration-200',
            'hover:bg-brand-50 hover:text-brand-700',
            'dark:hover:bg-brand-900/30 dark:hover:text-brand-300',
            'focus:outline-none focus:ring-2 focus:ring-ring/40'
          )}
        >
          {/* file icon */}
          <svg
            className={cn(
              'w-4 h-4 shrink-0 text-foreground-muted/50',
              'group-hover:text-brand-500 dark:group-hover:text-brand-400',
              'transition-colors duration-200'
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>

          <span className="truncate font-medium">{getFileName(path)}</span>
          <span className="hidden group-hover:inline-block ml-auto text-xs text-foreground-muted/60 truncate max-w-[180px]">
            {path}
          </span>
        </button>
      ));
    } else {
      return (
        <div className="flex flex-col items-center justify-center h-48 text-foreground-muted/40">
          <svg
            className="w-10 h-10 mb-3 opacity-40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11Z" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          <span className="text-sm">没有历史记录</span>
        </div>
      );
    }
  };

  return (
    <div className="flex flex-col items-center select-none">
      {/* ── Branding ─────────────────────────────── */}
      <div className="flex flex-col items-center mb-8">
        <img
          src={appIcon}
          alt="Bobcorn"
          className="w-16 h-16 mb-4 drop-shadow-md"
          draggable={false}
        />
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Bobcorn</h1>
        <p className="mt-1 text-sm text-foreground-muted">欢迎使用</p>
      </div>

      {/* ── Action Cards ─────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 w-full mb-6">
        {/* 启动新项目 */}
        <button
          onClick={() => showSplashScreen(false)}
          className={cn(
            'group relative flex flex-col items-center justify-center',
            'gap-2 p-5 rounded-lg',
            'border border-brand-200 dark:border-brand-800',
            'bg-gradient-to-b from-brand-50 to-white',
            'dark:from-brand-950/40 dark:to-surface',
            'hover:border-brand-400 dark:hover:border-brand-600',
            'hover:shadow-md hover:shadow-brand-100/60 dark:hover:shadow-brand-900/30',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-ring/50'
          )}
        >
          {/* plus icon */}
          <div
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-full',
              'bg-brand-100 dark:bg-brand-900/50',
              'text-brand-600 dark:text-brand-400',
              'group-hover:bg-brand-200 dark:group-hover:bg-brand-800/60',
              'transition-colors duration-200'
            )}
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-foreground">启动新项目</span>
        </button>

        {/* 打开项目文件 */}
        <button
          onClick={() => handleImportProj()}
          className={cn(
            'group relative flex flex-col items-center justify-center',
            'gap-2 p-5 rounded-lg',
            'border border-border',
            'bg-gradient-to-b from-surface-muted to-surface',
            'hover:border-brand-300 dark:hover:border-brand-700',
            'hover:shadow-md hover:shadow-brand-100/40 dark:hover:shadow-brand-900/20',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-ring/50'
          )}
        >
          {/* folder icon */}
          <div
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-full',
              'bg-surface-accent',
              'text-foreground-muted',
              'group-hover:bg-brand-100 dark:group-hover:bg-brand-900/50',
              'group-hover:text-brand-600 dark:group-hover:text-brand-400',
              'transition-colors duration-200'
            )}
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11Z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-foreground">打开项目文件</span>
        </button>
      </div>

      {/* ── History List ──────────────────────────── */}
      <div className="w-full">
        <div className="flex items-center gap-2 mb-2 px-1">
          <svg
            className="w-3.5 h-3.5 text-foreground-muted/60"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-xs font-medium uppercase tracking-wider text-foreground-muted/60">
            历史记录
          </span>
        </div>
        <div
          className={cn(
            'w-full max-h-60 overflow-y-auto rounded-lg',
            'border border-border bg-surface-muted/50',
            'p-1'
          )}
        >
          {buildHistProj()}
        </div>
      </div>
    </div>
  );
}

export default SplashScreen;
