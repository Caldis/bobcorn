// React
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
// Components
import TitleBarButtonGroup from '../../components/TitleBar/button';
import SplashScreen from '../../components/SplashScreen';
import SideMenu from '../../components/SideMenu';
import SideGrid from '../../components/SideGrid';
import SideEditor from '../../components/SideEditor';
import BatchPanel from '../../components/BatchPanel';
import { confirm, message } from '../../components/ui';
// Utils
import { cn } from '../../lib/utils';
import { preventDrop, disableChromeAutoFocus, platform } from '../../utils/tools';
import { projImporter } from '../../utils/importer';
import { cpLoader, icpLoader } from '../../utils/loaders';
import { warnIfProjectCodeIssues } from '../../components/SideMenu/codeAudit';
// Database
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): project.save, project.open-file, project.reset
import db from '../../database';
// Config
import { getOption, setOption } from '../../config';
import type { OptionData } from '../../config';
// Utils – dirty guard
import { guardDirtyState } from '../../utils/dirtyGuard';
// Store
import useAppStore, { analyticsTrack } from '../../store';
// Analytics consent
import ConsentDialog from '../../components/ConsentDialog';
// New project dialog (project name + icon code prefix)
import NewProjectDialog from '../../components/NewProjectDialog';

const { electronAPI } = window;

// ── Resizable divider ───────────────────────────────────────────────
function ResizeHandle({
  onResize,
  side,
  onDragChange,
}: {
  onResize: (delta: number) => void;
  side: 'left' | 'right';
  onDragChange?: (dragging: boolean) => void;
}) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastX.current = e.clientX;
      onDragChange?.(true);

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta = ev.clientX - lastX.current;
        lastX.current = ev.clientX;
        onResize(side === 'left' ? delta : -delta);
      };

      const onMouseUp = () => {
        dragging.current = false;
        onDragChange?.(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onResize, side, onDragChange]
  );

  return (
    <div
      className={cn(
        'relative shrink-0 cursor-col-resize z-10',
        'before:absolute before:inset-y-0 before:left-1/2 before:w-[3px] before:-translate-x-1/2',
        'before:transition-colors before:duration-150',
        'hover:before:bg-accent/40 active:before:bg-accent/60'
      )}
      style={{ width: 8, marginLeft: -4, marginRight: -4 }}
      onMouseDown={onMouseDown}
    />
  );
}

