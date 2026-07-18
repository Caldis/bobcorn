/**
 * @core/font — generateFontArtifacts / generateCSS / generateJsSymbolSprite
 *
 * Covers the consolidated font pipeline (previously duplicated between
 * core/operations/export-font.ts and renderer iconfontGenerator):
 * - full format set → complete artifact Map in canonical order
 * - format subset → trimmed key set
 * - CSS / JS sprite content (assertions mirror test/unit/generators.test.js)
 * - onProgress phase sequence
 * - yieldEvery on/off produces byte-identical artifacts
 * - bad SVG routes through onWarn without crashing the export
 */
import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  generateFontArtifacts,
  generateCSS,
  generateJsSymbolSprite,
  type FontFormat,
  type FontGenPhase,
  type FontIconInput,
} from '@core/font';

// 注入可控的 glyph 预处理故障: 内容含 __BOOM__ 时上报一次 onStepError 并降级为
// 合法几何, 其余输入走真实管线 — 用于验证 core/font 的 onWarn 接线与容错。
vi.mock('@core/svg/glyph-pipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/svg/glyph-pipeline')>();
  return {
    ...actual,
    prepareSvgForFont: (svg: string, onStepError?: (step: string, err: unknown) => void) => {
      if (svg.includes('__BOOM__')) {
        onStepError?.('mock-transform', new Error('kaput'));
        return '<svg viewBox="0 0 1024 1024"><path d="M0 0L512 0L512 512Z"/></svg>';
      }
      return actual.prepareSvgForFont(svg, onStepError);
    },
  };
});

const ICONS: FontIconInput[] = [
  {
    iconCode: 'E001',
    iconName: 'home',
    iconContent: '<svg viewBox="0 0 1024 1024"><path d="M100 200L300 200L300 400Z"/></svg>',
  },
  {
    iconCode: 'E002',
    iconName: 'star',
    iconContent: '<svg viewBox="0 0 1024 1024"><path d="M500 100L700 100L700 300Z"/></svg>',
  },
  {
    iconCode: 'E003',
    iconName: 'user',
    iconContent: '<svg viewBox="0 0 1024 1024"><path d="M50 50L150 50L150 150Z"/></svg>',
  },
];

const ALL_FORMATS = new Set<FontFormat>(['svg', 'ttf', 'woff2', 'woff', 'eot', 'css', 'js']);

describe('generateFontArtifacts — format fan-out', () => {
  test('full format set produces every artifact in canonical order', async () => {
    const artifacts = await generateFontArtifacts(ICONS, {
      fontName: 'testfont',
      formats: ALL_FORMATS,
    });
    expect([...artifacts.keys()]).toEqual([
      'testfont.svg',
      'testfont.ttf',
      'testfont.woff2',
      'testfont.woff',
      'testfont.eot',
      'testfont.css',
      'testfont.js',
    ]);
    // text artifacts are strings, binary fonts are Uint8Array
    expect(typeof artifacts.get('testfont.svg')).toBe('string');
    expect(typeof artifacts.get('testfont.css')).toBe('string');
    expect(typeof artifacts.get('testfont.js')).toBe('string');
    expect(artifacts.get('testfont.ttf')).toBeInstanceOf(Uint8Array);
    expect(artifacts.get('testfont.woff2')).toBeInstanceOf(Uint8Array);
    expect(artifacts.get('testfont.woff')).toBeInstanceOf(Uint8Array);
    expect(artifacts.get('testfont.eot')).toBeInstanceOf(Uint8Array);
    // every artifact is non-empty
    for (const [, data] of artifacts) {
      expect(data.length).toBeGreaterThan(0);
    }
  });

  test('format subset trims the key set', async () => {
    const artifacts = await generateFontArtifacts(ICONS, {
      fontName: 'testfont',
      formats: new Set<FontFormat>(['svg', 'ttf', 'css']),
    });
    expect([...artifacts.keys()]).toEqual(['testfont.svg', 'testfont.ttf', 'testfont.css']);
  });

  test('svg font contains one glyph per icon with the canonical name', async () => {
    const artifacts = await generateFontArtifacts(ICONS, {
      fontName: 'testfont',
      formats: new Set<FontFormat>(['svg']),
    });
    const svgFont = artifacts.get('testfont.svg') as string;
    expect(svgFont).toContain('glyph-name="home_E001"');
    expect(svgFont).toContain('glyph-name="star_E002"');
    expect(svgFont).toContain('glyph-name="user_E003"');
  });
});

