// src/core/analytics/types.ts

export type ConsentTier = 'basic' | 'detailed';

export interface AnalyticsConsent {
  basicEnabled: boolean; // default: true (opt-out)
  detailedEnabled: boolean; // default: false (opt-in)
  consentShownAt: string; // ISO date string, '' if never shown
  consentVersion: number; // bump to re-show consent dialog
}

export const CONSENT_DEFAULTS: AnalyticsConsent = {
  basicEnabled: true,
  detailedEnabled: false,
  consentShownAt: '',
  consentVersion: 1,
};

export interface EnvironmentMeta {
  app_version: string;
  os: string;
  os_version: string;
  locale: string;
  screen_res: string;
  arch: string;
}

export interface AnalyticsEvent {
  /** Event name from catalog */
  e: string;
  /** Category */
  c: string;
  /** Project name (null for cross-project events) */
  p: string | null;
  /** Extra params */
  d: Record<string, unknown> | null;
  /** Unix timestamp ms */
  t: number;
}
