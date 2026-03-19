// Database
import db from '../../../database';
// Templates — inlined at build time via Vite ?raw import
// No runtime file I/O needed, works in both dev and production
import htmlTemplate from '../../../resources/iconDocs/indexTemplate.html?raw';
import cssTemplate from '../../../resources/iconDocs/iconfontTemplate(class).css?raw';
import jsHead from '../../../resources/iconDocs/iconfontTemplate(symbol).head.txt?raw';
import jsTail from '../../../resources/iconDocs/iconfontTemplate(symbol).tail.txt?raw';

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

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// 生成demo页面文本
// woff2Base64: woff2 字体 base64 编码，内嵌到 HTML 支持 file:// 打开
export const demoHTMLGenerator = (
  groups: DemoGroupData[],
  icons: DemoIconData[],
  woff2Base64?: string
): string => {
  const parser = new DOMParser();
  const pageTemplate = parser.parseFromString(htmlTemplate, 'text/html');
  const iconsContainer = pageTemplate.querySelector('[content=icons]')!;
  const fontLine = woff2Base64 ? `var fontBase64 = "${woff2Base64}";` : '';
  const projectName = db.getProjectName();
  iconsContainer.innerHTML = `
		var projectName = ${JSON.stringify(projectName)}
		var groups = ${JSON.stringify(groups)};
		var icons = ${JSON.stringify(icons)};
		${fontLine}
	`;
  // Preload symbol SVG sprite so SVG downloads work from any tab
  const symbolPreload = pageTemplate.querySelector('[content=symbolPreload]');
  if (symbolPreload) {
    symbolPreload.setAttribute('src', `./${projectName}.js`);
  }
  return pageTemplate.querySelector('html')!.outerHTML;
};

// 生成模板CSS文件以供界面引用
// 优化: 单次 replace + array.join 代替 += 循环
export const iconfontCSSGenerator = (icons: DemoIconData[]): string => {
  const projectName = db.getProjectName();
  const baseCSS = cssTemplate.replace(/iconfont/g, projectName);

  // 预分配数组, 一次 join
  const parts: string[] = [baseCSS];
  for (let i = 0; i < icons.length; i++) {
    const code = icons[i].iconCode.toLowerCase();
    parts.push(`.${projectName}-${code}:before { content: "\\${code}"; }`);
  }
  return parts.join('');
};

// viewBox 正则提取 — 避免每个图标都 new DOMParser()
const VIEWBOX_RE = /viewBox\s*=\s*["']([^"']+)["']/i;
// SVG 内部内容提取
const SVG_INNER_RE = /<svg[^>]*?>([\s\S]*?)<\/svg>/i;
// 引号标准化
const QUOTE_RE = /[\u2018\u2019\u201C\u201D']/g;

// 生成模板Symbol的JS文件以供界面引用
// 优化: regex 提取 viewBox (不用 DOMParser) + array.join
export const iconfontSymbolGenerator = (icons: DemoIconData[]): string => {
  const projectName = db.getProjectName();
  const parts: string[] = new Array(icons.length);

  for (let i = 0; i < icons.length; i++) {
    const icon = icons[i];
    const content = icon.iconContent;

    // 用 regex 提取 viewBox，避免 DOMParser 开销
    const vbMatch = VIEWBOX_RE.exec(content);
    const viewBox = vbMatch ? vbMatch[1] : '0 0 1024 1024';

    // 提取 <svg> 内部内容
    const innerMatch = SVG_INNER_RE.exec(content);
    const inner = innerMatch ? innerMatch[1] : content;

    // 标准化引号
    const normalized = inner.replace(QUOTE_RE, '"');

    parts[i] =
      `<symbol id="${projectName}-${icon.iconCode}" viewBox="${viewBox}">${normalized}</symbol>`;
  }

  return jsHead + parts.join('') + jsTail;
};
