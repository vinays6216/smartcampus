// Light / dark mode. The choice is remembered in this browser; without a choice the system setting is used.
const KEY = 'theme';

const stored = () => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
const systemDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const currentTheme = () => stored() || (systemDark() ? 'dark' : 'light');

export function applyTheme(theme = currentTheme()) {
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next); } catch { /* private mode: still switch for this visit */ }
  return applyTheme(next);
}
