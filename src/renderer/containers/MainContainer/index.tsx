// React
import React, { useEffect, useState, useRef, useCallback } from 'react';
// Components
import TitleBarButtonGroup from '../../components/TitleBar/button';
import SplashScreen from '../../components/SplashScreen';
import SideMenu from '../../components/SideMenu';
import SideGrid from '../../components/SideGrid';
import SideEditor from '../../components/SideEditor';
import BatchPanel from '../../components/BatchPanel';
// Utils
import { cn } from '../../lib/utils';
import { preventDrop, disableChromeAutoFocus, platform } from '../../utils/tools';
// Config
import { getOption, setOption } from '../../config';
// Store
import useAppStore from '../../store';

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

  useEffect(() => {
    preventDrop();
    disableChromeAutoFocus();
    // Sync dark mode store state (DOM class already applied in bootstrap.tsx)
    if (opts.darkMode) {
      useAppStore.getState().toggleDarkMode();
    }
  }, []);

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
