// Database
import db from '../../../database';
// Shared SVG utility
import { flattenSvgUseRefs } from '../iconfontGenerator';
// Templates — inlined at build time via Vite ?raw import
// No runtime file I/O needed, works in both dev and production
import htmlTemplate from '../../../resources/iconDocs/indexTemplate.html?raw';

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
  woff2Base64?: string,
  config?: { hasSymbol: boolean; selectedFormats: Record<string, boolean> }
): string => {
  const parser = new DOMParser();
  const pageTemplate = parser.parseFromString(htmlTemplate, 'text/html');
  const iconsContainer = pageTemplate.querySelector('[content=icons]')!;
  const fontLine = woff2Base64 ? `var fontBase64 = "${woff2Base64}";` : '';
  const projectName = db.getProjectName();
  const exportConfigLine = config
    ? `var exportConfig = ${JSON.stringify({ hasSymbol: config.hasSymbol, selectedFormats: config.selectedFormats })};`
    : '';
  iconsContainer.innerHTML = `
		var projectName = ${JSON.stringify(projectName)}
		var groups = ${JSON.stringify(groups)};
		var icons = ${JSON.stringify(icons)};
		${fontLine}
		${exportConfigLine}
	`;
  // Preload symbol SVG sprite — only if JS Symbol is exported
  const symbolPreload = pageTemplate.querySelector('[content=symbolPreload]');
  if (symbolPreload) {
    if (config?.hasSymbol !== false) {
      symbolPreload.setAttribute('src', `./${projectName}.js`);
    } else {
      symbolPreload.removeAttribute('src');
    }
  }
  return pageTemplate.querySelector('html')!.outerHTML;
};

// 生成模板CSS文件以供界面引用
// 根据选定的字体格式动态构建 @font-face src
export const iconfontCSSGenerator = (
  icons: DemoIconData[],
  formats?: { woff2?: boolean; ttf?: boolean; woff?: boolean; eot?: boolean }
): string => {
  const projectName = db.getProjectName();
  const fmt = formats || { woff2: true, ttf: true, woff: true, eot: true };

  // Build dynamic @font-face src
  const srcParts: string[] = [];
  if (fmt.eot) srcParts.push(`url('${projectName}.eot?#iefix') format('embedded-opentype')`);
  srcParts.push(`url('${projectName}.woff2') format('woff2')`);
  if (fmt.woff) srcParts.push(`url('${projectName}.woff') format('woff')`);
  srcParts.push(`url('${projectName}.ttf') format('truetype')`);

  const fontFace = `@font-face {\n  font-family: "${projectName}";\n  src: ${srcParts.join(',\n       ')};\n  font-weight: normal;\n  font-style: normal;\n}\n`;
  const baseClass = `.${projectName} {\n  font-family: "${projectName}" !important;\n  font-style: normal;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\n`;

  const parts: string[] = [fontFace, baseClass];
  for (let i = 0; i < icons.length; i++) {
    const code = icons[i].iconCode.toLowerCase();
    parts.push(`.${projectName}-${code}:before { content: "\\${code}"; }`);
  }
  return parts.join('\n');
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
    // Flatten <use> references to avoid ID collisions in the SVG sprite.
    // Design tools (Sketch/Figma) export paths in <defs> referenced via <use>,
    // but all icons sharing id="path-1" causes cross-references in a single sprite.
    const content = flattenSvgUseRefs(icon.iconContent);

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
