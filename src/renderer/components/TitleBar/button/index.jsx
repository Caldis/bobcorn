// React
import React, { useRef } from 'react';
// Styles
import styles from './index.module.css';
// Electron API (via preload contextBridge)
const { electronAPI } = window;
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
        electronAPI.windowMinimize();
    };

    // 最大化
    const handleWindowMaximum = () => {
        const body = document.querySelector("body");
        const root = document.querySelector("#root");
        const titleBarButtonGroup = document.querySelector("#titleBarButtonGroup");
        if (maximizedRef.current) {
            electronAPI.windowMaximize();
            body.style.padding = paddingOfBodyRef.current;
            root.style.borderRadius = borderRadiusOfRootRef.current;
            titleBarButtonGroup.style.top = topOfTitleBarButtonGroupRef.current;
            maximizedRef.current = false;
        } else {
            electronAPI.windowMaximize();
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
        electronAPI.windowClose();
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
