// test/unit/analytics/catalog.test.ts

import { describe, it, expect } from 'vitest';
import { EVENT_CATALOG, getEventsByTier } from '../../../src/core/analytics/catalog';

describe('Event Catalog', () => {
  it('every event has required fields', () => {
    for (const [name, def] of Object.entries(EVENT_CATALOG)) {
      expect(def.category, `${name} missing category`).toBeTruthy();
      expect(['basic', 'detailed'], `${name} invalid tier`).toContain(def.tier);
      expect(def.description, `${name} missing description`).toBeTruthy();
    }
  });

  it('has at least one basic and one detailed event', () => {
    const basic = getEventsByTier('basic');
    const detailed = getEventsByTier('detailed');
    expect(basic.length).toBeGreaterThan(0);
    expect(detailed.length).toBeGreaterThan(0);
  });

  it('app.launch is basic tier', () => {
    expect(EVENT_CATALOG['app.launch'].tier).toBe('basic');
  });

  it('feature events are detailed tier', () => {
    expect(EVENT_CATALOG['icon.import'].tier).toBe('detailed');
    expect(EVENT_CATALOG['font.generate'].tier).toBe('detailed');
  });
});