describe('generateCSS', () => {
  const FONT_FORMATS = new Set<FontFormat>(['svg', 'ttf', 'woff2']);

  test('generates @font-face and base class for the font name', () => {
    const result = generateCSS([], 'testfont', FONT_FORMATS);
    expect(result).toContain('@font-face');
    expect(result).toContain('font-family: "testfont"');
    expect(result).toContain('.testfont {');
    expect(result).not.toContain('iconfont');
  });

  test('generates correct CSS selectors for icons', () => {
    const icons = [
      { iconCode: 'E001', iconName: 'home', iconContent: '' },
      { iconCode: 'E002', iconName: 'user', iconContent: '' },
    ];
    const result = generateCSS(icons, 'testfont', FONT_FORMATS);
    expect(result).toContain('.testfont-e001:before { content: "\\e001"; }');
    expect(result).toContain('.testfont-e002:before { content: "\\e002"; }');
  });

  test('icon codes are lowercased in output', () => {
    const icons = [{ iconCode: 'EB3F', iconName: 'test', iconContent: '' }];
    const result = generateCSS(icons, 'testfont', FONT_FORMATS);
    expect(result).toContain('.testfont-eb3f:before { content: "\\eb3f"; }');
  });

  test('@font-face src follows the selected optional formats', () => {
    const base = generateCSS([], 'testfont', FONT_FORMATS);
    expect(base).not.toContain('.eot');
    expect(base).not.toContain('.woff\'');
    const full = generateCSS([], 'testfont', ALL_FORMATS);
    expect(full).toContain("url('testfont.eot?#iefix') format('embedded-opentype')");
    expect(full).toContain("url('testfont.woff') format('woff')");
    // woff2 + ttf are always present in src
    expect(full).toContain("url('testfont.woff2') format('woff2')");
    expect(full).toContain("url('testfont.ttf') format('truetype')");
  });

  test('handles large icon count without error', () => {
    const icons = Array.from({ length: 1000 }, (_, i) => ({
      iconCode: `E${String(i).padStart(3, '0')}`,
      iconName: `icon_${i}`,
      iconContent: '',
    }));
    const result = generateCSS(icons, 'testfont', FONT_FORMATS);
    expect(result).toContain('.testfont-e000:before');
    expect(result).toContain('.testfont-e999:before');
  });
});

