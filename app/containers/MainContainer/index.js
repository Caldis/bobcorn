// React
import React from 'react';
// Antd
import { Modal } from 'antd';
// Components
import TitleBarButtonGroup from  '../../components/TitleBar/button';
import SplashScreen from '../../components/SplashScreen';
import SideMenu from '../../components/SideMenu';
import SideGrid from '../../components/SideGrid';
import SideEditor from '../../components/SideEditor';
// Config
import config from '../../config';
// Styles
import style from './index.module.css';
// Utils
import {GlobalEvent, preventDrop, disableChromeAutoFocus, platform} from '../../utils/tools';

// ====================================================
// GlobalEvent.dispatchEvent("SplashScreen", { show: true }); true, false
// GlobalEvent.dispatchEvent("SelectGroup", { id: "groupId" }); // resource-all, resource-uncategorized, ....
// GlobalEvent.dispatchEvent("SelectIcon", { id: "iconId" });
// GlobalEvent.dispatchEvent("SelectSource", { id: "sourceId" }); // local, cloud
// GlobalEvent.dispatchEvent('SetMenuVisible', BOOL);
// GlobalEvent.dispatchEvent('SetEditorVisible', BOOL);
// ====================================================

class MainContainer extends React.Component{
    constructor(props) {
        super(props);

        this.state = {
        	splashScreenVisible: false,
            contentVisible: 0,
            selectedGroup: config.defaultSelectedGroup,
            selectedIcon: null,
            selectedSource: "local", // local, cloud
	        sideMenuVisible: true,
	        sideEditorVisible: true
        };
    }

    // https://facebook.github.io/react/docs/state-and-lifecycle.html
    // On React IconGridLocal Mounting
    componentDidMount() {
        // 禁止拖放文件
        preventDrop();
        // 禁止自动 Focus 按钮
        disableChromeAutoFocus();
	    // 接收到 SplashScreen 的事件后根据传入的 show 来决定是否显示
	    GlobalEvent.addEventHandler("SplashScreen", this.handleSplashScreenShow);
        // 接收到 SelectGroup 的事件后根据传入的 Key 来更改选择的组
        GlobalEvent.addEventHandler("SelectGroup", this.handleGroupSelectedFromEvent);
	    // 接收到 SelectIcon 的事件后根据传入的 id 来更改选择的图标
	    GlobalEvent.addEventHandler("SelectIcon", this.handleIconSelectedFromEvent);
	    // 接收到 SelectSource 的事件后根据传入的 id 来更改选择的源 (本地/发现)
	    GlobalEvent.addEventHandler("SelectSource", this.handleSourceSelectedFromEvent);
	    // 接收到 SetMenuVisible 的事件后 显示/隐藏 左侧菜单栏
	    GlobalEvent.addEventHandler('SetMenuVisible', this.handleSideMenuVisible);
	    // 接收到 SetEditorVisible 的事件后 显示/隐藏 右侧编辑栏
	    GlobalEvent.addEventHandler('SetEditorVisible', this.handleSideEditorVisible);
        // 进来后同步一次中间的图标区块
        GlobalEvent.dispatchEvent("SyncCenterLocal");
        // 显示欢迎界面
        setTimeout(()=>this.handleSplashScreenShow(true), 100);
    }
    componentWillUnmount() {
        // 移除事件注册
        GlobalEvent.removeEventHandler("SplashScreen", this.handleSplashScreenShow);
        GlobalEvent.removeEventHandler("SelectGroup", this.handleGroupSelectedFromEvent);
        GlobalEvent.removeEventHandler("SelectIcon", this.handleIconSelectedFromEvent);
        GlobalEvent.removeEventHandler("SelectSource", this.handleSourceSelectedFromEvent);
	    GlobalEvent.removeEventHandler("SetMenuVisible", this.handleSideMenuVisible);
	    GlobalEvent.removeEventHandler("SetEditorVisible", this.handleSideEditorVisible);
    }


	// 欢迎界面
	handleSplashScreenShow = (show) => {
		this.setState({
            splashScreenVisible: show,
            contentVisible: show ? 0 : 1
		});
	};

    // 组选择
    handleGroupSelectedFromEvent = (options) => {
        this.handleGroupSelected(options.id);
    };
    handleGroupSelected = (selectedGroup) => {
        this.setState({
            selectedGroup: selectedGroup,
            selectedIcon: null
        });
        // 选择组时自动切换回本地
        this.handleSourceSelected("local");
    };
    // 图标选择
    handleIconSelectedFromEvent = (options) => {
	    this.handleIconSelected(options.id);
    };
    handleIconSelected = (selectedIcon) => {
        this.setState({ selectedIcon });
    };
    // 源选择
    handleSourceSelectedFromEvent = (options) => {
        this.handleSourceSelected(options.id);
    };
    handleSourceSelected = (selectedSource) => {
        this.setState({ selectedSource });
	    selectedSource==="local" && this.handleSideEditorVisible(true);
	    selectedSource==="cloud" && this.handleSideEditorVisible(false);
    };

	// 边栏可见性控制
	handleSideMenuVisible = (sideMenuVisible) => {
		this.setState({ sideMenuVisible });
	};
	handleSideEditorVisible = (sideEditorVisible) => {
		this.setState({ sideEditorVisible });
	};

    render() {
        const contentVisible = this.state.contentVisible ? {
            opacity: 1,
            // filter: "blur(0)"
        } : {
            opacity: 0,
            // filter: "blur(5px)"
        }
        return (
            <div className={style.mainContainer}>

	            {/*欢迎界面*/}
	            <Modal
                    closable={false}
		            wrapClassName="vertical-center-modal no-shadow-modal"
		            open={this.state.splashScreenVisible}
		            footer={null} maskClosable={false}
	                onCancel={()=>this.handleSplashScreenShow(false)}
	            >
		            <SplashScreen visible={this.handleSplashScreenShow}/>
	            </Modal>

	            {/*主体内容*/}
                <div
	                className={this.state.sideMenuVisible ? style.sideMenuFlexWrapper : style.sideMenuFlexWrapperHide}
	                style={contentVisible}
                >
                    <SideMenu
                        handleGroupSelected={this.handleGroupSelected}
                        selectedGroup={this.state.selectedGroup}
                    />
                </div>
                <div
	                className={style.sideIconContainZoneFlexWrapper}
	                style={contentVisible}
                >
                    <SideGrid
                        selectedGroup={this.state.selectedGroup}
                        handleIconSelected={this.handleIconSelected}
                        selectedIcon={this.state.selectedIcon}
                        handleSourceSelected={this.handleSourceSelected}
                        selectedSource={this.state.selectedSource}
                    />
                </div>
                <div
	                className={this.state.sideEditorVisible ? style.sideEditorFlexWrapper : style.sideEditorFlexWrapperHide}
	                style={contentVisible}
                >
                    <SideEditor
                        selectedGroup={this.state.selectedGroup}
                        selectedIcon={this.state.selectedIcon}
                    />
                </div>

	            {/*控制按钮*/}
                { platform()==="win32" && <TitleBarButtonGroup/>}

            </div>
        );
    }
}

export default MainContainer;