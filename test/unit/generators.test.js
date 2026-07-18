/**
 * Unit tests for export generators
 * Tests output consistency of the CSS / Symbol JS generators (@core/font)
 * and the DOM-dependent demo page generator (renderer).
 *
 * @vitest-environment jsdom
 */
import { describe, test, expect, beforeAll, vi } from 'vitest';
import { generateCSS, generateJsSymbolSprite } from '@core/font';
import { flattenSvgUseRefs } from '@core/svg/transforms';

// Mock database (demoHTMLGenerator reads the project name at render time)
vi.mock('../../src/renderer/database', () => ({
  default: {
    getProjectName: () => 'testfont',
  },
}));

// 字体格式集 — 与 GUI 必选格式一致 (woff/eot 相关断言单独构造)
const FONT_FORMATS = new Set(['svg', 'ttf', 'woff2']);

describe('generateCSS', () => {
  test('uses the font name as prefix', () => {
    const result = generateCSS([], 'testfont', FONT_FORMATS);
    expect(result).toContain('testfont');
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

  test('icon codes are lowercased in output', () => {
    const icons = [{ iconCode: 'EB3F', iconName: 'test', iconContent: '' }];
    const result = generateCSS(icons, 'testfont', FONT_FORMATS);
    expect(result).toContain('.testfont-eb3f:before { content: "\\eb3f"; }');
  });

  test('@font-face src follows the selected formats', () => {
    const base = generateCSS([], 'testfont', FONT_FORMATS);
    expect(base).not.toContain('testfont.eot');
    expect(base).not.toContain("format('woff')");
    const full = generateCSS([], 'testfont', new Set(['svg', 'ttf', 'woff2', 'woff', 'eot']));
    expect(full).toContain("url('testfont.eot?#iefix') format('embedded-opentype')");
    expect(full).toContain("url('testfont.woff') format('woff')");
  });
});

describe('generateJsSymbolSprite', () => {
  test('wraps output with JS head and tail', () => {
    const result = generateJsSymbolSprite([], 'testfont');
    // Head contains svg sprite injection, tail closes it
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
        iconContent: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="200"/></svg>',
      },
    ];
    const result = generateJsSymbolSprite(icons, 'testfont');
    // symbol 内部不应包含嵌套的 <svg> 标签，只有外层模板的 <svg>
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
        iconContent: '<svg viewBox="0 0 100 100"><text>‘hello’ “world”</text></svg>',
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

describe('flattenSvgUseRefs', () => {
  test('inlines <use> referencing <path> in <defs> (Sketch pattern)', () => {
    const svg = `<svg viewBox="0 0 48 48">
    <defs>
        <path d="M9.5,41 L8,39.625" id="path-1"/>
    </defs>
    <g fill="none">
        <mask id="mask-2" fill="white"><use xlink:href="#path-1"/></mask>
        <use fill="#000000" xlink:href="#path-1"/>
    </g>
</svg>`;
    const result = flattenSvgUseRefs(svg);
    // The visible <use> should be replaced with inlined <path>
    expect(result).toContain('d="M9.5,41 L8,39.625"');
    expect(result).toContain('fill="#000000"');
    // <use> elements should be gone
    expect(result).not.toContain('xlink:href="#path-1"');
  });

  test('inlines <use> referencing <polygon> in <defs>', () => {
    const svg = `<svg viewBox="0 0 48 48">
    <defs><polygon id="path-1" points="20.4 38 27.6 38"/></defs>
    <g><use fill="#000000" xlink:href="#path-1"/></g>
</svg>`;
    const result = flattenSvgUseRefs(svg);
    expect(result).toContain('points="20.4 38 27.6 38"');
    expect(result).toContain('fill="#000000"');
    expect(result).not.toContain('<use');
  });

  test('returns unchanged SVG without <defs>', () => {
    const svg = '<svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6"/></svg>';
    expect(flattenSvgUseRefs(svg)).toBe(svg);
  });

  test('keeps <use> that references non-defs element', () => {
    const svg = `<svg><g id="group1"><path d="M0 0"/></g><use href="#group1"/></svg>`;
    const result = flattenSvgUseRefs(svg);
    expect(result).toContain('href="#group1"');
  });

  test('handles multiple icons with same id pattern', () => {
    // Two SVGs with id="path-1" — each should inline its own path
    const svg1 = `<svg><defs><path id="path-1" d="M1 1"/></defs><use fill="#000" xlink:href="#path-1"/></svg>`;
    const svg2 = `<svg><defs><path id="path-1" d="M2 2"/></defs><use fill="#000" xlink:href="#path-1"/></svg>`;
    const r1 = flattenSvgUseRefs(svg1);
    const r2 = flattenSvgUseRefs(svg2);
    expect(r1).toContain('d="M1 1"');
    expect(r2).toContain('d="M2 2"');
    // Neither should contain <use>
    expect(r1).not.toContain('<use');
    expect(r2).not.toContain('<use');
  });
});

describe('generateJsSymbolSprite — flattened <use>', () => {
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
    // Each symbol should have inlined geometry, not <use> references
    expect(result).not.toContain('xlink:href="#path-1"');
    // col should have its own path data
    expect(result).toContain('M9.5,41');
    // home should have its own polygon data
    expect(result).toContain('points="20.4 38 27.6 38"');
    // No ID collisions — "path-1" should not appear in symbol output
    expect(result).not.toContain('id="path-1"');
  });
});

describe('demoHTMLGenerator', () => {
  let demoHTMLGenerator;

  beforeAll(async () => {
    const mod = await import('../../src/renderer/utils/generators/demopageGenerator/index');
    demoHTMLGenerator = mod.demoHTMLGenerator;
  });

  test('injects project name, groups, and icons data into template', () => {
    const groups = [{ id: 'g1', groupName: 'Group 1' }];
    const icons = [{ iconCode: 'E001', iconName: 'test', iconContent: '' }];
    const result = demoHTMLGenerator(groups, icons);
    expect(result).toContain('"testfont"');
    expect(result).toContain('"Group 1"');
    expect(result).toContain('"E001"');
  });
});
