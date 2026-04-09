// test/unit/analytics/gateway.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies before importing gateway
vi.mock('../../../src/core/analytics/ga4', () => ({
  sendToGA4: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../../src/core/analytics/local-store', () => ({
  recordEvent: vi.fn(),
}));
vi.mock('../../../src/core/analytics/environment', () => ({
  collectEnvironmentMeta: vi.fn(() => ({
    app_version: '1.0.0',
    os: 'win32',
    os_version: '10.0',
    locale: 'en-US',
    screen_res: '1920x1080',
    arch: 'x64',
  })),
}));

import { initGateway, track, updateConsent } from '../../../src/core/analytics/gateway';
import { sendToGA4 } from '../../../src/core/analytics/ga4';
import { recordEvent } from '../../../src/core/analytics/local-store';
import { CONSENT_DEFAULTS } from '../../../src/core/analytics/types';

describe('Analytics Gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initGateway({ ...CONSENT_DEFAULTS }, '1.0.0');
  });

  it('always records to local store regardless of consent', () => {
    updateConsent({ ...CONSENT_DEFAULTS, basicEnabled: false, detailedEnabled: false });
    track('app.launch');
    expect(recordEvent).toHaveBeenCalledWith('app.launch', 'app', null, null);
  });

  it('sends basic events to GA4 when basicEnabled=true', () => {
    track('app.launch');
    expect(sendToGA4).toHaveBeenCalled();
  });

  it('blocks basic events from GA4 when basicEnabled=false', () => {
    updateConsent({ ...CONSENT_DEFAULTS, basicEnabled: false });
    track('app.launch');
    expect(sendToGA4).not.toHaveBeenCalled();
  });

  it('blocks detailed events from GA4 when detailedEnabled=false (default)', () => {
    track('icon.import');
    expect(sendToGA4).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalled();
  });

  it('sends detailed events to GA4 when detailedEnabled=true', () => {
    updateConsent({ ...CONSENT_DEFAULTS, detailedEnabled: true });
    track('icon.import', { count: 5 });
    expect(sendToGA4).toHaveBeenCalled();
  });

  it('passes params through to GA4 and local store', () => {
    updateConsent({ ...CONSENT_DEFAULTS, detailedEnabled: true });
    track('icon.import', { count: 5 });
    expect(recordEvent).toHaveBeenCalledWith('icon.import', 'icon', null, { count: 5 });
    expect(sendToGA4).toHaveBeenCalledWith(
      'icon.import',
      { count: 5 },
      expect.objectContaining({ app_version: '1.0.0' })
    );
  });
});
