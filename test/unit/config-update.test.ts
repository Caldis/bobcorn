import { describe, it, expect, beforeEach, vi } from 'vitest';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = String(value); }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();
const localStorageProxy = new Proxy(localStorageMock, {
  get(target, prop) {
    if (prop in target) return (target as any)[prop];
    return target.getItem(prop as string) ?? undefined;
  },
  set(target, prop, value) {
    if (prop in target) { (target as any)[prop] = value; return true; }
    target.setItem(prop as string, value);
    return true;
  },
  deleteProperty(target, prop) {
    target.removeItem(prop as string);
    return true;
  },
});
vi.stubGlobal('localStorage', localStorageProxy);
vi.mock('../../src/renderer/utils/tools', () => ({
  decToHex: (n: number) => n.toString(16).toUpperCase(),
}));

const { defOption, getOption, setOption, resetOption } = await import('../../src/renderer/config/index');

describe('update preference fields in config', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    resetOption();
  });

  it('defOption includes autoCheckUpdate=true', () => {
    expect(defOption.autoCheckUpdate).toBe(true);
  });

  it('defOption includes autoDownloadUpdate=false', () => {
    expect(defOption.autoDownloadUpdate).toBe(false);
  });

  it('defOption includes updateChannel=stable', () => {
    expect(defOption.updateChannel).toBe('stable');
  });

  it('setOption can toggle autoDownloadUpdate', () => {
    setOption({ autoDownloadUpdate: true } as any);
    expect((getOption() as any).autoDownloadUpdate).toBe(true);
  });

  it('merges new fields into old localStorage without resetting', () => {
    localStorageMock.clear();
    localStorageMock.setItem('option', JSON.stringify({
      iconBlockNameVisible: true, iconBlockCodeVisible: false, iconBlockSize: 150,
      histProj: [], sideMenuWidth: 250, sideEditorWidth: 250, darkMode: true, currentFilePath: '/old/path.icp',
    }));
    const opt = getOption() as any;
    expect(opt.iconBlockCodeVisible).toBe(false);
    expect(opt.darkMode).toBe(true);
    expect(opt.autoCheckUpdate).toBe(true);
    expect(opt.autoDownloadUpdate).toBe(false);
    expect(opt.updateChannel).toBe('stable');
  });
});
