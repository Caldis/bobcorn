/**
 * SVG 颜色提取与替换工具
 * 从 SVG 字符串中提取所有 fill/stroke 颜色，并支持批量替换
 */

// 需要忽略的非颜色值
const IGNORE_VALUES = new Set(['none', 'currentColor', 'inherit', 'transparent', 'currentcolor']);

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
}

/**
 * 从 SVG 字符串中提取所有颜色
 * 扫描 fill 和 stroke 属性 (包括 style 内联)
 */
export function extractSvgColors(svgContent: string): SvgColorInfo[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const colorMap = new Map<string, { count: number; rawValues: Set<string> }>();

  const elements = doc.querySelectorAll('*');
  elements.forEach((el) => {
    // 检查 fill 属性
    const fill = el.getAttribute('fill');
    if (fill) addColor(fill, colorMap);

    // 检查 stroke 属性
    const stroke = el.getAttribute('stroke');
    if (stroke) addColor(stroke, colorMap);

    // 检查 style 属性中的 fill/stroke
    const style = el.getAttribute('style');
    if (style) {
      const fillMatch = style.match(/fill\s*:\s*([^;]+)/i);
      if (fillMatch) addColor(fillMatch[1], colorMap);
      const strokeMatch = style.match(/stroke\s*:\s*([^;]+)/i);
      if (strokeMatch) addColor(strokeMatch[1], colorMap);
    }
  });

  return Array.from(colorMap.entries())
    .map(([color, info]) => ({
      color,
      count: info.count,
      rawValues: Array.from(info.rawValues),
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
export function replaceSvgColor(svgContent: string, oldColor: string, newColor: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const oldNorm = normalizeColor(oldColor);
  if (!oldNorm) return svgContent;

  const elements = doc.querySelectorAll('*');
  elements.forEach((el) => {
    // 替换 fill 属性
    const fill = el.getAttribute('fill');
    if (fill && normalizeColor(fill) === oldNorm) {
      el.setAttribute('fill', newColor);
    }

    // 替换 stroke 属性
    const stroke = el.getAttribute('stroke');
    if (stroke && normalizeColor(stroke) === oldNorm) {
      el.setAttribute('stroke', newColor);
    }

    // 替换 style 中的 fill/stroke
    const style = el.getAttribute('style');
    if (style) {
      let newStyle = style;
      const fillMatch = style.match(/fill\s*:\s*([^;]+)/i);
      if (fillMatch && normalizeColor(fillMatch[1]) === oldNorm) {
        newStyle = newStyle.replace(fillMatch[0], `fill: ${newColor}`);
      }
      const strokeMatch = style.match(/stroke\s*:\s*([^;]+)/i);
      if (strokeMatch && normalizeColor(strokeMatch[1]) === oldNorm) {
        newStyle = newStyle.replace(strokeMatch[0], `stroke: ${newColor}`);
      }
      if (newStyle !== style) {
        el.setAttribute('style', newStyle);
      }
    }
  });

  return doc.documentElement.outerHTML;
}
