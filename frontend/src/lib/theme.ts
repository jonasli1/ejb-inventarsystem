import type { ThemePreference } from '@/lib/api-types';

const STORAGE_KEY = 'theme-preference';

let systemMediaQuery: MediaQueryList | null = null;
let systemListener: ((e: MediaQueryListEvent) => void) | null = null;

function resolveIsDark(pref: ThemePreference): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Applies a theme preference to <html class="dark">, live-tracking the OS
 * setting while `pref === 'system'`. Also caches the choice in localStorage
 * so the next page load can apply it instantly (see getCachedTheme), before
 * the server round-trip (`/auth/me`) that carries the authoritative value
 * has a chance to resolve.
 */
export function applyTheme(pref: ThemePreference): void {
  if (systemMediaQuery && systemListener) {
    systemMediaQuery.removeEventListener('change', systemListener);
    systemMediaQuery = null;
    systemListener = null;
  }

  document.documentElement.classList.toggle('dark', resolveIsDark(pref));

  if (pref === 'system') {
    systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemListener = (e) => document.documentElement.classList.toggle('dark', e.matches);
    systemMediaQuery.addEventListener('change', systemListener);
  }

  localStorage.setItem(STORAGE_KEY, pref);
}

export function getCachedTheme(): ThemePreference {
  const cached = localStorage.getItem(STORAGE_KEY);
  return cached === 'light' || cached === 'dark' || cached === 'system' ? cached : 'system';
}
