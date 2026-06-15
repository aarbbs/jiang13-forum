export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'j13-theme';

/** 在 React 渲染前同步应用主题，避免首屏主题闪烁 */
export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
}