describe('generateJsSymbolSprite', () => {
  test('wraps output with JS head and tail', () => {
    const result = generateJsSymbolSprite([], 'testfont');
    expect(result).toContain('svgSprite');
    expect(result.length).toBeGreaterThan(10);
  });

  test('generates symbol elements with correct id and viewBox', () => {
    const icons = [
      {
        iconCode: 'E001',
        iconName: 'home',
        iconContent: '<svg viewBox="0 0 1024 1024"><path d="M100 200"/></svg>',
      },
    ];
    const result = generateJsSymbolSprite(icons, 'testfont');
    expect(result).toContain('<symbol id="testfont-E001" viewBox="0 0 1024 1024">');
    expect(result).toContain('<path d="M100 200"/>');
    expect(result).toContain('</symbol>');
  });

  test('extracts SVG inner content without outer <svg> tags', () => {
    const icons = [
      {
        iconCode: 'E002',
        iconName: 'star',
        iconContent:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="200"/></svg>',
      },
    ];
    const result = generateJsSymbolSprite(icons, 'testfont');
    const symbolContent = result.match(/<symbol[^>]*>([\s\S]*?)<\/symbol>/)?.[1] || '';
    expect(symbolContent).not.toContain('<svg');
    expect(symbolContent).toContain('<circle cx="256" cy="256" r="200"/>');
    expect(result).toContain('viewBox="0 0 512 512"');
  });

  test('normalizes smart quotes to standard double quotes', () => {
    const icons = [
      {
        iconCode: 'E003',
        iconName: 'quote',
        iconContent:
          '<svg viewBox="0 0 100 100"><text>‘hello’ “world”</text></svg>',
      },
    ];
    const result = generateJsSymbolSprite(icons, 'testfont');
    expect(result).not.toMatch(/[‘’“”]/);
  });

  test('defaults viewBox to 0 0 1024 1024 when missing', () => {
    const icons = [
      {
        iconCode: 'E004',
        iconName: 'noviewbox',
        iconContent: '<svg><rect width="100" height="100"/></svg>',
      },
    ];
    const result = generateJsSymbolSprite(icons, 'testfont');
    expect(result).toContain('viewBox="0 0 1024 1024"');
  });

  test('Sketch-pattern icons produce self-contained symbols without <use>', () => {
    const icons = [
      {
        iconCode: 'EB37',
        iconName: 'col',
        iconContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <defs><path d="M9.5,41 C8.672,41 8,40.384 8,39.625" id="path-1"/></defs>
    <g fill="none"><use fill="#000000" xlink:href="#path-1"/></g>
</svg>`,
      },
      {
        iconCode: 'EB4B',
        iconName: 'home',
        iconContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <defs><polygon id="path-1" points="20.4 38 27.6 38"/></defs>
    <g fill="none"><use fill="#000000" xlink:href="#path-1"/></g>
</svg>`,
      },
    ];
    const result = generateJsSymbolSprite(icons, 'testfont');
    expect(result).not.toContain('xlink:href="#path-1"');
    expect(result).toContain('M9.5,41');
    expect(result).toContain('points="20.4 38 27.6 38"');
    expect(result).not.toContain('id="path-1"');
  });

  test('handles 1000 icons without error', () => {
    const icons = Array.from({ length: 1000 }, (_, i) => ({
      iconCode: `E${String(i).padStart(3, '0')}`,
      iconName: `icon_${i}`,
      iconContent: `<svg viewBox="0 0 24 24"><path d="M${i} ${i}"/></svg>`,
    }));
    const result = generateJsSymbolSprite(icons, 'testfont');
    expect(result).toContain('testfont-E000');
    expect(result).toContain('testfont-E999');
  });
});

