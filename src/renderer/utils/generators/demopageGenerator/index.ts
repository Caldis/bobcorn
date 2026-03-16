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

// ---------------------------------------------------------------------------
// Template cache — read once, reuse across exports
// ---------------------------------------------------------------------------
let _htmlTemplate: string | null = null;
let _cssTemplate: string | null = null;
let _jsHead: string | null = null;
let _jsTail: string | null = null;

function getHtmlTemplate(): string {
  if (!_htmlTemplate)
    _htmlTemplate = (window as any).electronAPI.readFileSync(demoHTMLFile, 'utf-8');
  return _htmlTemplate;
}
function getCssTemplate(): string {
  if (!_cssTemplate)
    _cssTemplate = (window as any).electronAPI.readFileSync(iconfontCSSFile, 'utf-8');
  return _cssTemplate;
}
function getJsHead(): string {
  if (!_jsHead) _jsHead = (window as any).electronAPI.readFileSync(iconfontJSHeadFile, 'utf-8');
  return _jsHead;
}
function getJsTail(): string {
  if (!_jsTail) _jsTail = (window as any).electronAPI.readFileSync(iconfontJSTailFile, 'utf-8');
  return _jsTail;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// 生成demo页面文本
export const demoHTMLGenerator = (groups: DemoGroupData[], icons: DemoIconData[]): string => {
  const parser = new DOMParser();
  const pageTemplate = parser.parseFromString(getHtmlTemplate(), 'text/html');
  const iconsContainer = pageTemplate.querySelector('[content=icons]')!;
  iconsContainer.innerHTML = `
		var projectName = ${JSON.stringify(db.getProjectName())}
		var groups = ${JSON.stringify(groups)};
		var icons = ${JSON.stringify(icons)};
	`;
  return pageTemplate.querySelector('html')!.outerHTML;
};

// 生成模板CSS文件以供界面引用
// 优化: 单次 replace + array.join 代替 += 循环
export const iconfontCSSGenerator = (icons: DemoIconData[]): string => {
  const projectName = db.getProjectName();
  const baseCSS = getCssTemplate().replace(/iconfont/g, projectName);

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

  return getJsHead() + parts.join('') + getJsTail();
};