// ── Main Container ──────────────────────────────────────────────────
function MainContainer() {
  const { t } = useTranslation();
  const splashScreenVisible = useAppStore((state: any) => state.splashScreenVisible);
  const selectedGroup = useAppStore((state: any) => state.selectedGroup);
  const selectedIcon = useAppStore((state: any) => state.selectedIcon);
  const selectedSource = useAppStore((state: any) => state.selectedSource);
  const sideMenuVisible = useAppStore((state: any) => state.sideMenuVisible);
  const sideEditorVisible = useAppStore((state: any) => state.sideEditorVisible);
  const selectedIcons = useAppStore((state: any) => state.selectedIcons);

  const currentFilePath = useAppStore((s: any) => s.currentFilePath);
  const projectDisplayName = useAppStore((s: any) => s.projectDisplayName);
  const isDirty = useAppStore((s: any) => s.isDirty);
  const [resizing, setResizing] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);

  const selectGroup = useAppStore((state: any) => state.selectGroup);
  const selectIcon = useAppStore((state: any) => state.selectIcon);
  const selectSource = useAppStore((state: any) => state.selectSource);

  const opts = getOption() as {
    sideMenuWidth?: number;
    sideEditorWidth?: number;
    darkMode?: boolean;
  };
  const [leftWidth, setLeftWidth] = useState(opts.sideMenuWidth || 250);
  const [rightWidth, setRightWidth] = useState(opts.sideEditorWidth || 250);

  const handleLeftResize = useCallback((delta: number) => {
    setLeftWidth((w) => {
      const next = Math.max(180, Math.min(400, w + delta));
      setOption({ sideMenuWidth: next });
      return next;
    });
  }, []);

  const handleRightResize = useCallback((delta: number) => {
    setRightWidth((w) => {
      const next = Math.max(200, Math.min(400, w + delta));
      setOption({ sideEditorWidth: next });
      return next;
    });
  }, []);

  /** Save As — always shows dialog */
  const handleSaveAs = useCallback(async () => {
    const result = await electronAPI.showSaveDialog({
      title: t('file.saveDialogTitle'),
      defaultPath: db.getProjectName(),
      filters: [{ name: 'Bobcorn Project', extensions: ['icp'] }],
    });
    if (result.canceled || !result.filePath) return;
    let savePath = result.filePath;
    if (!savePath.endsWith('.icp')) savePath += '.icp';

    return new Promise<void>((resolve, reject) => {
      db.exportProject((projData: Uint8Array) => {
        const buffer = Buffer.from(projData);
        electronAPI
          .writeFile(savePath, buffer)
          .then(() => {
            useAppStore.getState().setCurrentFilePath(savePath);
            useAppStore.getState().markClean();
            const hist: string[] = (getOption('histProj') as string[]) || [];
            const updated = [savePath, ...hist.filter((p: string) => p !== savePath)].slice(0, 10);
            setOption({ histProj: updated });
            message.success(t('file.saved'));
            analyticsTrack('project.save');
            resolve();
          })
          .catch((err: Error) => {
            message.error(t('file.saveFailed', { error: err.message }));
            reject(err);
          });
      });
    });
  }, [t]);

  /** Save project to known path, or fall through to Save As */
  const handleSave = useCallback(async () => {
    const state = useAppStore.getState();
    if (!state.isDirty && state.currentFilePath) {
      message.info(t('file.noChanges'), 1500);
      return;
    }
    if (state.currentFilePath) {
      return new Promise<void>((resolve, reject) => {
        db.exportProject((projData: Uint8Array) => {
          const buffer = Buffer.from(projData);
          electronAPI
            .writeFile(state.currentFilePath!, buffer)
            .then(() => {
              useAppStore.getState().markClean();
              message.success(t('file.saved'));
              analyticsTrack('project.save');
              resolve();
            })
            .catch((err: Error) => {
              message.error(t('file.saveFailed', { error: err.message }));
              useAppStore.getState().setCurrentFilePath(null);
              reject(err);
            });
        });
      });
    } else {
      return handleSaveAs();
    }
  }, [handleSaveAs, t]);

  /** Unified project open — used by menu, splash screen, and file association */
  const handleOpenProject = useCallback(
    async (filePath?: string) => {
      const canProceed = await guardDirtyState({
        saveHandler: handleSave,
        action: t('dirtyGuard.actionOpen'),
      });
      if (!canProceed) return;

      projImporter({
        path: filePath,
        onSelectCP: (project: any) => {
          cpLoader({ data: project.data }, () => {
            useAppStore.getState().showSplashScreen(false);
            useAppStore.getState().setCurrentFilePath(null);
            useAppStore.getState().markClean();
            useAppStore.getState().syncLeft();
            useAppStore.getState().selectGroup('resource-all');
            message.success(t('file.opened'));
            warnIfProjectCodeIssues();
            analyticsTrack('project.open');
          });
        },
        onSelectICP: (project: any) => {
          icpLoader(project.data, () => {
            useAppStore.getState().showSplashScreen(false);
            useAppStore.getState().setCurrentFilePath(project.path || null);
            useAppStore.getState().markClean();
            useAppStore.getState().syncLeft();
            useAppStore.getState().selectGroup('resource-all');
            message.success(t('file.opened'));
            warnIfProjectCodeIssues();
            analyticsTrack('project.open');
          });
        },
      });
    },
    [handleSave, t]
  );

  /** New project — 先做脏数据确认，再弹出命名对话框 */
  const handleNewProject = useCallback(async () => {
    const canProceed = await guardDirtyState({
      saveHandler: handleSave,
      action: t('dirtyGuard.actionNew'),
    });
    if (!canProceed) return;
    setNewProjectDialogOpen(true);
  }, [handleSave, t]);

  /** 命名对话框确认 — displayName 为项目名称, prefix 为图标字码前缀 */
  const handleCreateProject = useCallback(
    ({ displayName, prefix }: { displayName: string; prefix: string }) => {
      setNewProjectDialogOpen(false);
      db.resetProject(prefix, displayName || undefined);
      useAppStore.getState().resetIconContentCaches();
      useAppStore.getState().setCurrentFilePath(null);
      useAppStore.getState().markClean();
      useAppStore.getState().syncLeft();
      useAppStore.getState().selectGroup('resource-all');
      useAppStore.getState().showSplashScreen(false);
      analyticsTrack('project.create');
    },
    []
  );

  /** Close project — return to welcome screen */
  const handleCloseProject = useCallback(async () => {
    const canProceed = await guardDirtyState({
      saveHandler: handleSave,
      action: t('dirtyGuard.actionClose'),
    });
    if (!canProceed) return;
    db.resetProject();
    useAppStore.getState().setCurrentFilePath(null);
    useAppStore.getState().markClean();
    useAppStore.getState().syncLeft();
    useAppStore.getState().showSplashScreen(true);
  }, [handleSave, t]);

  /** Install update with dirty-state protection */
  const handleInstallUpdate = useCallback(async () => {
    const canProceed = await guardDirtyState({
      saveHandler: handleSave,
      action: t('dirtyGuard.actionUpdate'),
    });
    if (!canProceed) return;

    // In dev mode, quitAndInstall will crash — offer a choice instead
    if (import.meta.env.DEV) {
      confirm({
        title: t('update.devInstallTitle'),
        content: t('update.devInstallContent'),
        okText: t('update.devInstallOk'),
        cancelText: t('update.devInstallIgnore'),
        onOk: () => {
          electronAPI.installUpdate();
        },
      });
      return;
    }
    electronAPI.installUpdate();
  }, [handleSave, t]);

  useEffect(() => {
    preventDrop();
    disableChromeAutoFocus();
    // Sync theme store state (DOM class already applied in bootstrap.tsx)
    const themeMode = (opts as any).themeMode ?? (opts.darkMode ? 'dark' : 'light');
    useAppStore.getState().setThemeMode(themeMode);

    // Listen for OS theme changes when in 'system' mode
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if (useAppStore.getState().themeMode === 'system') {
        useAppStore.getState().setThemeMode('system');
      }
    };
    mq.addEventListener('change', handleSystemChange);
    return () => mq.removeEventListener('change', handleSystemChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only run; `opts` is a fresh object every render (getOption() is unmemoized), so adding it would re-run this on every render instead of just once
  }, []);

  // ── Analytics consent — load on mount ─────────────────────────
  const loadAnalyticsConsent = useAppStore((s: any) => s.loadAnalyticsConsent);
  useEffect(() => {
    loadAnalyticsConsent();
  }, [loadAnalyticsConsent]);

  // ── Menu IPC listeners (Electron menu) ────────────────────────────
  useEffect(() => {
    // Remove the early bootstrap listener now that React is mounted
    const earlyCleanup = (window as any).__BOBCORN_EARLY_OPEN_FILE_CLEANUP__;
    if (earlyCleanup) {
      earlyCleanup();
      delete (window as any).__BOBCORN_EARLY_OPEN_FILE_CLEANUP__;
    }

    const cleanups = [
      electronAPI.onMenuNewProject(() => handleNewProject()),
      electronAPI.onMenuOpenProject(() => handleOpenProject()),
      electronAPI.onMenuImportIcons(() => {
        // store 命令面 — 无 targetGroupId, SideMenu 回退当前选中分组
        useAppStore.getState().requestImportIcons();
      }),
      electronAPI.onMenuSave(() => handleSave()),
      electronAPI.onMenuSaveAs(() => handleSaveAs()),
      electronAPI.onMenuExportFonts(() => {
        // store 命令面 — 无预选分组, ExportDialog 沿用持久化选择
        useAppStore.getState().openExportDialog();
      }),
      electronAPI.onOpenFile((filePath: string) => handleOpenProject(filePath)),
    ];

    // Consume any file path buffered before React mounted
    const pendingFile = (window as any).__BOBCORN_PENDING_FILE__;
    if (pendingFile) {
      delete (window as any).__BOBCORN_PENDING_FILE__;
      handleOpenProject(pendingFile);
    }

    return () => cleanups.forEach((fn) => fn());
  }, [handleOpenProject, handleSave, handleSaveAs, handleNewProject]);

  // ── FileMenuBar custom events (renderer-side file menu) ──────────
  useEffect(() => {
    const handlers: Record<string, (e: Event) => void> = {
      'bobcorn:new-project': () => handleNewProject(),
      'bobcorn:open-project': (e: Event) => {
        const path = (e as CustomEvent).detail?.path as string | undefined;
        handleOpenProject(path);
      },
      'bobcorn:save': () => handleSave(),
      'bobcorn:save-as': () => handleSaveAs(),
      'bobcorn:close-project': () => handleCloseProject(),
    };
    const entries = Object.entries(handlers);
    entries.forEach(([event, handler]) => window.addEventListener(event, handler));
    return () => entries.forEach(([event, handler]) => window.removeEventListener(event, handler));
  }, [handleOpenProject, handleSave, handleSaveAs, handleNewProject, handleCloseProject]);

  // ── Close guard ──────────────────────────────────────────────────
  useEffect(() => {
    const cleanup = electronAPI.onConfirmClose(async () => {
      const canProceed = await guardDirtyState({
        saveHandler: handleSave,
        action: t('dirtyGuard.actionClose'),
      });
      if (canProceed) {
        electronAPI.confirmClose();
      } else {
        electronAPI.closeCancelled();
      }
    });

    return cleanup;
  }, [handleSave, t]);

  // ── Language sync (i18n) ────────────────────────────────────────
  useEffect(() => {
    const cleanup = electronAPI.onLanguageRequest(() => {
      electronAPI.languageChanged(i18n.language);
    });
    return cleanup;
  }, []);

  // ── Auto-update IPC ──────────────────────────────────────────
  useEffect(() => {
    const cleanups = [
      electronAPI.onUpdateChecking(() => {
        useAppStore.getState().setUpdateStatus('checking');
      }),
      electronAPI.onUpdateNotAvailable(() => {
        useAppStore.getState().setUpdateStatus('idle');
      }),
      electronAPI.onUpdateAvailable((info) => {
        useAppStore.setState({ updateReleaseNotes: info.releaseNotes || null });
        const opts = getOption() as OptionData;
        if (opts.autoDownloadUpdate) {
          useAppStore.getState().setUpdateStatus('downloading');
          useAppStore.setState({ updateVersion: info.version });
        } else {
          useAppStore.getState().setUpdateStatus('available', info.version);
        }
      }),
      electronAPI.onUpdateProgress((info) => {
        const { updateStatus } = useAppStore.getState();
        if (updateStatus !== 'downloading') {
          useAppStore.getState().setUpdateStatus('downloading');
        }
        useAppStore.getState().setUpdateProgress(info.percent);
      }),
      electronAPI.onUpdateDownloaded(() => {
        useAppStore.getState().setUpdateStatus('downloaded');
      }),
      electronAPI.onUpdateError((info) => {
        useAppStore.getState().setUpdateStatus('error');
        useAppStore.getState().setUpdateError(info.message);
      }),
    ];
    return () => cleanups.forEach((fn) => fn());
  }, []);

  // Install-update 命令 (store 命令面, SideMenu 的 UpdateIndicator 经 requestInstallUpdate 触发)
  // — seq 用 ref 去重, 初值取挂载时快照: 挂载前发出的请求不补触发 (对齐原 CustomEvent 丢弃语义)
  const installUpdateRequest = useAppStore((s: any) => s.installUpdateRequest);
  const handledInstallSeqRef = useRef<number>(
    useAppStore.getState().installUpdateRequest?.seq ?? 0
  );
  useEffect(() => {
    if (!installUpdateRequest || installUpdateRequest.seq === handledInstallSeqRef.current) return;
    handledInstallSeqRef.current = installUpdateRequest.seq;
    handleInstallUpdate();
  }, [installUpdateRequest, handleInstallUpdate]);

  // ── Title bar sync ───────────────────────────────────────────────
  // 回退链: 项目名称(displayName) → 文件名 → Untitled
  useEffect(() => {
    const name =
      projectDisplayName ||
      (currentFilePath ? electronAPI.pathBasename(currentFilePath, '.icp') : 'Untitled');
    document.title = `${name}${isDirty ? '*' : ''} — Bobcorn`;
  }, [projectDisplayName, currentFilePath, isDirty]);

  return (
    <div className="flex h-full w-full flex-row flex-nowrap">
      {splashScreenVisible ? (
        /* 欢迎界面 — 全页渲染，不使用 Dialog */
        <SplashScreen />
      ) : (
        /* 主体内容 — 三栏布局 */
        <>
          {/*左侧边栏*/}
          <div
            className={cn(
              'shrink-0 overflow-hidden',
              !resizing && 'transition-[width,opacity] duration-300 ease-in-out',
              !sideMenuVisible && 'opacity-0'
            )}
            style={{
              width: sideMenuVisible ? leftWidth : 0,
              contain: 'layout style paint',
            }}
          >
            <SideMenu handleGroupSelected={selectGroup} selectedGroup={selectedGroup} />
          </div>

          {/* 左侧拖拽分隔线 */}
          {sideMenuVisible ? (
            <ResizeHandle onResize={handleLeftResize} side="left" onDragChange={setResizing} />
          ) : null}

          {/*中央图标网格*/}
          <div className="min-w-0 flex-1 overflow-hidden" style={{ contain: 'strict' }}>
            <SideGrid
              selectedGroup={selectedGroup}
              handleIconSelected={selectIcon}
              selectedIcon={selectedIcon}
              handleSourceSelected={selectSource}
              selectedSource={selectedSource}
            />
          </div>

          {/* 右侧拖拽分隔线 */}
          {sideEditorVisible ? (
            <ResizeHandle onResize={handleRightResize} side="right" onDragChange={setResizing} />
          ) : null}

          {/*右侧编辑器*/}
          <div
            className={cn(
              'shrink-0 overflow-hidden bg-surface-muted',
              !resizing && 'transition-[width,opacity] duration-300 ease-in-out',
              !sideEditorVisible && 'opacity-0'
            )}
            style={{
              width: sideEditorVisible ? rightWidth : 0,
              contain: 'layout style paint',
            }}
          >
            {selectedIcons.size >= 2 ? (
              <BatchPanel selectedGroup={selectedGroup} />
            ) : (
              <SideEditor selectedGroup={selectedGroup} selectedIcon={selectedIcon} />
            )}
          </div>
        </>
      )}

      {/*控制按钮 — 始终渲染，不受 splash 状态影响*/}
      {platform() === 'win32' && <TitleBarButtonGroup />}

      {/* Analytics consent dialog — shown once on first launch */}
      <ConsentDialog />

      {/* New project dialog — project name + icon code prefix */}
      <NewProjectDialog
        open={newProjectDialogOpen}
        onClose={() => setNewProjectDialogOpen(false)}
        onConfirm={handleCreateProject}
      />
    </div>
  );
}

export default MainContainer;
