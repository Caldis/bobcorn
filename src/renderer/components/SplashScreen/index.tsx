// React
import React from 'react';
import { useTranslation } from 'react-i18next';
// UI
import { message } from '../ui/toast';
// Utils
import { cn } from '../../lib/utils';
import { projImporter } from '../../utils/importer';
import { cpLoader, icpLoader } from '../../utils/loaders';
// Hooks
import { useRecentProjects, getFileDisplayName } from '../../hooks/useRecentProjects';
// Components
import { ProjectItem } from '../ProjectItem';
// Store
import useAppStore from '../../store';
// Assets
import appIcon from '../../resources/imgs/icon.png';

function SplashScreen() {
  const { t } = useTranslation();
  const showSplashScreen = useAppStore((state: any) => state.showSplashScreen);
  const selectGroup = useAppStore((state: any) => state.selectGroup);
  const syncLeft = useAppStore((state: any) => state.syncLeft);
  const setCurrentFilePath = useAppStore((state: any) => state.setCurrentFilePath);
  const markClean = useAppStore((state: any) => state.markClean);

  const handleImportProj = (path?: string) => {
    projImporter({
      path,
      onSelectCP: (project: any) => {
        cpLoader({ data: project.data }, () => {
          setCurrentFilePath(null);
          markClean();
          showSplashScreen(false);
          message.success(t('file.opened'));
          syncLeft();
          selectGroup('resource-all');
        });
      },
      onSelectICP: (project: any) => {
        const p = (window as any).__BOBCORN_PERF__;
        p?.startSession();
        p?.mark('import.total');
        icpLoader(project.data, () => {
          p?.mark('import.uiUpdate');
          setCurrentFilePath(project.path || path || null);
          markClean();
          showSplashScreen(false);
          message.success(t('file.opened'));
          p?.mark('import.syncLeft');
          syncLeft();
          p?.measure('import.syncLeft');
          p?.mark('import.selectGroup');
          selectGroup('resource-all');
          p?.measure('import.selectGroup');
          p?.measure('import.uiUpdate');
          p?.measure('import.total');
          p?.endSession();
        });
      },
    });
  };

  // 历史记录 — 与 ProjectSwitcher 共享同一数据源
  const { histProj, removeHistItem, clearAllHist } = useRecentProjects();

  // 历史项目列表
  const buildHistProj = () => {
    if (histProj.length > 0) {
      return histProj.map((path: string) => (
        <ProjectItem
          key={path}
          name={getFileDisplayName(path)}
          path={path}
          onClick={() => handleImportProj(path)}
          onRemove={() => removeHistItem(path)}
          removeTitle={t('splash.removeRecord')}
        />
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
          <span className="text-sm">{t('splash.noHistory')}</span>
        </div>
      );
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-surface [-webkit-app-region:drag]">
      <div className="flex flex-col items-center select-none w-full max-w-md p-6 [-webkit-app-region:no-drag]">
        {/* ── Branding ─────────────────────────────── */}
        <div className="flex flex-col items-center mb-8">
          <img
            src={appIcon}
            alt="Bobcorn"
            className="w-16 h-16 mb-4 drop-shadow-md"
            draggable={false}
          />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Bobcorn</h1>
          <p className="mt-1 text-sm text-foreground-muted">{t('splash.welcome')}</p>
        </div>

        {/* ── Action Cards ─────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 w-full mb-6">
          {/* 启动新项目 */}
          <button
            onClick={() => showSplashScreen(false)}
            className={cn(
              'group relative flex flex-col items-center justify-center',
              'gap-2 p-5 rounded-lg',
              'border border-accent/30',
              'bg-gradient-to-b from-accent-subtle to-surface',
              'hover:border-accent',
              'hover:shadow-md hover:shadow-accent/15',
              'transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-ring/50'
            )}
          >
            {/* plus icon */}
            <div
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-full',
                'bg-accent-subtle',
                'text-accent',
                'group-hover:bg-accent-muted',
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
            <span className="text-sm font-semibold text-foreground">{t('splash.newProject')}</span>
          </button>

          {/* 打开项目文件 */}
          <button
            onClick={() => handleImportProj()}
            className={cn(
              'group relative flex flex-col items-center justify-center',
              'gap-2 p-5 rounded-lg',
              'border border-border',
              'bg-gradient-to-b from-surface-muted to-surface',
              'hover:border-accent/40',
              'hover:shadow-md hover:shadow-accent/10',
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
                'group-hover:bg-accent-subtle',
                'group-hover:text-accent',
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
            <span className="text-sm font-semibold text-foreground">{t('splash.openProject')}</span>
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
              {t('splash.history')}
            </span>
            {histProj.length > 0 && (
              <button
                onClick={clearAllHist}
                className={cn(
                  'ml-auto text-xs text-foreground-muted/50',
                  'hover:text-danger transition-colors duration-150',
                  'focus:outline-none'
                )}
              >
                {t('splash.clearAll')}
              </button>
            )}
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
    </div>
  );
}

export default SplashScreen;
