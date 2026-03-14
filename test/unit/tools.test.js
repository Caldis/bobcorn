/**
 * Unit tests for app/utils/tools/index.js
 *
 * @vitest-environment jsdom
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateUUID,
  isnContainSpace,
  hexToDec,
  decToHex,
  throttle,
  throttleMustRun,
} from '../../app/utils/tools/index.js';

// ── generateUUID ────────────────────────────────────────────────
describe('generateUUID', () => {
  test('returns a string in UUID v4-like format', () => {
    const uuid = generateUUID();
    // 8-4-4-4-12 hex pattern; version nibble is 4, variant nibble is 8-f
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  test('version nibble is always 4', () => {
    for (let i = 0; i < 20; i++) {
      const uuid = generateUUID();
      expect(uuid[14]).toBe('4');
    }
  });

  test('variant nibble has high bit set (8-f)', () => {
    // Implementation uses (r&0x7|0x8) which yields 0x8..0xF
    for (let i = 0; i < 20; i++) {
      const uuid = generateUUID();
      const variant = parseInt(uuid[19], 16);
      expect(variant).toBeGreaterThanOrEqual(0x8);
      expect(variant).toBeLessThanOrEqual(0xf);
    }
  });

  test('generates unique values', () => {
    const uuids = new Set(Array.from({ length: 100 }, () => generateUUID()));
    expect(uuids.size).toBe(100);
  });
});

// ── isnContainSpace ─────────────────────────────────────────────
describe('isnContainSpace', () => {
  test('returns true for a string without spaces', () => {
    expect(isnContainSpace('hello')).toBe(true);
  });

  test('returns false for a string with spaces', () => {
    expect(isnContainSpace('hello world')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isnContainSpace('')).toBe(false);
  });

  test('returns false for null', () => {
    expect(isnContainSpace(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isnContainSpace(undefined)).toBe(false);
  });

  // all=true mode: only returns false when the entire string is whitespace
  test('all=true: returns true for string with partial spaces', () => {
    expect(isnContainSpace('hello world', true)).toBe(true);
  });

  test('all=true: returns false for string that is all whitespace', () => {
    expect(isnContainSpace('   ', true)).toBe(false);
  });

  test('all=true: returns true for tabs mixed with content', () => {
    expect(isnContainSpace('\thello\t', true)).toBe(true);
  });

  test('all=true: returns false for all-tab string', () => {
    expect(isnContainSpace('\t\t\t', true)).toBe(false);
  });
});

// ── hexToDec / decToHex ─────────────────────────────────────────
describe('hexToDec', () => {
  test('converts "FF" to 255', () => {
    expect(hexToDec('FF')).toBe(255);
  });

  test('converts "0" to 0', () => {
    expect(hexToDec('0')).toBe(0);
  });

  test('converts "10" to 16', () => {
    expect(hexToDec('10')).toBe(16);
  });

  test('converts "E000" to 57344', () => {
    expect(hexToDec('E000')).toBe(57344);
  });

  test('handles lowercase hex', () => {
    expect(hexToDec('ff')).toBe(255);
  });
});

describe('decToHex', () => {
  test('converts 255 to "FF"', () => {
    expect(decToHex(255)).toBe('FF');
  });

  test('converts 0 to "0"', () => {
    expect(decToHex(0)).toBe('0');
  });

  test('converts 16 to "10"', () => {
    expect(decToHex(16)).toBe('10');
  });

  test('converts 57344 to "E000"', () => {
    expect(decToHex(57344)).toBe('E000');
  });
});

describe('hexToDec / decToHex reversibility', () => {
  test('round-trip: decToHex then hexToDec returns original number', () => {
    const values = [0, 1, 15, 16, 255, 256, 1024, 57344, 65535];
    for (const n of values) {
      expect(hexToDec(decToHex(n))).toBe(n);
    }
  });

  test('round-trip: hexToDec then decToHex returns original hex (uppercase)', () => {
    const hexValues = ['0', '1', 'F', '10', 'FF', '100', 'E000', 'FFFF'];
    for (const h of hexValues) {
      expect(decToHex(hexToDec(h))).toBe(h);
    }
  });
});

// ── throttle ────────────────────────────────────────────────────
describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('does not call callback immediately', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    expect(fn).not.toHaveBeenCalled();
  });

  test('calls callback after delay', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('rapid calls within delay result in only one execution', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    throttled();
    throttled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('passes arguments to callback', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 50);
    throttled('a', 'b');
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith('a', 'b');
  });
});

// ── throttleMustRun ─────────────────────────────────────────────
describe('throttleMustRun', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('executes immediately when mustRunDelay has elapsed', () => {
    const fn = vi.fn();
    const throttled = throttleMustRun(fn, 100, 200);

    // First call sets t_start, schedules a deferred timer (delay=100)
    throttled();
    expect(fn).not.toHaveBeenCalled();

    // Let the first deferred timer fire (advance 100ms)
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance further so mustRunDelay has elapsed since t_start
    vi.advanceTimersByTime(150);
    fn.mockClear();

    // Now call again; t_curr - t_start >= 200 so it should fire immediately
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('defers calls within mustRunDelay window', () => {
    const fn = vi.fn();
    const throttled = throttleMustRun(fn, 50, 500);

    throttled();
    expect(fn).not.toHaveBeenCalled();

    // Call again within mustRunDelay, should set a new timer (deferred)
    vi.advanceTimersByTime(30);
    throttled();
    expect(fn).not.toHaveBeenCalled();

    // Advance past the delay to trigger the deferred call
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('rapid calls coalesce to single deferred + must-run executions', () => {
    const fn = vi.fn();
    const throttled = throttleMustRun(fn, 50, 200);

    // Fire many rapid calls at time 0, 10, 20, ...
    for (let i = 0; i < 5; i++) {
      throttled();
      vi.advanceTimersByTime(10);
    }
    // At this point, 50ms have elapsed (5 * 10ms), still < 200 mustRunDelay
    // Only a pending timer should exist; let it fire
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
