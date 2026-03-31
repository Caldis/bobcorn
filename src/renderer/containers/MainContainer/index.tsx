// React
import React, { useEffect, useState, useRef, useCallback } from 'react';
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
// Database
import db from '../../database';
// Config
import { getOption, setOption } from '../../config';
// Store
import useAppStore from '../../store';

const { electronAPI } = window;

// ── Resizable divider ───────────────────────────────────────────────
function ResizeHandle({
  onResize,
  side,
}: {
  onResize: (delta: number) => void;
  side: 'left' | 'right';
}) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastX.current = e.clientX;

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta = ev.clientX - lastX.current;
        lastX.current = ev.clientX;
        onResize(side === 'left' ? delta : -delta);
      };

      const onMouseUp = () => {
        dragging.current = false;
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
    [onResize, side]
  );

  return (
    <div
      className={cn(
        'w-[3px] shrink-0 cursor-col-resize',
        'hover:bg-brand-400/40 active:bg-brand-400/60',
        'transition-colors duration-150'
      )}
      onMouseDown={onMouseDown}
    />
  );
}

// ── Main Container ──────────────────────────────────────────────────
function MainContainer() {
  const splashScreenVisible = useAppStore((state: any) => state.splashScreenVisible);
  const selectedGroup = useAppStore((state: any) => state.selectedGroup);
  const selectedIcon = useAppStore((state: any) => state.selectedIcon);
  const selectedSource = useAppStore((state: any) => state.selectedSource);
  const sideMenuVisible = useAppStore((state: any) => state.sideMenuVisible);
  const sideEditorVisible = useAppStore((state: any) => state.sideEditorVisible);
  const selectedIcons = useAppStore((state: any) => state.selectedIcons);

  const currentFilePath = useAppStore((s: any) => s.currentFilePath);
  const isDirty = useAppStore((s: any) => s.isDirty);

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

  /** Unified project open — used by menu, splash screen, and file association */
  const handleOpenProject = useCallback(async (filePath?: string) => {
    const dirty = useAppStore.getState().isDirty;
    if (dirty) {
      const proceed = await new Promise<boolean>((resolve) => {
        confirm({
          title: '未保存的更改',
          content: '当前项目有未保存的更改，是否继续？未保存的更改将会丢失。',
          okText: '继续',
          okType: 'danger',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!proceed) return;
    }

    projImporter({
      path: filePath,
      onSelectCP: (project: any) => {
        cpLoader({ data: project.data }, () => {
          useAppStore.getState().showSplashScreen(false);
          useAppStore.getState().setCurrentFilePath(null);
          useAppStore.getState().markClean();
          useAppStore.getState().syncLeft();
          useAppStore.getState().selectGroup('resource-all');
          message.success('项目已导入');
        });
      },
      onSelectICP: (project: any) => {
        icpLoader(project.data, () => {
          useAppStore.getState().showSplashScreen(false);
          useAppStore.getState().setCurrentFilePath(project.path || null);
          useAppStore.getState().markClean();
          useAppStore.getState().syncLeft();
          useAppStore.getState().selectGroup('resource-all');
          message.success('项目已导入');
        });
      },
    });
  }, []);

  /** Save As — always shows dialog */
  const handleSaveAs = useCallback(async () => {
    const result = await electronAPI.showSaveDialog({
      title: '保存项目文件',
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
            message.success('项目已保存');
            resolve();
          })
          .catch((err: Error) => {
            message.error(`保存失败: ${err.message}`);
            reject(err);
          });
      });
    });
  }, []);

  /** Save project to known path, or fall through to Save As */
  const handleSave = useCallback(async () => {
    const state = useAppStore.getState();
    if (state.currentFilePath) {
      return new Promise<void>((resolve, reject) => {
        db.exportProject((projData: Uint8Array) => {
          const buffer = Buffer.from(projData);
          electronAPI
            .writeFile(state.currentFilePath!, buffer)
            .then(() => {
              useAppStore.getState().markClean();
              message.success('项目已保存');
              resolve();
            })
            .catch((err: Error) => {
              message.error(`保存失败: ${err.message}`);
              useAppStore.getState().setCurrentFilePath(null);
              reject(err);
            });
        });
      });
    } else {
      return handleSaveAs();
    }
  }, [handleSaveAs]);

  /** New project */
  const handleNewProject = useCallback(async () => {
    const dirty = useAppStore.getState().isDirty;
    if (dirty) {
      const proceed = await new Promise<boolean>((resolve) => {
        confirm({
          title: '未保存的更改',
          content: '当前项目有未保存的更改，是否继续？未保存的更改将会丢失。',
          okText: '继续',
          okType: 'danger',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!proceed) return;
    }
    db.resetProject();
    useAppStore.getState().setCurrentFilePath(null);
    useAppStore.getState().markClean();
    useAppStore.getState().syncLeft();
    useAppStore.getState().selectGroup('resource-all');
    useAppStore.getState().showSplashScreen(false);
  }, []);

  useEffect(() => {
    preventDrop();
    disableChromeAutoFocus();
    // Sync dark mode store state (DOM class already applied in bootstrap.tsx)
    if (opts.darkMode) {
      useAppStore.getState().toggleDarkMode();
    }
  }, []);

  // ── Menu IPC listeners ───────────────────────────────────────────
  useEffect(() => {
    const cleanups = [
      electronAPI.onMenuNewProject(() => handleNewProject()),
      electronAPI.onMenuOpenProject(() => handleOpenProject()),
      electronAPI.onMenuSave(() => handleSave()),
      electronAPI.onMenuSaveAs(() => handleSaveAs()),
      electronAPI.onMenuExportFonts(() => {
        window.dispatchEvent(new CustomEvent('bobcorn:open-export'));
      }),
      electronAPI.onOpenFile((filePath: string) => handleOpenProject(filePath)),
    ];
    return () => cleanups.forEach((fn) => fn());
  }, [handleOpenProject, handleSave, handleSaveAs, handleNewProject]);

  // ── Close guard ──────────────────────────────────────────────────
  useEffect(() => {
    const cleanup = electronAPI.onConfirmClose(() => {
      const dirty = useAppStore.getState().isDirty;
      if (!dirty) {
        electronAPI.confirmClose();
        return;
      }
      confirm({
        title: '未保存的更改',
        content: '当前项目有未保存的更改。',
        okText: '保存并关闭',
        cancelText: '取消',
        onOk: async () => {
          try {
            await handleSave();
            electronAPI.confirmClose();
          } catch {
            // Save failed — don't close, let user try again
            electronAPI.closeCancelled();
          }
        },
        onCancel: () => {
          // User cancelled — don't close, clear the timeout
          electronAPI.closeCancelled();
        },
        // For "Discard" we'd need a third button, but the confirm component only supports two.
        // Users can cancel, then use the close button again and choose to save or not.
        // The 5s timeout in main process handles the unresponsive case.
      });
    });

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useAppStore.getState().isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      cleanup();
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [handleSave]);

  // ── Title bar sync ───────────────────────────────────────────────
  useEffect(() => {
    const name = currentFilePath ? electronAPI.pathBasename(currentFilePath, '.icp') : 'Untitled';
    document.title = `${name}${isDirty ? '*' : ''} — Bobcorn`;
  }, [currentFilePath, isDirty]);

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
              'shrink-0 overflow-hidden transition-[opacity] duration-300',
              !sideMenuVisible && '!w-0 !opacity-0'
            )}
            style={{
              width: sideMenuVisible ? leftWidth : 0,
              contain: 'layout style paint',
            }}
          >
            <SideMenu handleGroupSelected={selectGroup} selectedGroup={selectedGroup} />
          </div>

          {/* 左侧拖拽分隔线 */}
          {sideMenuVisible ? <ResizeHandle onResize={handleLeftResize} side="left" /> : null}

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
          {sideEditorVisible ? <ResizeHandle onResize={handleRightResize} side="right" /> : null}

          {/*右侧编辑器*/}
          <div
            className={cn(
              'shrink-0 overflow-hidden bg-surface-muted transition-[opacity] duration-300',
              !sideEditorVisible && '!w-0 !opacity-0'
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
    </div>
  );
}

export default MainContainer;
