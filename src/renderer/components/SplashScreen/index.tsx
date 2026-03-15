// React
import React from 'react';
// Antd
import { Button, message } from 'antd';
// Styles
import styles from './index.module.css';
// Utils
import { projImporter } from '../../utils/importer';
import { cpLoader, icpLoader } from '../../utils/loaders';
// Config
import { getOption } from '../../config';
// Store
import useAppStore from '../../store';

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

  // 历史项目列表
  const buildHistProj = () => {
    const histProj: string[] = getOption('histProj');
    if (histProj.length > 0) {
      return histProj.map((path: string, index: number) => {
        return (
          <Button className={styles.histProj} key={index} onClick={() => handleImportProj(path)}>
            {path}
          </Button>
        );
      });
    } else {
      return <div className={styles.noHistProj}>没有记录</div>;
    }
  };

  return (
    <div className={styles.splashScreen}>
      {/*标题*/}
      <div className={styles.title}>欢迎使用</div>

      {/*内容*/}
      <div className={styles.contentContainer}>
        {/*左侧项目选择*/}
        <div className={styles.ownProjContainer}>
          <div className={styles.openProjContainer}>
            <Button onClick={() => showSplashScreen(false)} type="primary">
              启动新项目
            </Button>
            <Button onClick={() => handleImportProj()}>打开项目文件</Button>
          </div>
          <span>历史记录</span>
          <div className={styles.histProjContainer}>{buildHistProj()}</div>
        </div>
      </div>
    </div>
  );
}

export default SplashScreen;
