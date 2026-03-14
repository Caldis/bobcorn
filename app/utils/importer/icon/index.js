// electron
import { remote } from 'electron';
const dialog = remote.dialog;
const BrowserWindow = remote.BrowserWindow;

// 弹出文件选择对话框, 选择并导入图标
const importIcons = (options = {onSelectSVG: ()=>{}}) => {
	let files = dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
		title: "选择一个或多个SVG图标文件",
		filters: [{ name: "SVG图标文件", extensions: ["svg"] }],
		properties: [ "openFile", "multiSelections" ]
	});
	if (files) {
		files = files.map(path => ({path}));
		options.onSelectSVG && options.onSelectSVG(files);
	}
};

export default importIcons;