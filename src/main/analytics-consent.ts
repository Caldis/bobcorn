// src/main/analytics-consent.ts

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { AnalyticsConsent } from '../core/analytics/types';
import { CONSENT_DEFAULTS } from '../core/analytics/types';

function getConsentPath(): string {
  return path.join(app.getPath('userData'), 'analytics-consent.json');
}

export function readAnalyticsConsent(): AnalyticsConsent {
  try {
    const raw = fs.readFileSync(getConsentPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...CONSENT_DEFAULTS, ...parsed };
  } catch {
    return { ...CONSENT_DEFAULTS };
  }
}

export function writeAnalyticsConsent(consent: Partial<AnalyticsConsent>): void {
  const current = readAnalyticsConsent();
  const merged = { ...current, ...consent };
  fs.writeFileSync(getConsentPath(), JSON.stringify(merged, null, 2), 'utf-8');
}
