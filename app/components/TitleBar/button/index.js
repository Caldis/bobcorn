// React
import React from 'react';
// Styles
import styles from './index.css';
// Electron
import { ipcRenderer } from 'electron';
// ButtonIcon
import minimize from '../../../resources/imgs/titleBarButton/minimize.svg'
import maximize from '../../../resources/imgs/titleBarButton/maximize.svg'
import close from '../../../resources/imgs/titleBarButton/close.svg'

class TitleBarButtonGroup extends React.Component{
    constructor(props) {
        super(props);

        // 一些临时变量
        this.maximized = false;
	    this.paddingOfBody = "";
	    this.borderRadiusOfRoot = "";
	    this.topOfTitleBarButtonGroup = "";
    }

    // 最小化
    handleWindowMinimum = () => {
	    ipcRenderer.send('window-minimize');
    };

    // 最大化
	handleWindowMaximum = () => {
		const body = document.querySelector("body");
		const root = document.querySelector("#root");
		const titleBarButtonGroup = document.querySelector("#titleBarButtonGroup");
		if(this.maximized){
			// 最小化窗口
			ipcRenderer.send('window-maximize');
			// 取消最大化后, 恢复 Body 的 Padding 和 Root 的 borderRadius和标题栏按钮位置
			body.style.padding = this.paddingOfBody;
			root.style.borderRadius = this.borderRadiusOfRoot;
			titleBarButtonGroup.style.top = this.topOfTitleBarButtonGroup;
			// 设定标志位
			this.maximized = false;
		}else{
			// 最大化窗口
			ipcRenderer.send('window-maximize');
			// 最大化后, 取消 Body 的 Padding 和 Root 的 borderRadius 和标题栏按钮位置
			this.paddingOfBody = window.getComputedStyle(body).padding;
			body.style.padding = "0";
			this.borderRadiusOfRoot = window.getComputedStyle(root).borderRadius;
			root.style.borderRadius = "0";
			this.topOfTitleBarButtonGroup = window.getComputedStyle(titleBarButtonGroup).top;
			titleBarButtonGroup.style.top = "0";
			// 设定标志位
			this.maximized = true;
		}
	};

	// 关闭
	handleWindowClose = () => {
		ipcRenderer.send('window-close');
	};

    render() {
        return (
            <div className={styles.titleBarButtonGroup} id="titleBarButtonGroup">
	            <button className={styles.titleBarMinButton} onClick={this.handleWindowMinimum}>
		            <img src={minimize}/>
	            </button>
	            <button className={styles.titleBarMaxButton} onClick={this.handleWindowMaximum}>
		            <img src={maximize}/>
	            </button>
	            <button className={styles.titleBarCloseButton} onClick={this.handleWindowClose}>
		            <img src={close}/>
	            </button>
            </div>
        )
    }
}

export default TitleBarButtonGroup;
