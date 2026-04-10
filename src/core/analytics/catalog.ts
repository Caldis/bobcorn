// src/core/analytics/catalog.ts

import type { ConsentTier } from './types';

export interface EventDef {
  category: string;
  tier: ConsentTier;
  description: string;
}

export const EVENT_CATALOG = {
  // ── Basic tier (opt-out) — anonymous counts + environment ──
  'app.launch': { category: 'app', tier: 'basic', description: 'App started' },
  'app.update_check': { category: 'app', tier: 'basic', description: 'Checked for updates' },
  'app.update_install': { category: 'app', tier: 'basic', description: 'Installed an update' },

  // ── Detailed tier (opt-in) — feature usage ──
  'project.create': { category: 'project', tier: 'detailed', description: 'Created a project' },
  'project.open': { category: 'project', tier: 'detailed', description: 'Opened a project' },
  'project.save': { category: 'project', tier: 'detailed', description: 'Saved a project' },
  'icon.import': { category: 'icon', tier: 'detailed', description: 'Imported icons' },
  'icon.delete': { category: 'icon', tier: 'detailed', description: 'Deleted icons' },
  'icon.export': { category: 'export', tier: 'detailed', description: 'Exported icon files' },
  'font.generate': { category: 'export', tier: 'detailed', description: 'Generated font files' },
  'group.create': { category: 'project', tier: 'detailed', description: 'Created a group' },
  'group.delete': { category: 'project', tier: 'detailed', description: 'Deleted a group' },
  'search.execute': { category: 'icon', tier: 'detailed', description: 'Searched icons' },
  'cli.command': { category: 'cli', tier: 'detailed', description: 'Executed CLI command' },

  // ── UI interactions (params carry specifics) ──
  'settings.change': { category: 'settings', tier: 'detailed', description: 'Changed a setting' },
  'file_menu.click': { category: 'ui', tier: 'detailed', description: 'Clicked file menu item' },
  'project_settings.change': {
    category: 'project',
    tier: 'detailed',
    description: 'Changed project setting',
  },
  'batch.toggle': { category: 'ui', tier: 'detailed', description: 'Toggled batch selection mode' },
  'batch.operation': {
    category: 'batch',
    tier: 'detailed',
    description: 'Executed batch operation',
  },
  'toolbar.action': { category: 'ui', tier: 'detailed', description: 'Used toolbar control' },

  // ── Consent tracking ──
  'consent.respond': {
    category: 'app',
    tier: 'basic',
    description: 'User responded to consent dialog',
  },
} as const satisfies Record<string, EventDef>;

export type EventName = keyof typeof EVENT_CATALOG;

export function getEventsByTier(tier: ConsentTier): EventName[] {
  return (Object.entries(EVENT_CATALOG) as [EventName, EventDef][])
    .filter(([, def]) => def.tier === tier)
    .map(([name]) => name);
}
