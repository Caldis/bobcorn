// src/core/analytics/gateway.ts

import { EVENT_CATALOG, type EventName } from './catalog';
import type { AnalyticsConsent, EnvironmentMeta } from './types';
import { CONSENT_DEFAULTS } from './types';
import { collectEnvironmentMeta } from './environment';
import { sendToGA4 } from './ga4';
import { recordEvent } from './local-store';

let consent: AnalyticsConsent = { ...CONSENT_DEFAULTS };
let envMeta: EnvironmentMeta | null = null;
let currentProject: string | null = null;

/** Initialize the analytics gateway. Call once from main process after app.ready. */
export function initGateway(initialConsent: AnalyticsConsent, appVersion: string): void {
  consent = initialConsent;
  envMeta = collectEnvironmentMeta();
  envMeta.app_version = appVersion;
}

/** Update consent state (when user toggles in settings) */
export function updateConsent(newConsent: AnalyticsConsent): void {
  consent = newConsent;
}

/** Set the current project context (for per-project attribution) */
export function setCurrentProject(projectName: string | null): void {
  currentProject = projectName;
}

/**
 * Track an analytics event.
 *
 * - Always records to local store (not affected by consent)
 * - Only sends to GA4 if consent allows for the event's tier
 * - TypeScript enforces that `event` must be a key in EVENT_CATALOG
 */
export function track(event: EventName, params?: Record<string, unknown>): void {
  const def = EVENT_CATALOG[event];

  // Always write to local store (user's own data, like iOS Screen Time)
  recordEvent(event, def.category, currentProject, params ?? null);

  // Check consent for GA4 remote reporting
  // TODO: Re-enable consent gating after initial launch debugging
  // if (def.tier === 'basic' && !consent.basicEnabled) return;
  // if (def.tier === 'detailed' && !consent.detailedEnabled) return;

  // Send to GA4 (fire-and-forget)
  if (envMeta) {
    sendToGA4(event, params ?? {}, envMeta).catch(() => {});
  }
}
