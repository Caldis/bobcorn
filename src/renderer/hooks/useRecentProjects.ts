import { useState, useCallback } from 'react';
import { getOption, setOption } from '../config';

/**
 * Shared hook for recent projects history.
 * Used by both SplashScreen and ProjectSwitcher to read/modify the same data source.
 */
export function useRecentProjects() {
  const [histProj, setHistProj] = useState<string[]>(
    () => (getOption('histProj') as string[]) || []
  );

  /** Re-read from localStorage (call when popover opens or after external changes) */
  const refresh = useCallback(() => {
    setHistProj((getOption('histProj') as string[]) || []);
  }, []);

  const removeHistItem = useCallback((pathToRemove: string) => {
    setHistProj((prev) => {
      const updated = prev.filter((p) => p !== pathToRemove);
      setOption({ histProj: updated });
      return updated;
    });
  }, []);

  const clearAllHist = useCallback(() => {
    setOption({ histProj: [] });
    setHistProj([]);
  }, []);

  return { histProj, removeHistItem, clearAllHist, refresh };
}

/** Extract the filename from a full file path */
export function getFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

/** Extract the filename without extension for display */
export function getFileDisplayName(filePath: string): string {
  return getFileName(filePath).replace(/\.[^.]+$/, '');
}
