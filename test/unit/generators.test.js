/**
 * Unit tests for export generators
 * Tests output consistency of CSS and Symbol JS generators
 *
 * @vitest-environment jsdom
 */
import { describe, test, expect, beforeAll, vi } from 'vitest';

// Mock electronAPI (template files)
const MOCK_CSS_TEMPLATE = `@font-face {
  font-family: "iconfont";
  src: url('iconfont.woff2') format('woff2');
}
.iconfont {
  font-family: "iconfont" !important;
}`;

const MOCK_JS_HEAD = '!function(){var svgSprite=\'<svg>';
const MOCK_JS_TAIL = '</svg>\';document.body.insertAdjacentHTML("beforeend",svgSprite)}();';

beforeAll(() => {
  // Mock window.electronAPI
  window.electronAPI = {
    readFileSync: vi.fn((path) => {
      if (path.includes('iconfontTemplate(class).css')) return MOCK_CSS_TEMPLATE;
      if (path.includes('iconfontTemplate(symbol).head.txt')) return MOCK_JS_HEAD;
      if (path.includes('iconfontTemplate(symbol).tail.txt')) return MOCK_JS_TAIL;
      if (path.includes('indexTemplate.html')) return '<html><head></head><body><script content="icons"></script></body></html>';
      return '';
    }),
  };
});

// Mock database
vi.mock('../../src/renderer/database', () => ({
  default: {
    getProjectName: () => 'testfont',
  },
}));

// Mock config
vi.mock('../../src/renderer/config', () => ({
  default: {},
  demoHTMLFile: 'indexTemplate.html',
  iconfontCSSFile: 'iconfontTemplate(class).css',
  iconfontJSHeadFile: 'iconfontTemplate(symbol).head.txt',
  iconfontJSTailFile: 'iconfontTemplate(symbol).tail.txt',
}));

describe('iconfontCSSGenerator', () => {
  let iconfontCSSGenerator;

  beforeAll(async () => {
    const mod = await import('../../src/renderer/utils/generators/demopageGenerator/index');
    iconfontCSSGenerator = mod.iconfontCSSGenerator;
  });

  test('replaces iconfont prefix with project name', () => {
    const result = iconfontCSSGenerator([]);
    expect(result).toContain('font-family: "testfont"');
    expect(result).toContain('.testfont');
    expect(result).not.toContain('iconfont');
  });

  test('generates correct CSS selectors for icons', () => {
    const icons = [
      { iconCode: 'E001', iconName: 'home', iconContent: '' },
      { iconCode: 'E002', iconName: 'user', iconContent: '' },
    ];
    const result = iconfontCSSGenerator(icons);
    expect(result).toContain('.testfont-e001:before { content: "\\e001"; }');
    expect(result).toContain('.testfont-e002:before { content: "\\e002"; }');
  });

  test('handles large icon count without error', () => {
    const icons = Array.from({ length: 1000 }, (_, i) => ({
      iconCode: `E${String(i).padStart(3, '0')}`,
      iconName: `icon_${i}`,
      iconContent: '',
    }));
    const result = iconfontCSSGenerator(icons);
    expect(result).toContain('.testfont-e000:before');
    expect(result).toContain('.testfont-e999:before');
  });

  test('icon codes are lowercased in output', () => {
    const icons = [{ iconCode: 'EB3F', iconName: 'test', iconContent: '' }];
    const result = iconfontCSSGenerator(icons);
    expect(result).toContain('.testfont-eb3f:before { content: "\\eb3f"; }');
  });
});

describe('iconfontSymbolGenerator', () => {
  let iconfontSymbolGenerator;

  beforeAll(async () => {
    const mod = await import('../../src/renderer/utils/generators/demopageGenerator/index');
    iconfontSymbolGenerator = mod.iconfontSymbolGenerator;
  });

  test('wraps output with JS head and tail', () => {
    const result = iconfontSymbolGenerator([]);
    expect(result).toMatch(/^!function\(\)/);
    expect(result).toMatch(/\(\);$/);
  });

  test('generates symbol elements with correct id and viewBox', () => {
    const icons = [
      {
        iconCode: 'E001',
        iconName: 'home',
        iconContent: '<svg viewBox="0 0 1024 1024"><path d="M100 200"/></svg>',
      },
    ];
    const result = iconfontSymbolGenerator(icons);
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
    const result = iconfontSymbolGenerator(icons);
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
        iconContent: '<svg viewBox="0 0 100 100"><text>\u2018hello\u2019 \u201Cworld\u201D</text></svg>',
      },
    ];
    const result = iconfontSymbolGenerator(icons);
    expect(result).not.toMatch(/[\u2018\u2019\u201C\u201D]/);
  });

  test('defaults viewBox to 0 0 1024 1024 when missing', () => {
    const icons = [
      {
        iconCode: 'E004',
        iconName: 'noviewbox',
        iconContent: '<svg><rect width="100" height="100"/></svg>',
      },
    ];
    const result = iconfontSymbolGenerator(icons);
    expect(result).toContain('viewBox="0 0 1024 1024"');
  });

  test('handles 1000 icons without error', () => {
    const icons = Array.from({ length: 1000 }, (_, i) => ({
      iconCode: `E${String(i).padStart(3, '0')}`,
      iconName: `icon_${i}`,
      iconContent: `<svg viewBox="0 0 24 24"><path d="M${i} ${i}"/></svg>`,
    }));
    const result = iconfontSymbolGenerator(icons);
    expect(result).toContain('testfont-E000');
    expect(result).toContain('testfont-E999');
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
