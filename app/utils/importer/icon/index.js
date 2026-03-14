// electron
import { ipcRenderer } from 'electron';

// 弹出文件选择对话框, 选择并导入图标
const importIcons = async (options = {onSelectSVG: ()=>{}}) => {
	const result = await ipcRenderer.invoke('dialog-show-open', {
		title: "选择一个或多个SVG图标文件",
		filters: [{ name: "SVG图标文件", extensions: ["svg"] }],
		properties: [ "openFile", "multiSelections" ]
	});
	if (!result.canceled && result.filePaths.length > 0) {
		const files = result.filePaths.map(path => ({path}));
		options.onSelectSVG && options.onSelectSVG(files);
	}
};

export default importIcons;
