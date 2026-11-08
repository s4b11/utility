import { useCallback, useEffect, useState } from 'react';

/** DESIGN.md 2.1 Theme selection: data-theme on <html>, session-only override. */
export type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

const listeners = new Set<(t: Theme) => void>();

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { sessionStorage.setItem('theme', t); } catch { /* private mode */ }
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    // DESIGN.md 2.1 `surface` role in each theme (status bar / browser chrome).
    m.setAttribute('content', t === 'dark' ? '#111317' : '#F6F9FF');
    m.removeAttribute('media');
  });
  listeners.forEach((fn) => fn(t));
}

export function useTheme() {
  const [theme, set] = useState<Theme>(currentTheme);
  useEffect(() => {
    listeners.add(set);
    return () => { listeners.delete(set); };
  }, []);
  const toggle = useCallback(() => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggle, setTheme };
}
