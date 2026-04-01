import { describe, it, expect } from 'vitest';
import zhCN from '../../src/locales/zh-CN.json';
import en from '../../src/locales/en.json';
import { resources, supportedLanguages } from '../../src/locales';

describe('i18n translation files', () => {
  const zhKeys = Object.keys(zhCN).sort();
  const enKeys = Object.keys(en).sort();

  it('zh-CN and en have the same set of keys', () => {
    const missingInEn = zhKeys.filter((k) => !(k in en));
    const extraInEn = enKeys.filter((k) => !(k in (zhCN as Record<string, string>)));
    expect(missingInEn, 'Keys in zh-CN but missing in en').toEqual([]);
    expect(extraInEn, 'Keys in en but missing in zh-CN').toEqual([]);
  });

  it('no empty translation values in zh-CN', () => {
    const empty = zhKeys.filter((k) => !(zhCN as Record<string, string>)[k]?.trim());
    expect(empty, 'Empty values in zh-CN').toEqual([]);
  });

  it('no empty translation values in en', () => {
    const empty = enKeys.filter((k) => !(en as Record<string, string>)[k]?.trim());
    expect(empty, 'Empty values in en').toEqual([]);
  });

  it('interpolation placeholders match between languages', () => {
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    const mismatches: string[] = [];
    for (const key of zhKeys) {
      const zhVal = (zhCN as Record<string, string>)[key] || '';
      const enVal = (en as Record<string, string>)[key] || '';
      const zhPlaceholders = [...zhVal.matchAll(placeholderRegex)].map((m) => m[1]).sort();
      const enPlaceholders = [...enVal.matchAll(placeholderRegex)].map((m) => m[1]).sort();
      if (JSON.stringify(zhPlaceholders) !== JSON.stringify(enPlaceholders)) {
        mismatches.push(`${key}: zh=${zhPlaceholders.join(',')} en=${enPlaceholders.join(',')}`);
      }
    }
    expect(mismatches, 'Placeholder mismatches').toEqual([]);
  });

  it('all keys follow dot-separated namespace convention', () => {
    const invalid = zhKeys.filter((k) => !/^[a-zA-Z]+(\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(k));
    expect(invalid, 'Keys not following namespace convention').toEqual([]);
  });

  it('resources object has correct structure', () => {
    expect(resources).toHaveProperty('zh-CN.translation');
    expect(resources).toHaveProperty('en.translation');
    expect(Object.keys(resources['zh-CN'].translation).length).toBeGreaterThan(100);
    expect(Object.keys(resources.en.translation).length).toBeGreaterThan(100);
  });

  it('supportedLanguages includes zh-CN and en', () => {
    const codes = supportedLanguages.map((l) => l.code);
    expect(codes).toContain('zh-CN');
    expect(codes).toContain('en');
    // Each language must have a label
    for (const lang of supportedLanguages) {
      expect(lang.label).toBeTruthy();
    }
  });

  it('has a reasonable number of translation keys (150+)', () => {
    expect(zhKeys.length).toBeGreaterThanOrEqual(150);
  });
});
