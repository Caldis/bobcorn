// Electron API (via preload contextBridge)
const { electronAPI } = window;

interface IconFile {
	path: string;
}

interface ImportIconsOptions {
	onSelectSVG?: (files: IconFile[]) => void;
}

// 弹出文件选择对话框, 选择并导入图标
const importIcons = async (options: ImportIconsOptions = {}): Promise<void> => {
	const result = await electronAPI.showOpenDialog({
		title: "选择一个或多个SVG图标文件",
		filters: [{ name: "SVG图标文件", extensions: ["svg"] }],
		properties: [ "openFile", "multiSelections" ]
	});
	if (!result.canceled && result.filePaths.length > 0) {
		const files: IconFile[] = result.filePaths.map(path => ({path}));
		options.onSelectSVG && options.onSelectSVG(files);
	}
};

export default importIcons;
