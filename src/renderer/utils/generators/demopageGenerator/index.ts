// Database
import db from '../../../database';
// Path
import {
  demoHTMLFile,
  iconfontCSSFile,
  iconfontJSHeadFile,
  iconfontJSTailFile,
} from '../../../config';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/** Group data passed to demo page generators */
interface DemoGroupData {
  id: string;
  groupName: string;
  [key: string]: any;
}

/** Icon data passed to demo page generators */
interface DemoIconData {
  iconCode: string;
  iconName: string;
  iconContent: string;
  [key: string]: any;
}

// 生成demo页面文本
// 模板自 /resources/iconDocs/indexTemplate.html 读取
// 写入图标字码数据, 然后返回页面HTML文本
export const demoHTMLGenerator = (groups: DemoGroupData[], icons: DemoIconData[]): string => {
  const { electronAPI } = window;
  const parser = new DOMParser();
  const pageTemplate = parser.parseFromString(
    electronAPI.readFileSync(demoHTMLFile, 'utf-8'),
    'text/html'
  );
  const iconsContainer = pageTemplate.querySelector('[content=icons]')!;
  iconsContainer.innerHTML = `
		var projectName = ${JSON.stringify(db.getProjectName())}
		var groups = ${JSON.stringify(groups)};
		var icons = ${JSON.stringify(icons)};
	`;
  return pageTemplate.querySelector('html')!.outerHTML;
};

// 生成模板CSS文件以供界面引用
export const iconfontCSSGenerator = (icons: DemoIconData[]): string => {
  const { electronAPI } = window;
  const projectName = db.getProjectName();
  const iconfontTemplate = electronAPI
    .readFileSync(iconfontCSSFile, 'utf-8')
    .replace(/iconfont/g, projectName);
  // 将 iconfont 的 prefix 替换为用户定义
  let projectNameIconfontTemplate = iconfontTemplate.replace(/iconfont/g, projectName);
  icons.forEach((icon: DemoIconData) => {
    const iconCode = icon.iconCode.toLowerCase();
    return (projectNameIconfontTemplate += `.${db.getProjectName()}-${iconCode}:before { content: "\\${iconCode}"; }`);
  });
  return projectNameIconfontTemplate;
};

// 生成模板Symbol的JS文件以供界面引用
export const iconfontSymbolGenerator = (icons: DemoIconData[]): string => {
  const { electronAPI } = window;
  const iconfontTemplateHead = electronAPI.readFileSync(iconfontJSHeadFile, 'utf-8');
  const iconfontTemplateTail = electronAPI.readFileSync(iconfontJSTailFile, 'utf-8');
  let iconfontTemplate = '';
  const regex = /<svg[^>]+?>([^$]+?)<\/svg>/;
  const projectName = db.getProjectName();
  icons.forEach((icon: DemoIconData) => {
    // 解析svg, 提取子项
    const iconContent = icon.iconContent;
    const iconParsed = new DOMParser().parseFromString(iconContent, 'image/svg+xml');
    const iconViewBox = (iconParsed.documentElement as unknown as SVGSVGElement).viewBox.baseVal;
    const iconContentWithoutParent = regex.exec(iconContent)![1];
    // 创建symbol头尾
    const symbolHead = `<symbol id="${projectName}-${icon.iconCode}" viewBox="0 0 ${iconViewBox.width} ${iconViewBox.height}">`;
    const symbolTail = `</symbol>`;
    iconfontTemplate +=
      symbolHead + iconContentWithoutParent.replace(/\'|\'|\'|\"|\"/g, '\"') + symbolTail;
  });
  return iconfontTemplateHead + iconfontTemplate + iconfontTemplateTail;
};
