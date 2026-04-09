// src/core/analytics/index.ts

export { track, initGateway, updateConsent, setCurrentProject } from './gateway';
export { EVENT_CATALOG, type EventName, getEventsByTier } from './catalog';
export type { AnalyticsConsent, ConsentTier, EnvironmentMeta, AnalyticsEvent } from './types';
export { CONSENT_DEFAULTS } from './types';
export { initGA4 } from './ga4';
export { initLocalStore, getAnalyticsData } from './local-store';
