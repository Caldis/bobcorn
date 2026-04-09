// test/unit/analytics/local-store.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordEvent, getAnalyticsData, resetLocalStore } from '../../../src/core/analytics/local-store';

// Mock fs to avoid real file I/O in tests
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(() => { throw new Error('not found'); }),
    writeFileSync: vi.fn(),
  },
}));

describe('Local Analytics Store', () => {
  beforeEach(() => {
    resetLocalStore();
  });

  it('records an event', () => {
    recordEvent('app.launch', 'app', null, null);
    const data = getAnalyticsData();
    expect(data.events).toHaveLength(1);
    expect(data.events[0].e).toBe('app.launch');
    expect(data.events[0].c).toBe('app');
    expect(data.events[0].p).toBeNull();
  });

  it('records event with project context', () => {
    recordEvent('icon.import', 'icon', 'my-icons', { count: 5 });
    const data = getAnalyticsData();
    expect(data.events[0].p).toBe('my-icons');
    expect(data.events[0].d).toEqual({ count: 5 });
  });

  it('aggregates daily counts', () => {
    recordEvent('app.launch', 'app', null, null);
    recordEvent('app.launch', 'app', null, null);
    recordEvent('icon.import', 'icon', null, null);
    const data = getAnalyticsData();
    const today = new Date().toISOString().slice(0, 10);
    expect(data.daily[today]['app.launch']).toBe(2);
    expect(data.daily[today]['icon.import']).toBe(1);
  });
});
