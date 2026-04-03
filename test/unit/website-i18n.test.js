import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const LOCALES_DIR = path.resolve(__dirname, '../../docs/locales')
const INDEX_HTML = path.resolve(__dirname, '../../docs/index.html')

const EXPECTED_LANGS = [
  'en', 'zh-CN', 'ja', 'ko', 'fr', 'de', 'es', 'pt-BR',
  'it', 'nl', 'ru', 'tr', 'ar', 'th', 'vi', 'id'
]

function readLocale(lang) {
  const filePath = path.join(LOCALES_DIR, `${lang}.json`)
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

describe('Website i18n', () => {
  it('should have a locale file for every supported language', () => {
    for (const lang of EXPECTED_LANGS) {
      const filePath = path.join(LOCALES_DIR, `${lang}.json`)
      expect(fs.existsSync(filePath), `Missing locale file: ${lang}.json`).toBe(true)
    }
  })

  it('should have valid JSON in every locale file', () => {
    for (const lang of EXPECTED_LANGS) {
      expect(() => readLocale(lang)).not.toThrow()
    }
  })

  it('should have identical keys across all locale files', () => {
    const referenceKeys = Object.keys(readLocale('en')).sort()

    for (const lang of EXPECTED_LANGS) {
      if (lang === 'en') continue
      const keys = Object.keys(readLocale(lang)).sort()
      const missing = referenceKeys.filter(k => !keys.includes(k))
      const extra = keys.filter(k => !referenceKeys.includes(k))

      expect(missing, `${lang}.json is missing keys: ${missing.join(', ')}`).toEqual([])
      expect(extra, `${lang}.json has extra keys: ${extra.join(', ')}`).toEqual([])
    }
  })

  it('should have no empty values in any locale file', () => {
    for (const lang of EXPECTED_LANGS) {
      const data = readLocale(lang)
      for (const [key, value] of Object.entries(data)) {
        expect(value.trim().length, `${lang}.json has empty value for key "${key}"`).toBeGreaterThan(0)
      }
    }
  })

  it('should have a locale key for every data-i18n attribute in index.html', () => {
    const html = fs.readFileSync(INDEX_HTML, 'utf8')
    const i18nKeys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1])
    const enKeys = Object.keys(readLocale('en'))

    for (const key of i18nKeys) {
      expect(enKeys, `data-i18n="${key}" in HTML has no matching key in en.json`).toContain(key)
    }
  })

  it('should have hero.title containing HTML (<br><em>) in every locale', () => {
    for (const lang of EXPECTED_LANGS) {
      const data = readLocale(lang)
      expect(data['hero.title'], `${lang}.json hero.title should contain <br>`).toContain('<br>')
      expect(data['hero.title'], `${lang}.json hero.title should contain <em>`).toContain('<em>')
    }
  })

  it('should have an hreflang tag for every supported language in index.html', () => {
    const html = fs.readFileSync(INDEX_HTML, 'utf8')
    for (const lang of EXPECTED_LANGS) {
      expect(html, `Missing hreflang tag for ${lang}`).toContain(`hreflang="${lang}"`)
    }
    expect(html, 'Missing hreflang x-default').toContain('hreflang="x-default"')
  })
})
