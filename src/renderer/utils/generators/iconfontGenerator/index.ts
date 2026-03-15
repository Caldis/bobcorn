// stream
import { EventEmitter } from 'events';
// converters
import SVGIcons2SVGFontStream from 'svgicons2svgfont';
import svg2ttf from 'svg2ttf';
import ttf2woff from 'ttf2woff';
import ttf2woff2 from 'ttf2woff2';
import ttf2eot from 'ttf2eot';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/** Icon entry for font generation */
interface FontIcon {
  iconName: string;
  iconCode: string;
  iconContent: string;
}

/** SVG font generator options (passed to svgicons2svgfont) */
interface SvgFontOptions {
  fontName?: string;
  fontHeight?: number;
  descent?: number;
  normalize?: boolean;
  round?: number;
  [key: string]: any;
}

/** Input data for svgFontGenerator */
interface SvgFontGeneratorData {
  icons: FontIcon[];
  options: SvgFontOptions;
}

/** Input data for ttfFontGenerator */
interface TtfFontGeneratorData {
  svgFont: string;
  [key: string]: any;
}

/** Input data for woff/woff2/eot font generators */
interface BinaryFontGeneratorData {
  ttfFont: Buffer;
  [key: string]: any;
}

// 转换路径
// svgIcon -> svgFont -> ttfFont -> woffFont
//                               \
//                                -> woff2Font
//                                \
//                                 -> eotFont

// data 是一个对象, 包含了导出所需的图标配置, 和 svg 文件的路径对象, 除 icons 外, 其余的参数都会直接传递给 svgicons2svgfont
// svgicons2svgfont 的文档可参见 https://github.com/nfroidure/svgicons2svgfont
// 一些基本配置:
// fontName: 默认('iconfont')  fontFamily的名字
// fontHeight: 默认('') 图标的高度
// descent: 默认(0) 基线高度
// normalize: 默认(false) 将icon归一化, 将图标高度调整为所有图标中高度最高的图标的值
// round: 默认(10e12) 功能未知
// 图标的配置
// icons: [{
//      iconName
//      iconCode
//      iconContent
// }]
// 参考 webfonts-generator
// https://github.com/sunflowerdeath/webfonts-generator/blob/master/src/generateFonts.js

/**
 * 创建一个极简的 stream-like 对象供 svgicons2svgfont 消费
 * svgicons2svgfont 内部调用 glyph.pipe(saxStream), sax 的 write 方法接受 string
 * 直接实现 pipe 方法写 string, 绕过 stream-browserify 的 TextDecoder 兼容性问题
 */
const createGlyphStream = (content: string, meta: { name: string; unicode: string[] }): any => {
  const stream: any = new EventEmitter();
  stream.metadata = meta;
  // svgicons2svgfont 的 _transform 是异步的, pipe 也必须异步完成
  // 否则 Transform 内部状态机在 fontStream.end() 同步回调时会崩溃
  stream.pipe = (dest: any) => {
    setTimeout(() => {
      dest.write(content);
      dest.end();
    }, 0);
    return dest;
  };
  return stream;
};

export const svgFontGenerator = (
  data: SvgFontGeneratorData,
  callback?: (font: string) => void
): void => {
  const chunks: Buffer[] = [];
  // 提取出 svgicons2svgfont 的配置参数
  const { icons, options } = data;

  // Ensure callback fires exactly once
  let callbackFired = false;
  const safeCallback = (result: string) => {
    if (callbackFired) return;
    callbackFired = true;
    clearTimeout(timeoutId);
    callback && callback(result);
  };

  // Timeout protection (120s for large icon sets)
  const timeoutId = setTimeout(() => {
    import.meta.env?.DEV && console.error('svgFontGenerator: timed out after 120s');
    safeCallback('');
  }, 120000);

  // 创建 svgicons2svgfont 的处理流
  const fontStream = new SVGIcons2SVGFontStream(options)
    .on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    })
    .on('end', () => {
      safeCallback(Buffer.concat(chunks).toString());
    })
    .on('error', (err: Error) => {
      import.meta.env?.DEV && console.error('svgFontGenerator error:', err);
      safeCallback('');
    });
  icons.forEach((icon: FontIcon) => {
    const iconContent = icon.iconContent.toString().replaceAll('a0,0,0,0,1,0,0', '');
    const glyph = createGlyphStream(iconContent, {
      // 名称不能相同, 因此此处拼接 iconCode 区分
      name: `${icon.iconName}_${icon.iconCode}`,
      // unicode转换相关
      // http://www.ruanyifeng.com/blog/2014/12/unicode.html
      // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/String/fromCodePoint
      unicode: [String.fromCodePoint(parseInt(`0x${icon.iconCode}`, 16))],
    });
    fontStream.write(glyph);
  });
  try {
    fontStream.end();
  } catch (e) {
    import.meta.env?.DEV && console.error('svgFontGenerator end error:', e);
    safeCallback('');
  }
};

// data 是一个对象, 包含了 svg2ttf 的配置, 以及 svgfont 数据
// ...
// svgfont svg字体文件
export const ttfFontGenerator = (data: TtfFontGeneratorData): Buffer => {
  const { svgFont, ...options } = data;
  const ttfResult = svg2ttf(svgFont, options);
  const font = Buffer.from(ttfResult.buffer);
  return font;
};

// data 是一个对象, 包含了 ttf2woff 的配置, 以及 ttfFont 数据
// ...
// ttfFont ttf字体文件
export const woffFontGenerator = (data: BinaryFontGeneratorData): Buffer => {
  const { ttfFont, ...options } = data;
  const woffResult = ttf2woff(new Uint8Array(ttfFont), options);
  const font = Buffer.from(woffResult.buffer);
  return font;
};

// data 是一个对象, 包含了 ttf2woff2 的配置, 以及 ttfFont 数据
// ...
// ttfFont ttf字体文件
export const woff2FontGenerator = (data: BinaryFontGeneratorData): Buffer => {
  const { ttfFont, ...options } = data;
  const woff2Result = ttf2woff2(new Uint8Array(ttfFont), options);
  const font = Buffer.from(woff2Result.buffer);
  return font;
};

// data 是一个对象, 包含了 ttf2woff2 的配置, 以及 ttfFont 数据
// ...
// ttfFont ttf字体文件
export const eotFontGenerator = (data: BinaryFontGeneratorData): Buffer => {
  const { ttfFont, ...options } = data;
  const eotResult = ttf2eot(new Uint8Array(ttfFont), options);
  const font = Buffer.from(eotResult.buffer);
  return font;
};
