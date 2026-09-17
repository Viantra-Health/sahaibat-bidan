'use client';

// lib/theme.ts
// Light by default, dark by choice.
//
// The default is a legibility decision, not a taste one. A Posyandu runs
// mid-morning in a yard and home visits are outdoors; under glare a dark
// interface loses the contrast between a translucent card and its ground, and
// the screen flattens into one rectangle.
//
// Dark still matters — a night delivery is a real shift — so it stays, as an
// explicit choice. Deliberately NOT wired to prefers-color-scheme: a phone
// left in dark mode at noon is not a midwife working in the dark, and
// following the system would hand her the worse screen in the brighter light.

import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'sahaibat_bidan_theme';
const listeners = new Set<() => void>();

let current: Theme = 'light';
let hydrated = false;

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function apply(theme: Theme): void {
  try {
    document.documentElement.setAttribute('data-theme', theme);
  } catch { /* SSR */ }
}

function subscribe(fn: () => void): () => void {
  if (!hydrated) { current = read(); hydrated = true; apply(current); }
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function getSnapshot(): Theme {
  if (!hydrated) { current = read(); hydrated = true; }
  return current;
}

function getServerSnapshot(): Theme { return 'light'; }

export function setTheme(next: Theme): void {
  if (next === current) return;
  current = next;
  try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
  apply(next);
  listeners.forEach((fn) => fn());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggleTheme = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme],
  );
  return { theme, setTheme, toggleTheme };
}
