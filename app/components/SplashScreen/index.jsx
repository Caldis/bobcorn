// React
import React from 'react';
// Antd
import { Button, Modal, message } from 'antd';
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
    const showSplashScreen = useAppStore(state => state.showSplashScreen);
    const selectGroup = useAppStore(state => state.selectGroup);
    const syncLeft = useAppStore(state => state.syncLeft);

    const handleImportProj = (path) => {
        projImporter({
            path,
            onSelectCP: (project) => {
                cpLoader({ data: project.data }, () => {
                    showSplashScreen(false);
                    message.success(`项目已导入`);
                    syncLeft();
                    selectGroup("resource-all");
                });
            },
            onSelectICP: (project) => {
                icpLoader(project.data, () => {
                    showSplashScreen(false);
                    message.success(`项目已导入`);
                    syncLeft();
                    selectGroup("resource-all");
                });
            }
        });
    };

    // 历史项目列表
    const buildHistProj = () => {
        const histProj = getOption("histProj");
        if (histProj.length > 0) {
            return histProj.map((path, index) => {
                return (
                    <Button className={styles.histProj} key={index} onClick={() => handleImportProj(path)}>
                        { path }
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
                        <Button onClick={() => showSplashScreen(false)} type="primary">启动新项目</Button>
                        <Button onClick={() => handleImportProj()}>打开项目文件</Button>
                    </div>
                    <span>历史记录</span>
                    <div className={styles.histProjContainer}>
                        { buildHistProj() }
                    </div>
                </div>

            </div>
        </div>
    );
}

export default SplashScreen;
