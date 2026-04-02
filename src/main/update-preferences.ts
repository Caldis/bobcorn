import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface UpdatePreferences {
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
  updateChannel: 'stable' | 'beta';
}

const DEFAULTS: UpdatePreferences = {
  autoCheckUpdate: true,
  autoDownloadUpdate: false,
  updateChannel: 'stable',
};

function getPrefsPath(): string {
  return path.join(app.getPath('userData'), 'update-preferences.json');
}

export function readUpdatePreferences(): UpdatePreferences {
  try {
    const raw = fs.readFileSync(getPrefsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeUpdatePreferences(prefs: Partial<UpdatePreferences>): void {
  const current = readUpdatePreferences();
  const merged = { ...current, ...prefs };
  fs.writeFileSync(getPrefsPath(), JSON.stringify(merged, null, 2), 'utf-8');
}
