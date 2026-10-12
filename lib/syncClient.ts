// lib/syncClient.ts
// Upload queued visits; download the village-scoped register.
//
// Both directions are non-blocking and degrade to the cached copy. A midwife
// mid-visit must never be stopped by a network she does not have.

import {
  getPendingVisits,
  markVisitRejected, markVisitSynced,
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
/* ── ONE UPLOAD AT A TIME ────────────────────────────────────────────────────
   SyncDaemon calls this on mount, on `online`, on visibilitychange and on a
   five-minute timer. Two of those firing close together — which is exactly
   what happens when she walks back into signal and looks at the screen — ran
   two uploads at once. Both read the SAME queue before either had marked
   anything synced, so both posted the same visits and the server stored them
   twice. Testing found a duplicated K2: three visits where two were uploaded,
   and an iron total of 150 tablets where 120 were recorded.

   A promise, not a boolean: a second caller arriving mid-flight waits for the
   first rather than silently doing nothing, so "sync now" still means the
   queue is clear when it resolves. */
let inFlight: Promise<SyncResult> | null = null;

export async function syncPendingVisits(): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => { inFlight = null; });
  return inFlight;
}

async function runSync(): Promise<SyncResult> {
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
      else {
        /* The server answered about THIS visit and said no. That is a refusal,
           not a failure to reach it, and another attempt will get the same
           answer -- the three stuck visits found in testing were all database
           check constraints on gestational_weeks. */
        await markVisitRejected(r.localId, r.error ?? 'Unknown error');
        failed++;
      }
    }
  } catch {
    for (const v of pending) { await markVisitFailed(v.localId, 'Network error'); failed++; }
  }
  /* ── A SUCCESSFUL UPLOAD MAKES THE REGISTER STALE BY DEFINITION ──────────
     The register is cached for 24 hours, which is right for a device that has
     only been reading. But she has just added a mother, a visit, or a baby, so
     the copy on this device is now known to be behind — and in testing that
     meant a just-registered mother could not be found by search (inviting a
     second registration), a saved visit was missing from her history, and a
     mother who had delivered still showed SEDANG HAMIL with a "→ Lahir"
     button, so the delivery could have been entered twice.

     Forced only when something actually went up, so a quiet device still
     refetches nothing. Best-effort: a failed refresh keeps what is there,
     which is the rule the cache already follows. */
  if (synced > 0) {
    const profileId = pending.find((v) => (v as any)?.profileId)?.profileId as string | undefined;
    if (profileId) await syncRegister(profileId, true).catch(() => {});
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
