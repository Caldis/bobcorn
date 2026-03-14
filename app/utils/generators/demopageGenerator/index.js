// fs
import fs from 'fs';
// Database
import db from '../../../database';
// Path
import { demoHTMLFile, iconfontCSSFile, iconfontJSHeadFile, iconfontJSTailFile } from '../../../config';


// 生成demo页面文本
// 模板自 /resources/iconDocs/indexTemplate.html 读取
// 写入图标字码数据, 然后返回页面HTML文本
export const demoHTMLGenerator = (groups, icons) => {
	const parser = new DOMParser();
	const pageTemplate = parser.parseFromString(fs.readFileSync(demoHTMLFile).toString(), "text/html");
	const iconsContainer = pageTemplate.querySelector("[content=icons]");
	iconsContainer.innerHTML = `
		var projectName = ${JSON.stringify(db.getProjectName())}
		var groups = ${JSON.stringify(groups)};
		var icons = ${JSON.stringify(icons)};
	`;
	return pageTemplate.querySelector('html').outerHTML;
};

// 生成模板CSS文件以供界面引用
export const iconfontCSSGenerator = (icons) => {
    const projectName = db.getProjectName()
	let iconfontTemplate = fs.readFileSync(iconfontCSSFile).toString().replace(/iconfont/g, projectName);
    // 将 iconfont 的 prefix 替换为用户定义
    let projectNameIconfontTemplate = iconfontTemplate.replace(/iconfont/g, projectName);
	icons.forEach(icon => {
		const iconCode = icon.iconCode.toLowerCase();
		return projectNameIconfontTemplate += `.${db.getProjectName()}-${iconCode}:before { content: "\\${iconCode}"; }`
	});
	return projectNameIconfontTemplate;
};

// 生成模板Symbol的JS文件以供界面引用
export const iconfontSymbolGenerator = (icons) => {
	const iconfontTemplateHead = fs.readFileSync(iconfontJSHeadFile).toString();
    const iconfontTemplateTail = fs.readFileSync(iconfontJSTailFile).toString();
	let iconfontTemplate = "";
	const regex = /<svg[^>]+?>([^$]+?)<\/svg>/;
	const projectName = db.getProjectName()
    icons.forEach(icon => {
        // 解析svg, 提取子项
        const iconContent = icon.iconContent;
        const iconParsed = (new DOMParser()).parseFromString(iconContent, "image/svg+xml");
        const iconViewBox = iconParsed.documentElement.viewBox.baseVal;
        const iconContentWithoutParent = regex.exec(iconContent)[1];
        // 创建symbol头尾
        const symbolHead =  `<symbol id="${projectName}-${icon.iconCode}" viewBox="0 0 ${iconViewBox.width} ${iconViewBox.height}">`;
        const symbolTail =  `</symbol>`;
        iconfontTemplate += symbolHead + iconContentWithoutParent.replace(/\'|\‘|\’|\“|\”/g, '\"') + symbolTail;
    });
    return iconfontTemplateHead + iconfontTemplate + iconfontTemplateTail;
};