// React
import React from 'react';
// Antd
import { Button, Modal, message } from 'antd';
const confirm = Modal.confirm;
// Styles
import styles from './index.css';
// Utils
import { projImporter } from '../../utils/importer';
import { GlobalEvent, nameOfPath } from '../../utils/tools';
import { cpLoader, icpLoader } from '../../utils/loaders';
// Config
import { getOption } from '../../config';

class SplashScreen extends React.Component{
    constructor(props) {
        super(props);
    }

    handleImportProj = (path) => {
	    projImporter({
			path,
		    onSelectCP: (project) => {
			    cpLoader({ data: project.data }, () => {
				    this.props.visible(false)
				    message.success(`项目已导入`);
				    GlobalEvent.dispatchEvent('SyncCenterLocal');
				    GlobalEvent.dispatchEvent('SyncLeft');
				    GlobalEvent.dispatchEvent("SelectGroup", { id: "resource-all" });
			    });
		    },
		    onSelectICP: (project) => {
			    icpLoader(project.data, () => {
				    this.props.visible(false);
				    message.success(`项目已导入`);
				    GlobalEvent.dispatchEvent('SyncCenterLocal');
				    GlobalEvent.dispatchEvent('SyncLeft');
				    GlobalEvent.dispatchEvent("SelectGroup", { id: "resource-all" });
			    });
		    }
	    });
    };

    // 历史项目列表
    buildHistProj = () => {
    	const histProj = getOption("histProj");
    	if (histProj.length>0) {
		    return histProj.map((path, index) => {
			    return (
				    <Button className={styles.histProj} key={index} onClick={()=>this.handleImportProj(path)}>
						{ path }
				    </Button>
			    )
		    });
	    } else {
		    return <div className={styles.noHistProj}>没有记录</div>
	    }
    };

    render() {
        return (
            <div className={styles.splashScreen}>

	            {/*标题*/}
	            <div className={styles.title}>欢迎使用</div>

	            {/*内容*/}
	            <div className={styles.contentContainer}>

		            {/*左侧项目选择*/}
		            <div className={styles.ownProjContainer}>
			            <div className={styles.openProjContainer}>
				            <Button onClick={()=>this.props.visible(false)} type="primary">启动新项目</Button>
				            <Button onClick={()=>this.handleImportProj()}>打开项目文件</Button>
			            </div>
						<span>历史记录</span>
			            <div className={styles.histProjContainer}>
				            { this.buildHistProj() }
			            </div>
		            </div>

					{/*分割线*/}
					{/*<div className={styles.vHr}/>*/}

		            {/*右侧Demo选择*/}
		            {/*<div className={styles.demoProjContainer}>
			            <span>示例项目</span>
			            <div className={styles.demoProj}>
				            <img src="./resources/imgs/welcomer/material-icons.png" alt="Material"/>
				            <p>MaterialDesign</p>
			            </div>
			            <div className={styles.demoProj}>
				            <img src="./resources/imgs/welcomer/fontawesome-icons.png" alt="FontAwesome"/>
				            <p>FontAwesome</p>
			            </div>
		            </div>*/}

	            </div>
            </div>
        )
    }
}

export default SplashScreen;