describe('generateFontArtifacts — onProgress sequence', () => {
  test('phases fire in canonical order with start/end pairs', async () => {
    const calls: Array<[FontGenPhase, number, number]> = [];
    await generateFontArtifacts(ICONS, {
      fontName: 'testfont',
      formats: ALL_FORMATS,
      onProgress: (phase, done, total) => {
        calls.push([phase, done, total]);
      },
    });
    // 3 icons < 50 (report throttle) → glyphs emits only start + final
    expect(calls).toEqual([
      ['glyphs', 0, 3],
      ['glyphs', 3, 3],
      ['ttf', 0, 1],
      ['ttf', 1, 1],
      ['woff2', 0, 1],
      ['woff2', 1, 1],
      ['woff', 0, 1],
      ['woff', 1, 1],
      ['eot', 0, 1],
      ['eot', 1, 1],
      ['css', 0, 1],
      ['css', 1, 1],
      ['js', 0, 1],
      ['js', 1, 1],
    ]);
  });

  test('skipped formats emit no phase events', async () => {
    const phases = new Set<FontGenPhase>();
    await generateFontArtifacts(ICONS, {
      fontName: 'testfont',
      formats: new Set<FontFormat>(['svg', 'ttf', 'woff2']),
      onProgress: (phase) => {
        phases.add(phase);
      },
    });
    expect(phases).toEqual(new Set(['glyphs', 'ttf', 'woff2']));
  });

  test('an async onProgress is awaited between phases', async () => {
    const order: string[] = [];
    await generateFontArtifacts(ICONS, {
      fontName: 'testfont',
      formats: new Set<FontFormat>(['svg', 'ttf']),
      onProgress: async (phase, done) => {
        order.push(`start:${phase}:${done}`);
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
        order.push(`end:${phase}:${done}`);
      },
    });
    // 阶段边界回调被 await — start 后必然紧跟对应 end, 不与下一阶段交错
    // (glyphs 的中间/最终计数从流内部同步上报, 不参与 await 契约, 滤除)
    const boundary = order.filter((e) => !e.includes('glyphs:3'));
    expect(boundary).toEqual([
      'start:glyphs:0',
      'end:glyphs:0',
      'start:ttf:0',
      'end:ttf:0',
      'start:ttf:1',
      'end:ttf:1',
    ]);
  });
});

describe('generateFontArtifacts — yieldEvery scheduling', () => {
  beforeAll(() => {
    // svg2ttf 会把当前时间写进 TTF head 表 — 冻结 Date (只 fake Date, 保留真实
    // setTimeout/queueMicrotask 供 glyph 流调度) 保证两次生成 byte 一致
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  test('with and without yieldEvery produce byte-identical artifacts', async () => {
    const base = await generateFontArtifacts(ICONS, {
      fontName: 'testfont',
      formats: ALL_FORMATS,
    });
    const yielded = await generateFontArtifacts(ICONS, {
      fontName: 'testfont',
      formats: ALL_FORMATS,
      yieldEvery: 2,
    });
    expect([...yielded.keys()]).toEqual([...base.keys()]);
    for (const [name, data] of base) {
      const other = yielded.get(name)!;
      if (typeof data === 'string') {
        expect(other).toBe(data);
      } else {
        expect(Buffer.from(other as Uint8Array).equals(Buffer.from(data))).toBe(true);
      }
    }
  });
});

describe('generateFontArtifacts — bad SVG resilience', () => {
  test('a glyph transform failure routes through onWarn and export completes', async () => {
    const warnings: Array<[string, unknown]> = [];
    const icons: FontIconInput[] = [
      ...ICONS,
      {
        iconCode: 'E00F',
        iconName: 'broken',
        iconContent: '<svg viewBox="0 0 1024 1024">__BOOM__</svg>',
      },
    ];
    const artifacts = await generateFontArtifacts(icons, {
      fontName: 'testfont',
      formats: new Set<FontFormat>(['svg', 'ttf', 'css']),
      onWarn: (step, err) => {
        warnings.push([step, err]);
      },
    });
    // the export survives and still contains every artifact
    expect([...artifacts.keys()]).toEqual(['testfont.svg', 'testfont.ttf', 'testfont.css']);
    // the failure surfaced exactly once through onWarn
    expect(warnings).toHaveLength(1);
    expect(warnings[0][0]).toBe('mock-transform');
    expect((warnings[0][1] as Error).message).toBe('kaput');
    // the degraded glyph still made it into the font
    expect(artifacts.get('testfont.svg') as string).toContain('glyph-name="broken_E00F"');
  });

  test('without onWarn a transform failure is still non-fatal', async () => {
    const icons: FontIconInput[] = [
      { iconCode: 'E010', iconName: 'boom', iconContent: '<svg>__BOOM__</svg>' },
    ];
    const artifacts = await generateFontArtifacts(icons, {
      fontName: 'testfont',
      formats: new Set<FontFormat>(['svg']),
    });
    expect(artifacts.has('testfont.svg')).toBe(true);
  });
});
