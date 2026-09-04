// lib/syncClient.ts
// Upload queued visits; download the village-scoped register.
//
// Both directions are non-blocking and degrade to the cached copy. A midwife
// mid-visit must never be stopped by a network she does not have.

import {
  getPendingVisits,
  markVisitSynced,
  markVisitFailed,
  saveRegister,
  getRegisterCount,
  type RegisterRecord,
} from './offlineStore';

export interface SyncResult { synced: number; failed: number }
export interface RegisterSyncResult {
  count: number;
  source: 'server' | 'cached' | 'skipped';
  scope?: { source: string; villages: string[] };
  reason?: string;
}

// ── Upload ───────────────────────────────────────────────────────────────────
export async function syncPendingVisits(): Promise<SyncResult> {
  const pending = await getPendingVisits();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visits: pending }),
    });
    if (!res.ok) {
      for (const v of pending) { await markVisitFailed(v.localId, `HTTP ${res.status}`); failed++; }
      return { synced: 0, failed };
    }
    const data = await res.json();
    for (const r of (data.results ?? []) as any[]) {
      if (r.ok) { await markVisitSynced(r.localId); synced++; }
      else { await markVisitFailed(r.localId, r.error ?? 'Unknown error'); failed++; }
    }
  } catch {
    for (const v of pending) { await markVisitFailed(v.localId, 'Network error'); failed++; }
  }
  return { synced, failed };
}

// ── Download ─────────────────────────────────────────────────────────────────
// Cached for 24h per profile. A stale register is a search that misses someone
// registered yesterday; a failed fetch that wipes the cache is a search that
// misses everyone, so failure always keeps what is already there.
export async function syncRegister(profileId: string, force = false): Promise<RegisterSyncResult> {
  if (!profileId) return { count: 0, source: 'skipped' };

  const key = `bidan_register_sync_${profileId}`;
  const existing = await getRegisterCount();

  if (!force && existing > 0) {
    const last = localStorage.getItem(key);
    if (last && (Date.now() - new Date(last).getTime()) / 3_600_000 < 24) {
      return { count: existing, source: 'cached' };
    }
  }

  try {
    const res = await fetch(`/api/register?profile_id=${encodeURIComponent(profileId)}`);
    if (!res.ok) return { count: existing, source: 'cached' };

    const data = await res.json();
    const records: RegisterRecord[] = data.records ?? [];

    if (records.length > 0) await saveRegister(records);
    localStorage.setItem(key, new Date().toISOString());

    return {
      count: records.length || existing,
      source: 'server',
      scope: data.scope,
      reason: data.reason,
    };
  } catch {
    return { count: existing, source: 'cached' };
  }
}
