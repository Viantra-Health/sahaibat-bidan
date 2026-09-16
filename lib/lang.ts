'use client';

// lib/lang.ts
// Bahasa Indonesia and English, Indonesian by default.
//
// WHY A STORE RATHER THAN CONTEXT
// -------------------------------
// The toggle lives in the header and the strings live in every form, so a
// provider would have to wrap the tree and every component would need the
// hook threaded through. A module-level store with useSyncExternalStore gives
// the same result with no provider and no re-render of anything that does not
// read the language.
//
// WHY t() RATHER THAN PAIRED SPANS
// --------------------------------
// Kader and DOK use paired <span className="id"/.en"> against a stylesheet.
// Bidan has no stylesheet — it is inline styles throughout — and half the
// strings here are not renderable as spans anyway: placeholder, aria-label,
// and the option lists inside every <Select>. So this is the second
// established pattern, the t() helper.
//
// WHAT STAYS INDONESIAN IN BOTH MODES
// -----------------------------------
// The clinical vocabulary a midwife is trained on and writes in the Buku KIA:
// LILA, TFU, DJJ, K1-K6, KF1-KF4, P4K, EPDS. Rendering those as "MUAC" and
// "fundal height" would make English mode harder to use, not easier — the
// form has to match the book in front of her.
//
// The referral letter is also Indonesian always. It is a formal document
// handed to an Indonesian clinic; the midwife's UI language is not the
// recipient's.

import { useCallback, useSyncExternalStore } from 'react';

export type Lang = 'id' | 'en';

const KEY = 'sahaibat_bidan_lang';
const listeners = new Set<() => void>();

let current: Lang = 'id';
let hydrated = false;

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'id';
  } catch {
    return 'id';
  }
}

function subscribe(fn: () => void): () => void {
  // Hydrate lazily, on first subscribe, so the module is safe to import on
  // the server and the first client read is the stored value.
  if (!hydrated) { current = read(); hydrated = true; }
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function getSnapshot(): Lang {
  if (!hydrated) { current = read(); hydrated = true; }
  return current;
}

/** Server render is always Indonesian, which is also the default. */
function getServerSnapshot(): Lang {
  return 'id';
}

export function setLang(next: Lang): void {
  if (next === current) return;
  current = next;
  try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
  listeners.forEach((fn) => fn());
}

export function useLang() {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /** t('Simpan kunjungan', 'Save visit') */
  const t = useCallback((id: string, en: string) => (lang === 'en' ? en : id), [lang]);

  const toggle = useCallback(() => setLang(lang === 'en' ? 'id' : 'en'), [lang]);

  return { lang, t, toggle, setLang };
}

/**
 * Pick the right side of a bilingual clinical flag.
 *
 * Every rule in @sahaibat/anc-engine already carries message_id AND
 * message_en — all 37 antenatal and 15 postnatal ones. The app hardcoded
 * message_id, so the entire clinical layer was Indonesian-only despite the
 * English having been written years ago.
 */
export function flagMessage(
  flag: { message_id: string; message_en: string },
  lang: Lang,
): string {
  return lang === 'en' ? flag.message_en : flag.message_id;
}
