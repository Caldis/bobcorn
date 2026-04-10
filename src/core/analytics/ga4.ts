// src/core/analytics/ga4.ts

import type { EnvironmentMeta } from './types';

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const MEASUREMENT_ID = 'G-H1DCS6LF3S';
const GA4_API_SECRET = 'q11FTtGuTP6e0NazX6XVRQ'; // write-only, safe to embed

let clientId = '';

/** Initialize with a persistent client ID (UUID v4 stored in userData) */
export function initGA4(persistedClientId: string): void {
  clientId = persistedClientId;
}

/** Send a single event to GA4 via Measurement Protocol */
export async function sendToGA4(
  eventName: string,
  params: Record<string, unknown>,
  envMeta: EnvironmentMeta
): Promise<void> {
  if (!clientId) return;

  const url = `${GA4_ENDPOINT}?measurement_id=${MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        events: [
          {
            name: eventName,
            params: {
              engagement_time_msec: 1,
              ...envMeta,
              ...params,
            },
          },
        ],
      }),
    });
  } catch {
    // Silent failure — local store has the record
  }
}
