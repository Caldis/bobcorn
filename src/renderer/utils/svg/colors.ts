/**
 * SVG 颜色提取与替换工具
 * 从 SVG 字符串中提取所有 fill/stroke 颜色，并支持批量替换
 */

// 需要忽略的非颜色值
const IGNORE_VALUES = new Set(['none', 'currentColor', 'inherit', 'transparent', 'currentcolor']);

// SVG 形状元素 — 这些元素没有显式 fill 时默认渲染为黑色
const SHAPE_ELEMENTS = new Set([
  'path',
  'circle',
  'ellipse',
  'rect',
  'polygon',
  'polyline',
  'line',
  'text',
  'tspan',
]);

// CSS 命名颜色 → hex 映射 (常见颜色)
const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  navy: '#000080',
  teal: '#008080',
  aqua: '#00ffff',
  fuchsia: '#ff00ff',
  lime: '#00ff00',
  olive: '#808000',
};

/**
 * 解析任意 CSS 颜色格式为 hex
 * 支持 hex, rgb, rgba, hsl, hsla, hwb, named colors 等所有浏览器支持的格式
 * 利用 Canvas 2D Context 进行原生解析
 */
export function parseCssColor(input: string): string | null {
  const v = input.trim();
  if (!v) return null;

  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;

  // 用一个已知色做哨兵，检测无效输入
  ctx.fillStyle = '#010203';
  ctx.fillStyle = v;
  const result = ctx.fillStyle;

  // 如果 fillStyle 没变，说明输入无效（除非输入本身就是哨兵色）
  if (result === '#010203' && normalizeColor(v) !== '#010203') {
    return null;
  }

  // Canvas 返回 #rrggbb 或 rgba(r, g, b, a)
  if (result.startsWith('#')) {
    return result.toLowerCase();
  }

  // rgba → 取 rgb 部分转 hex (忽略 alpha)
  const rgbaMatch = result.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbaMatch) {
    const [, r, g, b] = rgbaMatch;
    return `#${Number(r).toString(16).padStart(2, '0')}${Number(g).toString(16).padStart(2, '0')}${Number(b).toString(16).padStart(2, '0')}`;
  }

  return null;
}

/** 标准化颜色值为小写 hex 格式 */
function normalizeColor(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (IGNORE_VALUES.has(v) || !v) return null;

  // 已经是 hex
  if (v.startsWith('#')) {
    // #abc → #aabbcc
    if (v.length === 4) {
      return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    }
    return v.length >= 7 ? v.slice(0, 7) : v;
  }

  // rgb(r, g, b)
  const rgbMatch = v.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `#${Number(r).toString(16).padStart(2, '0')}${Number(g).toString(16).padStart(2, '0')}${Number(b).toString(16).padStart(2, '0')}`;
  }

  // 命名颜色
  if (NAMED_COLORS[v]) return NAMED_COLORS[v];

  return null;
}

/** 颜色信息 */
export interface SvgColorInfo {
  /** 标准化的 hex 颜色 */
  color: string;
  /** 使用该颜色的元素数量 */
  count: number;
  /** 原始值列表 (去重) */
  rawValues: string[];
  /** 颜色来自 fill="currentColor"（跟随主题前景色） */
  isCurrentColor: boolean;
}

/**
 * 解析当前 CSS 前景色（用于将 currentColor 解析为实际渲染值）
 * 读取 body 的 computed color，它跟随 --foreground CSS 变量
 */
export function resolveCurrentColor(): string {
  try {
    const rgb = getComputedStyle(document.body).color;
    const match = rgb.match(/(\d+)/g);
    if (match && match.length >= 3) {
      const [r, g, b] = match;
      return `#${Number(r).toString(16).padStart(2, '0')}${Number(g).toString(16).padStart(2, '0')}${Number(b).toString(16).padStart(2, '0')}`;
    }
  } catch {
    // test / SSR environment
  }
  return '#000000';
}

/**
 * 从 SVG 字符串中提取所有颜色
 * 扫描 fill 和 stroke 属性 (包括 style 内联)
 */
