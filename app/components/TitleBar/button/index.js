// React
import React, { useRef } from 'react';
// Styles
import styles from './index.module.css';
// Electron
import { ipcRenderer } from 'electron';
// ButtonIcon
import minimize from '../../../resources/imgs/titleBarButton/minimize.svg';
import maximize from '../../../resources/imgs/titleBarButton/maximize.svg';
import close from '../../../resources/imgs/titleBarButton/close.svg';

function TitleBarButtonGroup() {
    const maximizedRef = useRef(false);
    const paddingOfBodyRef = useRef("");
    const borderRadiusOfRootRef = useRef("");
    const topOfTitleBarButtonGroupRef = useRef("");

    // 最小化
    const handleWindowMinimum = () => {
        ipcRenderer.send('window-minimize');
    };

    // 最大化
    const handleWindowMaximum = () => {
        const body = document.querySelector("body");
        const root = document.querySelector("#root");
        const titleBarButtonGroup = document.querySelector("#titleBarButtonGroup");
        if (maximizedRef.current) {
            ipcRenderer.send('window-maximize');
            body.style.padding = paddingOfBodyRef.current;
            root.style.borderRadius = borderRadiusOfRootRef.current;
            titleBarButtonGroup.style.top = topOfTitleBarButtonGroupRef.current;
            maximizedRef.current = false;
        } else {
            ipcRenderer.send('window-maximize');
            paddingOfBodyRef.current = window.getComputedStyle(body).padding;
            body.style.padding = "0";
            borderRadiusOfRootRef.current = window.getComputedStyle(root).borderRadius;
            root.style.borderRadius = "0";
            topOfTitleBarButtonGroupRef.current = window.getComputedStyle(titleBarButtonGroup).top;
            titleBarButtonGroup.style.top = "0";
            maximizedRef.current = true;
        }
    };

    // 关闭
    const handleWindowClose = () => {
        ipcRenderer.send('window-close');
    };

    return (
        <div className={styles.titleBarButtonGroup} id="titleBarButtonGroup">
            <button className={styles.titleBarMinButton} onClick={handleWindowMinimum}>
                <img src={minimize}/>
            </button>
            <button className={styles.titleBarMaxButton} onClick={handleWindowMaximum}>
                <img src={maximize}/>
            </button>
            <button className={styles.titleBarCloseButton} onClick={handleWindowClose}>
                <img src={close}/>
            </button>
        </div>
    );
}

export default TitleBarButtonGroup;
