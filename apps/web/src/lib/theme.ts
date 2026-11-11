export type ThemeChoice = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'raise-theme';
const THEME_EVENT = 'raise-theme-change';

export function resolveTheme(choice: ThemeChoice): 'dark' | 'light' {
  if (choice !== 'system') return choice;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function getStoredTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'system' ? stored : 'dark';
}

export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolveTheme(choice);
  window.localStorage.setItem(STORAGE_KEY, choice);
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function subscribeTheme(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener(THEME_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(THEME_EVENT, callback);
  };
}

/** Runs before paint to avoid a flash of the wrong theme. */
export const themeInitScript = `(function(){try{var c=localStorage.getItem("${STORAGE_KEY}")||"dark";var t=c==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):c;document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;
