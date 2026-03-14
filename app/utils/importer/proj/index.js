// electron
import { remote } from 'electron';
const dialog = remote.dialog;
const BrowserWindow = remote.BrowserWindow;
import { projFileLoader } from '../../../utils/loaders';
// Config
import { setOption, getOption } from '../../../config';

// 弹出文件选择对话框, 选择并导入项目
const importProj = (options = {path: null, onSelectCP: ()=>{}, onSelectICP: ()=>{}}) => {
	// 导入项目
	let path;
	if (options.path) {
		path = options.path;
	} else {
		const files = dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
			title: "选择项目文件",
			filters: [{ name: "项目文件", extensions: ["json", "icp"] }],
			properties: [ "openFile" ]
		});
		path = files ? files[0] : null;
	}
	if (path) {
		// 更新历史记录配置
		setOption({ histProj: getOption("histProj").concat([path]).unique().reverse() });
		// 根据文件类型处理导入
		const project = projFileLoader(path);
		// 导入的为 cp 项目文件
		if (project.type === "cp") {
			options.onSelectCP && options.onSelectCP(project);
		}
		// 导入的为 icp 项目文件
		if (project.type === "icp") {
			options.onSelectICP && options.onSelectICP(project);
		}
	}
};

export default importProj;
