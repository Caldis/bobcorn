// Pure data module — no imports, no side effects.
// Shared between bootstrap.tsx (synchronous, pre-render) and store.

export const THEME_CLASSES: Record<string, string> = {
  light: '',
  dark: 'dark',
};

export function resolveTheme(mode: 'light' | 'dark' | 'system'): {
  resolved: string;
  isDark: boolean;
} {
  const resolved =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;
  return { resolved, isDark: resolved === 'dark' };
}

export function applyThemeClass(resolved: string): void {
  const el = document.documentElement;
  Object.values(THEME_CLASSES).forEach((cls) => {
    if (cls) el.classList.remove(cls);
  });
  const themeClass = THEME_CLASSES[resolved];
  if (themeClass) el.classList.add(themeClass);
}