export function extractSvgColors(
  svgContent: string,
  resolvedCurrentColor?: string
): SvgColorInfo[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const colorMap = new Map<string, { count: number; rawValues: Set<string> }>();
  // 记录哪些标准化颜色来自 currentColor
  const currentColorNorms = new Set<string>();

  const elements = doc.querySelectorAll('*');
  elements.forEach((el) => {
    const tagName = el.tagName.toLowerCase();
    const fill = el.getAttribute('fill');
    const stroke = el.getAttribute('stroke');
    const style = el.getAttribute('style');

    // 提取 style 中的 fill/stroke
    let styleFill: string | null = null;
    let styleStroke: string | null = null;
    if (style) {
      const fillMatch = style.match(/fill\s*:\s*([^;]+)/i);
      if (fillMatch) styleFill = fillMatch[1];
      const strokeMatch = style.match(/stroke\s*:\s*([^;]+)/i);
      if (strokeMatch) styleStroke = strokeMatch[1];
    }

    // 检查 fill: 显式属性 > style > 形状元素默认黑色
    // fill="currentColor" 解析为主题前景色，确保颜色编辑器显示实际渲染色
    // fill="none"/"transparent" 则是显式不可见，不应视为黑色
    const fillVal = fill?.trim().toLowerCase();
    const fillIsCurrentColor = fillVal === 'currentcolor';
    const fillIsImplicit = !fill || fillIsCurrentColor;
    if (fill && !fillIsImplicit) {
      addColor(fill, colorMap);
    } else if (styleFill) {
      addColor(styleFill, colorMap);
    } else if (SHAPE_ELEMENTS.has(tagName) && fillIsImplicit) {
      if (fillIsCurrentColor && resolvedCurrentColor) {
        // currentColor → 使用主题解析后的前景色
        addColor(resolvedCurrentColor, colorMap);
        const norm = normalizeColor(resolvedCurrentColor);
        if (norm) currentColorNorms.add(norm);
      } else {
        // 无 fill 的形状元素默认渲染为黑色
        addColor('#000000', colorMap);
      }
    }

    // 检查 stroke
    if (stroke) addColor(stroke, colorMap);
    else if (styleStroke) addColor(styleStroke, colorMap);
  });

  return Array.from(colorMap.entries())
    .map(([color, info]) => ({
      color,
      count: info.count,
      rawValues: Array.from(info.rawValues),
      isCurrentColor: currentColorNorms.has(color),
    }))
    .sort((a, b) => b.count - a.count);
}

function addColor(raw: string, map: Map<string, { count: number; rawValues: Set<string> }>) {
  const normalized = normalizeColor(raw);
  if (!normalized) return;
  const entry = map.get(normalized) || { count: 0, rawValues: new Set<string>() };
  entry.count++;
  entry.rawValues.add(raw.trim());
  map.set(normalized, entry);
}

/**
 * 替换 SVG 中的颜色
 * 将所有匹配 oldColor 的 fill/stroke 值替换为 newColor
 */
export function replaceSvgColor(
  svgContent: string,
  oldColor: string,
  newColor: string,
  currentColorOnly?: boolean
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const oldNorm = !currentColorOnly ? normalizeColor(oldColor) : null;
  if (!currentColorOnly && !oldNorm) return svgContent;

  const elements = doc.querySelectorAll('*');
  elements.forEach((el) => {
    const tagName = el.tagName.toLowerCase();
    const fill = el.getAttribute('fill');
    const stroke = el.getAttribute('stroke');
    const style = el.getAttribute('style');

    const fillVal = fill?.trim().toLowerCase();
    const fillIsCurrentColor = fillVal === 'currentcolor';
    const fillIsImplicit = !fill || fillIsCurrentColor;

    if (currentColorOnly) {
      // 仅替换 fill="currentColor" 的元素，不影响无 fill 或显式颜色
      if (fillIsCurrentColor && SHAPE_ELEMENTS.has(tagName)) {
        el.setAttribute('fill', newColor);
      }
      if (stroke?.trim().toLowerCase() === 'currentcolor') {
        el.setAttribute('stroke', newColor);
      }
    } else {
      // 替换 fill 属性
      // fill="none"/"transparent" 是显式不可见，不替换
      if (fill && !fillIsImplicit && normalizeColor(fill) === oldNorm) {
        el.setAttribute('fill', newColor);
      } else if (fillIsImplicit && SHAPE_ELEMENTS.has(tagName) && oldNorm === '#000000') {
        // 隐式黑色的形状元素 — 添加显式 fill
        el.setAttribute('fill', newColor);
      }

      // 替换 stroke 属性
      if (stroke && normalizeColor(stroke) === oldNorm) {
        el.setAttribute('stroke', newColor);
      }
    }

    // 替换 style 中的 fill/stroke
    if (style) {
      let newStyle = style;
      const fillMatch = style.match(/fill\s*:\s*([^;]+)/i);
      const strokeMatch = style.match(/stroke\s*:\s*([^;]+)/i);
      if (currentColorOnly) {
        if (fillMatch && fillMatch[1].trim().toLowerCase() === 'currentcolor') {
          newStyle = newStyle.replace(fillMatch[0], `fill: ${newColor}`);
        }
        if (strokeMatch && strokeMatch[1].trim().toLowerCase() === 'currentcolor') {
          newStyle = newStyle.replace(strokeMatch[0], `stroke: ${newColor}`);
        }
      } else {
        if (fillMatch && normalizeColor(fillMatch[1]) === oldNorm) {
          newStyle = newStyle.replace(fillMatch[0], `fill: ${newColor}`);
        }
        if (strokeMatch && normalizeColor(strokeMatch[1]) === oldNorm) {
          newStyle = newStyle.replace(strokeMatch[0], `stroke: ${newColor}`);
        }
      }
      if (newStyle !== style) {
        el.setAttribute('style', newStyle);
      }
    }
  });

  return doc.documentElement.outerHTML;
}
