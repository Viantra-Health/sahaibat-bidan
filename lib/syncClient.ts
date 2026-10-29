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
     The register is cached, which is right for a device that has only been
     reading. But she has just added a mother, a visit, or a baby, so
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

/**
 * What this build expects a register record to contain.
 *
 * BUMP THIS WHENEVER THE CLIENT STARTS READING A NEW REGISTER FIELD.
 *
 * The register is cached, which is right for its usual job — refetching on
 * every launch would spend a field worker's data for nothing. It is wrong for
 * a SHAPE change: the server starts sending a new field, every device keeps
 * serving yesterday's records without it, and for as long as the cache lasts
 * the app behaves exactly as though the fix had never shipped.
 *
 * That is not hypothetical. `deliveryDate` was added to the register so the KB
 * screen could find a home birth's date, the deployment was confirmed live,
 * and the re-test still saw "Belum ditanyakan" — because the device was still
 * serving a register fetched before the field existed (case K-13c).
 *
 * So the cache is keyed on the shape as well as the clock. A build that reads
 * a newer field refetches once, immediately, and is then back on the normal
 * rhythm.
 */
const REGISTER_SHAPE = '2026-10-29.birthWeight';

/**
 * How long a downloaded register may be trusted.
 *
 * ── WHY THIS IS AN HOUR AND NOT A DAY ────────────────────────────────────
 *
 * It was 24 hours, chosen when this device was the only thing that could
 * change the register: a mother the midwife herself registered is written
 * locally the moment she saves it, so the cached copy was only ever behind on
 * OTHER people's work, and other people were rare.
 *
 * That stopped being true when the clinic became the second door. DOK writes
 * antenatal contacts into this same register — measured 27 Oct 2026: a K2
 * recorded in DOK at 22:42 was on the server immediately, and the midwife's
 * device, which had synced at 22:28, would not have seen it until the
 * following night. In a village that is a mother seen at the clinic in the
 * morning and visited at home in the afternoon by a midwife whose app says her
 * last contact was two days ago — including, in the record this was found on,
 * an open referral for severe hypertension.
 *
 * The register proxy's own comment already says it: "A register is the one
 * thing in this app that must never be stale."
 *
 * The cost of being wrong the other way is small and was measured, not
 * guessed: /api/register for a 167-person village is 17.3 KB on the wire
 * (brotli; 113 KB of JSON). An hourly ceiling costs at most that much per hour
 * the app is actually open, and only when it is open — a quiet device fetches
 * nothing. A failed refresh still keeps what is already stored, so a midwife
 * with no signal loses nothing by asking more often.
 */
const REGISTER_TTL_HOURS = 1;

// ── Download ─────────────────────────────────────────────────────────────────
// Cached per profile, see REGISTER_TTL_HOURS. A stale register is a search
// that misses someone
// registered since; a failed fetch that wipes the cache is a search that
// misses everyone, so failure always keeps what is already there.
export async function syncRegister(profileId: string, force = false): Promise<RegisterSyncResult> {
  if (!profileId) return { count: 0, source: 'skipped' };

  const key = `bidan_register_sync_${profileId}`;
  const shapeKey = `bidan_register_shape_${profileId}`;
  const existing = await getRegisterCount();

  /* A register fetched by an older build does not hold the fields this one
     reads, however fresh it is. Checked before the clock, because the clock
     would otherwise keep serving it for another day. */
  let staleShape = false;
  try {
    staleShape = localStorage.getItem(shapeKey) !== REGISTER_SHAPE;
  } catch {
    /* Storage unavailable (private mode, blocked site data). Refetching is the
       safe answer, and it is also what happens today when the timestamp cannot
       be read, so this changes nothing for that case. */
    staleShape = true;
  }

  if (!force && !staleShape && existing > 0) {
    const last = localStorage.getItem(key);
    if (last && (Date.now() - new Date(last).getTime()) / 3_600_000 < REGISTER_TTL_HOURS) {
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
    /* Only after the records are actually stored. Stamping the shape on a
       fetch that failed to save would suppress the next refetch and leave the
       device permanently short of the field. */
    try { localStorage.setItem(shapeKey, REGISTER_SHAPE); } catch { /* see above */ }

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
