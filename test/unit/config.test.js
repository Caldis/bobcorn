import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub localStorage before importing config
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i) => Object.keys(store)[i] ?? null),
    // Allow bracket access (config reads localStorage[key])
  };
})();

// Use a Proxy so that bracket-access (localStorage["option"]) works too
const localStorageProxy = new Proxy(localStorageMock, {
  get(target, prop) {
    if (prop in target) return target[prop];
    // Fall through to the store for bracket-notation reads
    return target.getItem(prop) ?? undefined;
  },
  set(target, prop, value) {
    if (prop in target) { target[prop] = value; return true; }
    target.setItem(prop, value);
    return true;
  },
  deleteProperty(target, prop) {
    target.removeItem(prop);
    return true;
  },
});

vi.stubGlobal('localStorage', localStorageProxy);

// Mock import.meta.env (used by config for dev detection)
// Already handled by vitest — import.meta.env.DEV is false in test by default.

// Mock the decToHex utility that config/index.js imports
vi.mock('../../src/renderer/utils/tools', () => ({
  decToHex: (n) => n.toString(16).toUpperCase(),
}));

// Now import the config module
const {
  default: config,
  defOption,
  getOption,
  setOption,
  resetOption,
} = await import('../../src/renderer/config/index');

describe('config default export', () => {
  it('has defaultSelectedGroup', () => {
    expect(config.defaultSelectedGroup).toBe('resource-all');
  });

  it('has acceptableIconTypes array', () => {
    expect(config.acceptableIconTypes).toEqual(['image/svg+xml']);
  });

  it('has unicode range values', () => {
    expect(config.publicRangeUnicodeDecMin).toBe(57344);
    expect(config.publicRangeUnicodeHexMin).toBe('E000');
    expect(config.publicRangeUnicodeDecMax).toBe(63743);
    expect(config.publicRangeUnicodeHexMax).toBe('F8FF');
  });

  it('generates correct unicode lists', () => {
    expect(config.publicRangeUnicodeDecList).toHaveLength(6399);
    expect(config.publicRangeUnicodeDecList[0]).toBe(57344);
    expect(config.publicRangeUnicodeHexList[0]).toBe('E000');
  });
});

describe('defOption', () => {
  it('has expected default keys', () => {
    expect(defOption).toEqual({
      iconBlockNameVisible: true,
      iconBlockCodeVisible: true,
      iconBlockSize: 100,
      histProj: [],
      sideMenuWidth: 250,
      sideEditorWidth: 250,
      darkMode: false,
      themeMode: 'system',
      currentFilePath: null,
      autoCheckUpdate: true,
      autoDownloadUpdate: false,
      updateChannel: 'stable',
    });
  });
});

describe('resetOption', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('writes defOption to localStorage', () => {
    resetOption();
    const stored = JSON.parse(localStorageMock.getItem('option'));
    expect(stored).toEqual(defOption);
  });
});

describe('getOption', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('initialises localStorage on first call and returns full option', () => {
    const result = getOption();
    expect(result).toEqual(defOption);
  });

  it('returns a specific key when optionKey is provided', () => {
    const size = getOption('iconBlockSize');
    expect(size).toBe(100);
  });

  it('returns full option when optionKey is not a string', () => {
    const result = getOption(42);
    expect(result).toEqual(defOption);
  });
});

describe('setOption', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    // Seed with defaults so getOption inside setOption works
    resetOption();
  });

  it('merges user options into existing options', () => {
    setOption({ iconBlockSize: 200 });
    const result = getOption();
    expect(result.iconBlockSize).toBe(200);
    // Other defaults remain
    expect(result.iconBlockNameVisible).toBe(true);
  });

  it('can add histProj entries', () => {
    setOption({ histProj: ['/path/to/project.icp'] });
    const result = getOption('histProj');
    expect(result).toEqual(['/path/to/project.icp']);
  });
});

describe('resetOption after mutation', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('restores defaults after custom values were set', () => {
    resetOption();
    setOption({ iconBlockSize: 999, iconBlockNameVisible: false });
    resetOption();
    const result = getOption();
    expect(result).toEqual(defOption);
  });
});
