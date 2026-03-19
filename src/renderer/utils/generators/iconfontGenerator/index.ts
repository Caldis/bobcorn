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

// ---------------------------------------------------------------------------
// Glyph stream — pipe-compatible object for svgicons2svgfont
//
// 性能关键路径：svgicons2svgfont 对每个 glyph 调用 glyph.pipe(saxStream)
// pipe 必须异步完成（否则 Transform 状态机崩溃）
// 优化策略：
//   - 多数 glyph 用 queueMicrotask（比 setTimeout 快 10-100x）
//   - 每 YIELD_INTERVAL 个 glyph 用 setTimeout 让出事件循环给 UI 重绘
// ---------------------------------------------------------------------------

const YIELD_INTERVAL = 50; // 每 50 个 glyph 让出一次给 UI
let _glyphCounter = 0;

const createGlyphStream = (
  content: string,
  meta: { name: string; unicode: string[] },
  onProcessed?: () => void
): any => {
  const stream: any = new EventEmitter();
  stream.metadata = meta;
  const idx = _glyphCounter++;

  stream.pipe = (dest: any) => {
    const doWrite = () => {
      dest.write(content);
      dest.end();
      onProcessed?.();
    };

    // 每 YIELD_INTERVAL 个用 setTimeout 让出给 UI，其余用 queueMicrotask
    if (idx % YIELD_INTERVAL === 0) {
      setTimeout(doWrite, 0);
    } else {
      queueMicrotask(doWrite);
    }
    return dest;
  };
  return stream;
};

// Pre-compiled regex for SVG content cleanup
const ARC_FIX_RE = /a0,0,0,0,1,0,0/g;

// Strip non-renderable elements that svgicons2svgfont incorrectly extracts as glyph shapes.
// <defs> may contain <clipPath>/<mask>/<filter> whose child shapes are NOT visible geometry
// but svgicons2svgfont treats all <rect>/<path>/etc. as glyph outlines regardless of context.
const DEFS_RE = /<defs[\s\S]*?<\/defs>/gi;
const CLIP_PATH_ATTR_RE = /\s*clip-path="[^"]*"/gi;
const MASK_ATTR_RE = /\s*mask="[^"]*"/gi;

const cleanSVGForFont = (svg: string): string =>
  svg.replace(DEFS_RE, '').replace(CLIP_PATH_ATTR_RE, '').replace(MASK_ATTR_RE, '');

// ---------------------------------------------------------------------------
// SVG → SVG Font (with progress callback)
// ---------------------------------------------------------------------------

export const svgFontGenerator = (
  data: SvgFontGeneratorData,
  callback?: (font: string) => void,
  onProgress?: (processed: number, total: number) => void
): void => {
  const chunks: Buffer[] = [];
  const { icons, options } = data;
  const total = icons.length;

  // Reset glyph counter
  _glyphCounter = 0;

  let callbackFired = false;
  const safeCallback = (result: string) => {
    if (callbackFired) return;
    callbackFired = true;
    clearTimeout(timeoutId);
    callback && callback(result);
  };

  const timeoutId = setTimeout(() => {
    import.meta.env?.DEV && console.error('svgFontGenerator: timed out after 120s');
    safeCallback('');
  }, 120000);

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

  // 进度跟踪
  let processedCount = 0;
  const handleGlyphProcessed = () => {
    processedCount++;
    // 每 YIELD_INTERVAL 个或最后一个时报告进度
    if (onProgress && (processedCount % YIELD_INTERVAL === 0 || processedCount === total)) {
      onProgress(processedCount, total);
    }
  };

  // Pre-compute unicode + clean content, write all glyphs
  for (let i = 0; i < total; i++) {
    const icon = icons[i];
    const cleanContent = cleanSVGForFont(icon.iconContent.replace(ARC_FIX_RE, ''));
    const codePoint = parseInt(icon.iconCode, 16);
    const glyph = createGlyphStream(
      cleanContent,
      {
        name: `${icon.iconName}_${icon.iconCode}`,
        unicode: [String.fromCodePoint(codePoint)],
      },
      handleGlyphProcessed
    );
    fontStream.write(glyph);
  }

  try {
    fontStream.end();
  } catch (e) {
    import.meta.env?.DEV && console.error('svgFontGenerator end error:', e);
    safeCallback('');
  }
};

// ---------------------------------------------------------------------------
// SVG Font → TTF → WOFF / WOFF2 / EOT
// ---------------------------------------------------------------------------

export const ttfFontGenerator = (data: TtfFontGeneratorData): Buffer => {
  const { svgFont, ...options } = data;
  return Buffer.from(svg2ttf(svgFont, options).buffer);
};

export const woffFontGenerator = (data: BinaryFontGeneratorData): Buffer => {
  const { ttfFont, ...options } = data;
  return Buffer.from(ttf2woff(new Uint8Array(ttfFont), options).buffer);
};

export const woff2FontGenerator = (data: BinaryFontGeneratorData): Buffer => {
  const { ttfFont, ...options } = data;
  return Buffer.from(ttf2woff2(new Uint8Array(ttfFont), options).buffer);
};

export const eotFontGenerator = (data: BinaryFontGeneratorData): Buffer => {
  const { ttfFont, ...options } = data;
  return Buffer.from(ttf2eot(new Uint8Array(ttfFont), options).buffer);
};
