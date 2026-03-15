// React
import React, { useEffect } from 'react';
// Antd
import { Modal } from 'antd';
// Components
import TitleBarButtonGroup from '../../components/TitleBar/button';
import SplashScreen from '../../components/SplashScreen';
import SideMenu from '../../components/SideMenu';
import SideGrid from '../../components/SideGrid';
import SideEditor from '../../components/SideEditor';
// Styles
import style from './index.module.css';
// Utils
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

  const contentVisibleStyle: React.CSSProperties = contentVisible
    ? {
        opacity: 1,
      }
    : {
        opacity: 0,
      };

  return (
    <div className={style.mainContainer}>
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

      {/*主体内容*/}
      <div
        className={sideMenuVisible ? style.sideMenuFlexWrapper : style.sideMenuFlexWrapperHide}
        style={contentVisibleStyle}
      >
        <SideMenu handleGroupSelected={selectGroup} selectedGroup={selectedGroup} />
      </div>
      <div className={style.sideIconContainZoneFlexWrapper} style={contentVisibleStyle}>
        <SideGrid
          selectedGroup={selectedGroup}
          handleIconSelected={selectIcon}
          selectedIcon={selectedIcon}
          handleSourceSelected={selectSource}
          selectedSource={selectedSource}
        />
      </div>
      <div
        className={
          sideEditorVisible ? style.sideEditorFlexWrapper : style.sideEditorFlexWrapperHide
        }
        style={contentVisibleStyle}
      >
        <SideEditor selectedGroup={selectedGroup} selectedIcon={selectedIcon} />
      </div>

      {/*控制按钮*/}
      {platform() === 'win32' && <TitleBarButtonGroup />}
    </div>
  );
}

export default MainContainer;
