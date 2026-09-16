// lib/referralTargets.ts
// Rungs 1-3, cached so a referral decision never waits on a network.
//
// Fetched opportunistically alongside the register and kept in localStorage
// rather than IndexedDB: it is a short list, it is not clinical data, and
// losing it costs nothing — rung 4 still works, which is the whole point of
// rung 4 existing.

export interface ReferralTarget {
  rung: 1 | 2 | 3;
  kind: 'puskesmas' | 'provider' | 'dok';
  ref: string;
  name: string;
  subtitle: string | null;
  confirmed: boolean;
  acceptsBpjs?: boolean;
}

interface Cached {
  targets: ReferralTarget[];
  notes: string[];
  fetchedAt: string;
}

const key = (profileId: string) => `sahaibat_bidan_referral_targets_${profileId}`;

export function getCachedTargets(profileId: string): Cached | null {
  try {
    const raw = localStorage.getItem(key(profileId));
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch { return null; }
}

/**
 * Refresh in the background. Never throws, never clears on failure.
 *
 * A failed fetch that wiped the cache would turn "here are the two Puskesmas
 * near you" into "no referral options" on a bad signal, which is worse than
 * a stale list.
 */
export async function refreshTargets(profileId: string): Promise<Cached | null> {
  if (!profileId) return null;
  try {
    const res = await fetch(`/api/referral-targets?profileId=${encodeURIComponent(profileId)}`);
    if (!res.ok) return getCachedTargets(profileId);
    const data = await res.json();
    const next: Cached = {
      targets: Array.isArray(data.targets) ? data.targets : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      fetchedAt: new Date().toISOString(),
    };
    // Only overwrite with something. An upstream that returns an empty list
    // because it could not reach the database should not erase a good cache.
    if (next.targets.length > 0 || (getCachedTargets(profileId)?.targets.length ?? 0) === 0) {
      try { localStorage.setItem(key(profileId), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    }
    return getCachedTargets(profileId);
  } catch {
    return getCachedTargets(profileId);
  }
}

/**
 * Why there is nothing to show, in her language.
 *
 * Never "no results" on its own. A midwife who opens a chooser and finds an
 * empty list concludes the app is broken, and she is not wrong to — the
 * reason is always something on our side, so say which.
 */
export function explainEmpty(notes: string[], t: (id: string, en: string) => string = (id) => id): string {
  if (notes.includes('no_region')) {
    return t('Posyandu Anda belum terhubung ke desa, jadi rujukan otomatis belum tersedia.',
             'Your Posyandu is not linked to a village yet, so automatic referral targets are unavailable.');
  }
  if (notes.includes('puskesmas_master_unavailable') || notes.includes('no_puskesmas_in_kabupaten')) {
    return t('Daftar Puskesmas untuk wilayah Anda belum tersedia.',
             'The Puskesmas list for your district is not available yet.');
  }
  if (notes.includes('unreachable') || notes.some((n) => n.startsWith('upstream_'))) {
    return t('Daftar tujuan rujukan belum bisa dimuat. Surat rujukan tetap bisa dibuat.',
             'Referral destinations could not be loaded. The referral letter still works.');
  }
  return t('Belum ada faskes terdaftar untuk wilayah Anda.',
           'No registered facilities for your district yet.');
}
