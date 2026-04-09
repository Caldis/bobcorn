// test/unit/analytics/consent.test.ts

import { describe, it, expect } from 'vitest';
import { CONSENT_DEFAULTS } from '../../../src/core/analytics/types';

describe('AnalyticsConsent defaults', () => {
  it('basicEnabled defaults to true (opt-out)', () => {
    expect(CONSENT_DEFAULTS.basicEnabled).toBe(true);
  });

  it('detailedEnabled defaults to false (opt-in)', () => {
    expect(CONSENT_DEFAULTS.detailedEnabled).toBe(false);
  });

  it('consentVersion starts at 1', () => {
    expect(CONSENT_DEFAULTS.consentVersion).toBe(1);
  });

  it('merge preserves user overrides', () => {
    const userPrefs = { detailedEnabled: true };
    const merged = { ...CONSENT_DEFAULTS, ...userPrefs };
    expect(merged.detailedEnabled).toBe(true);
    expect(merged.basicEnabled).toBe(true);
  });
});
