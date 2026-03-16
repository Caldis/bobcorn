// React
import React, { useEffect } from 'react';
// UI
import { Dialog } from '../../components/ui';
// Components
import TitleBarButtonGroup from '../../components/TitleBar/button';
import SplashScreen from '../../components/SplashScreen';
import SideMenu from '../../components/SideMenu';
import SideGrid from '../../components/SideGrid';
import SideEditor from '../../components/SideEditor';
// Utils
import { cn } from '../../lib/utils';
import { preventDrop, disableChromeAutoFocus, platform } from '../../utils/tools';
// Store
import useAppStore from '../../store';

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

  useEffect(() => {
    // 禁止拖放文件
    preventDrop();
    // 禁止自动 Focus 按钮
    disableChromeAutoFocus();
    // 显示欢迎界面
    setTimeout(() => showSplashScreen(true), 100);
  }, []);

  return (
    <div className="flex h-full w-full flex-row flex-nowrap">
      {/*欢迎界面*/}
      <Dialog
        closable={false}
        open={splashScreenVisible}
        onClose={() => showSplashScreen(false)}
        maskClosable={false}
        footer={null}
      >
        <SplashScreen />
      </Dialog>

      {/*主体内容 — 左侧边栏*/}
      <div
        className={cn(
          'shrink-0 overflow-hidden transition-[opacity,width] duration-300',
          sideMenuVisible ? 'w-[250px]' : 'w-0 !opacity-0'
        )}
        style={{ opacity: contentVisible ? 1 : 0 }}
      >
        <SideMenu handleGroupSelected={selectGroup} selectedGroup={selectedGroup} />
      </div>

      {/*主体内容 — 中央图标网格*/}
      <div
        className="min-w-0 flex-1 overflow-hidden transition-opacity duration-300"
        style={{ opacity: contentVisible ? 1 : 0, contain: 'strict' }}
      >
        <SideGrid
          selectedGroup={selectedGroup}
          handleIconSelected={selectIcon}
          selectedIcon={selectedIcon}
          handleSourceSelected={selectSource}
          selectedSource={selectedSource}
        />
      </div>

      {/*主体内容 — 右侧编辑器*/}
      <div
        className={cn(
          'shrink-0 overflow-hidden bg-surface-muted transition-[opacity,width] duration-300',
          sideEditorVisible ? 'w-[250px]' : 'w-0 !opacity-0'
        )}
        style={{ opacity: contentVisible ? 1 : 0 }}
      >
        <SideEditor selectedGroup={selectedGroup} selectedIcon={selectedIcon} />
      </div>

      {/*控制按钮*/}
      {platform() === 'win32' && <TitleBarButtonGroup />}
    </div>
  );
}

export default MainContainer;
