// React
import React, { useEffect, useState, useRef, useCallback } from 'react';
// Antd
import { Modal } from 'antd';
// Components
import TitleBarButtonGroup from '../../components/TitleBar/button';
import SplashScreen from '../../components/SplashScreen';
import SideMenu from '../../components/SideMenu';
import SideGrid from '../../components/SideGrid';
import SideEditor from '../../components/SideEditor';
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
  const contentVisible = useAppStore((state: any) => state.contentVisible);
  const selectedGroup = useAppStore((state: any) => state.selectedGroup);
  const selectedIcon = useAppStore((state: any) => state.selectedIcon);
  const selectedSource = useAppStore((state: any) => state.selectedSource);
  const sideMenuVisible = useAppStore((state: any) => state.sideMenuVisible);
  const sideEditorVisible = useAppStore((state: any) => state.sideEditorVisible);

  const showSplashScreen = useAppStore((state: any) => state.showSplashScreen);
  const selectGroup = useAppStore((state: any) => state.selectGroup);
  const selectIcon = useAppStore((state: any) => state.selectIcon);
  const selectSource = useAppStore((state: any) => state.selectSource);

  const opts = getOption() as { sideMenuWidth: number; sideEditorWidth: number };
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
    // Initialize dark mode from persisted settings
    const savedOpts = getOption() as { darkMode?: boolean };
    if (savedOpts.darkMode) {
      document.documentElement.classList.add('dark');
      useAppStore.getState().toggleDarkMode();
    }
    setTimeout(() => showSplashScreen(true), 100);
  }, []);

  return (
    <div className="flex h-full w-full flex-row flex-nowrap">
      {/*欢迎界面*/}
      <Modal
        closable={false}
        wrapClassName="vertical-center-modal no-shadow-modal"
        open={splashScreenVisible}
        footer={null}
        maskClosable={false}
        onCancel={() => showSplashScreen(false)}
      >
        <SplashScreen />
      </Modal>

      {/*主体内容 — 左侧边栏*/}
      <div
        className={cn(
          'shrink-0 overflow-hidden transition-[opacity] duration-300',
          !sideMenuVisible && '!w-0 !opacity-0'
        )}
        style={{
          width: sideMenuVisible ? leftWidth : 0,
          opacity: contentVisible ? 1 : 0,
        }}
      >
        <SideMenu handleGroupSelected={selectGroup} selectedGroup={selectedGroup} />
      </div>

      {/* 左侧拖拽分隔线 */}
      {sideMenuVisible && contentVisible ? (
        <ResizeHandle onResize={handleLeftResize} side="left" />
      ) : null}

      {/*主体内容 — 中央图标网格*/}
      <div
        className="min-w-0 flex-1 overflow-hidden transition-opacity duration-300"
        style={{ opacity: contentVisible ? 1 : 0 }}
      >
        <SideGrid
          selectedGroup={selectedGroup}
          handleIconSelected={selectIcon}
          selectedIcon={selectedIcon}
          handleSourceSelected={selectSource}
          selectedSource={selectedSource}
        />
      </div>

      {/* 右侧拖拽分隔线 */}
      {sideEditorVisible && contentVisible ? (
        <ResizeHandle onResize={handleRightResize} side="right" />
      ) : null}

      {/*主体内容 — 右侧编辑器*/}
      <div
        className={cn(
          'shrink-0 overflow-hidden bg-surface-muted transition-[opacity] duration-300',
          !sideEditorVisible && '!w-0 !opacity-0'
        )}
        style={{
          width: sideEditorVisible ? rightWidth : 0,
          opacity: contentVisible ? 1 : 0,
        }}
      >
        <SideEditor selectedGroup={selectedGroup} selectedIcon={selectedIcon} />
      </div>

      {/*控制按钮*/}
      {platform() === 'win32' && <TitleBarButtonGroup />}
    </div>
  );
}

export default MainContainer;
