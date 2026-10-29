// lib/offlineStore.ts
// IndexedDB for the Bidan app: the visit queue, and the cached person register.
//
// Two stores, deliberately kept apart because they have different consequences
// when something goes wrong:
//
//   queued_visits  clinical data that exists NOWHERE ELSE until it syncs.
//                  Never clear it on a whim, never tie it to anything the
//                  midwife can lose (see the passcode note in the spec).
//
//   register       a cache of people, rebuildable from the server at any time.
//                  Safe to drop and refetch.

import { notifyRegisterChanged } from './registerBus';

const DB_NAME = 'sahaibat_bidan';
const DB_VERSION = 1;
const VISITS = 'queued_visits';
const REGISTER = 'register';

// ── Types ────────────────────────────────────────────────────────────────────

/* 'kb' joined these when family planning was found to exist nowhere on the
   field side at all -- no table, no route, no field but a single boolean on
   the postnatal visit saying a conversation had happened. */
export type VisitFlow = 'anc' | 'pnc' | 'delivery' | 'kn' | 'kb';

export interface QueuedVisit {
  localId: string;
  profileId: string;
  ngoId: string;

  // Set when the midwife picked an existing person from the register. Carrying
  // it means a confirmed identity stays confirmed — the server can link the
  // visit directly instead of re-resolving from name and NIK and possibly
  // landing on someone else.
  memberId?: string | null;

  flow: VisitFlow;
  visitType: string;              // K1..K6 | KF1..KF4 | KN1..KN3 | PERSALINAN
  motherName: string;
  gestationalWeeks?: number | null;
  daysPostpartum?: number | null;

  // The 10T / PNC fields as entered. Kept as a bag rather than columns so the
  // form can grow without a DB_VERSION bump; the server maps it explicitly.
  data: Record<string, unknown>;

  // Computed on-device by @sahaibat/anc-engine so the midwife gets her score
  // and flags with no network at all.
  qualityScore?: number | null;
  flags?: Array<{ type: string; severity: string }>;
  referNow?: boolean;

  createdAt: string;

  /* ── THE DATE OF THE VISIT, IN THE CALENDAR SHE IS STANDING IN ────────────
     createdAt is an INSTANT and must stay one. The server used to derive the
     visit date from it with createdAt.split('T')[0] -- and createdAt is
     toISOString(), so it is the UTC date. A visit recorded at 02:00 WIB was
     filed under the previous day, every time, which is a clinical date on a
     clinical record and night work is not rare in this job.

     Only the device knows what day it is where she is: the server sees an
     instant and a phone that never sends a timezone. So the calendar date
     travels as its own field, and the server prefers it. */
  visitDate?: string | null;
  /* 'rejected' is NOT 'failed'. failed means the upload did not happen —
     no signal, a 500, a dropped connection — and trying again is the right
     answer. rejected means the server received this visit, looked at it, and
     refused it: a database constraint, a validation error. Retrying that for
     ever changes nothing, and counting it as "waiting for signal" is how a
     visit sat on a device unseen. */
  syncStatus: 'pending' | 'synced' | 'failed' | 'rejected';
  syncError?: string;
}

export interface VisitSummary {
  /* 'kn' and 'delivery' were added after the register was found to carry
     neither: a baby with two recorded KN1 visits still showed KN1 as due,
     because nothing about her visits ever reached the device. */
  kind: 'anc' | 'pnc' | 'kn' | 'delivery';
  date: string;
  visitType: string | null;
  context: string | null;      // "28 mgg" | "hari ke-7"
  issue: string | null;        // what was wrong
  management: string | null;   // what she did about it
  followUp: string | null;     // what she planned next
  vitals: string | null;       // the numbers behind it
  /* Which door recorded it: 'bidan' is a field worker, 'klinik' is a clinic
     writing through DOK into this same register. Optional because a device
     holding a register downloaded by an older build has visits without it,
     and a missing source must read as "not stated", never as "mine". */
  by?: 'bidan' | 'klinik' | null;
}

export interface RegisterRecord {
  memberId: string;
  familyId: string;
  name: string;
  role: string | null;
  sex: string | null;
  dob: string | null;
  ageYears: number | null;
  ageMonths: number | null;
  regionId: number | null;
  village: string | null;
  subdistrict: string | null;
  motherName: string | null;
  /* ── WHAT SHE WEIGHED AT BIRTH, ON A CHILD'S RECORD ───────────────────
     The KN form asked for it with the placeholder "dari Buku KIA" every time,
     including for a baby a clinic had delivered an hour earlier with the
     number already in the register's own database. For a preterm baby it is
     the figure the protocol turns on. Optional: a register fetched by an
     older build has no such field, and absent must read as "not known". */
  birthWeightGrams?: number | null;
  birthLengthCm?: number | null;
  birthHeadCircCm?: number | null;
  isPregnant: boolean;
  edd: string | null;
  /**
   * When she gave birth, where the register can tell.
   *
   * `deliverySource` says whether anybody actually recorded a delivery:
   * 'recorded' is a delivery row, 'newborn' is her baby's date of birth, and
   * 'pnc_visit' is a postnatal visit's day count walked back. The last two are
   * real dates and are NOT records of the birth — which is the ordinary case
   * for a home birth the midwife met afterwards, and exactly the mother for
   * whom the 42-day window matters most.
   */
  deliveryDate?: string | null;
  deliverySource?: 'recorded' | 'newborn' | 'pnc_visit' | null;
  /**
   * The last few visits, newest first.
   *
   * Carried with the register rather than fetched on tap, because the midwife
   * who needs it is standing in a village with no signal — and in Indonesia
   * she is running the whole pregnancy herself, so "what did I find last time
   * and what did I plan" is the question, not "should I refer".
   */
  history?: VisitSummary[];

  /**
   * Totals across the WHOLE pregnancy, not just the visits in `history`.
   *
   * history is capped at the last three, which answers "what did I find last
   * time" but cannot answer "what has still never been done" — and the second
   * question is the one that leaves a woman anaemic all pregnancy because
   * every single visit assumed the last one had checked.
   *
   * Null for anyone not currently pregnant: these totals would then describe
   * a pregnancy that has ended.
   */
  pregnancy?: {
    contactsDone: string[];        // 'K1'..'K6', in no particular order
    ttStatus: string | null;       // most recent non-null
    lastHb: number | null;
    lastHbDate: string | null;
    feTotal: number;               // summed across every visit
    visits: number;
  } | null;

  /**
   * A referral she made that nobody ever closed, so the next visit can ask.
   *
   * CARRIED WITH THE REGISTER for the same reason birthPlan and history are:
   * she is standing in a village with no signal when the question matters. A
   * fetch-on-tap would mean the one follow-up question that closes the national
   * risti indicator is the only thing in this app that needs a network.
   *
   * Null when there is nothing outstanding, which is the normal case.
   */
  openReferral: {
    id: number;
    createdAt: string;
    reason: string | null;
    urgency: string | null;
  } | null;

  /** Last recorded P4K, so the checklist carries forward between visits. */
  birthPlan: {
    fasilitas: string | null; transportasi: string | null; donorDarah: string | null;
    pendanaan: string | null; pendamping: string | null; catatan: string | null;
  } | null;
  nikLast4: string | null;
  phoneLast4: string | null;
  lastSeenAt: string | null;
  lastSeenBy: string | null;
  updatedAt: string | null;
}

// ── DB ───────────────────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(VISITS)) {
        const s = db.createObjectStore(VISITS, { keyPath: 'localId' });
        s.createIndex('syncStatus', 'syncStatus', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(REGISTER)) {
        const s = db.createObjectStore(REGISTER, { keyPath: 'memberId' });
        // Indexed for scoped browsing, not for search — search normalises the
        // name first, and IndexedDB cannot index a derived value.
        s.createIndex('regionId', 'regionId', { unique: false });
        s.createIndex('isPregnant', 'isPregnant', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      })
  );
}

export function generateLocalId(): string {
  return `bv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Visit queue ──────────────────────────────────────────────────────────────

export async function saveVisit(v: QueuedVisit): Promise<void> {
  await tx(VISITS, 'readwrite', (s) => s.put(v));
}

export async function getAllVisits(): Promise<QueuedVisit[]> {
  return tx<QueuedVisit[]>(VISITS, 'readonly', (s) => s.getAll());
}

/** What is worth trying again. Deliberately excludes `rejected`: the server
 *  has already answered about those and the answer will not change. */
export async function getPendingVisits(): Promise<QueuedVisit[]> {
  const all = await getAllVisits();
  return all.filter((v) => v.syncStatus === 'pending' || v.syncStatus === 'failed');
}

/** Visits the server refused. These need a person, not another attempt. */
export async function getRejectedVisits(): Promise<QueuedVisit[]> {
  const all = await getAllVisits();
  return all.filter((v) => v.syncStatus === 'rejected');
}

/** Counts for the banner on the register: what is waiting, and what is stuck. */
/**
 * The most recent birth THIS DEVICE recorded for a mother, synced or not.
 *
 * The register is the right source for a birth recorded last week, and the
 * wrong one for a birth recorded ninety seconds ago: the row has to upload and
 * come back before the server knows about it. A midwife records the delivery
 * and opens the postnatal visit immediately -- that is the normal order of her
 * afternoon, not an edge case -- and asking the register then gets the answer
 * from before the birth.
 *
 * So the queue is asked first. It is the one place that knows what she just
 * did while she was offline, which is most of the time.
 */
export async function getLocalDeliveryDate(memberId: string): Promise<string | null> {
  if (!memberId) return null;
  const all = await getAllVisits();
  const mine = all
    .filter((v) => v.flow === 'delivery' && v.memberId === memberId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  for (const v of mine) {
    const d = (v.data as any)?.deliveryDate ?? v.visitDate;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }

  /* ── A BIRTH THIS DEVICE NEVER RECORDED ────────────────────────────────
     Only queued delivery visits were consulted, so a mother whose baby was
     born at home before the midwife met her had no delivery date at all —
     no KBPP header, no postpartum restriction, and the 48h-4wk row asked by
     hand beside a baby whose birthday is in the register (case K-13/D2).

     The register now carries the date, worked out server-side from her
     newborn's date of birth or a postnatal visit's day count. Read second, so
     a delivery SHE recorded on this device always wins — including one still
     sitting in the queue, which the server has not seen yet. */
  const rec = await getRegisterRecord(memberId);
  const fromRegister = rec?.deliveryDate;
  return typeof fromRegister === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fromRegister)
    ? fromRegister
    : null;
}

export async function queueCounts(): Promise<{ waiting: number; rejected: number }> {
  const all = await getAllVisits();
  return {
    waiting: all.filter((v) => v.syncStatus === 'pending' || v.syncStatus === 'failed').length,
    rejected: all.filter((v) => v.syncStatus === 'rejected').length,
  };
}

export async function markVisitSynced(localId: string): Promise<void> {
  const v = await tx<QueuedVisit | undefined>(VISITS, 'readonly', (s) => s.get(localId));
  if (!v) return;
  await saveVisit({ ...v, syncStatus: 'synced', syncError: undefined });
}

export async function markVisitFailed(localId: string, error: string): Promise<void> {
  const v = await tx<QueuedVisit | undefined>(VISITS, 'readonly', (s) => s.get(localId));
  if (!v) return;
  await saveVisit({ ...v, syncStatus: 'failed', syncError: error });
}

/** The server looked at this visit and refused it. Stop retrying; tell her. */
export async function markVisitRejected(localId: string, error: string): Promise<void> {
  const v = await tx<QueuedVisit | undefined>(VISITS, 'readonly', (s) => s.get(localId));
  if (!v) return;
  await saveVisit({ ...v, syncStatus: 'rejected', syncError: error });
}

/**
 * Put refused visits back in the queue, once the reason they were refused is gone.
 *
 * WHY THIS HAS TO EXIST
 *
 * markVisitRejected stops retrying on purpose: the server looked at the visit
 * and said no, and hammering it gets the same answer. That is right while the
 * refusal stands. It is wrong the moment the refusal is FIXED.
 *
 * Seven visits were stuck on the test device because the server would not
 * accept a blank gestational age. phase-9k makes it accept one - and without
 * this, those seven clinical records stay lost for ever, because nothing
 * would ever ask again. The fix would have helped only future visits, and the
 * mothers already recorded would have been examined for nothing.
 *
 * Non-destructive. A visit whose refusal still stands is simply refused again
 * and returns here with the same message; nothing is deleted and nothing is
 * altered except the status and the stale error. So it is always safe to
 * offer, and it cannot make anything worse.
 */
export async function retryRejectedVisits(): Promise<number> {
  const rejected = await getRejectedVisits();
  for (const v of rejected) {
    await saveVisit({ ...v, syncStatus: 'pending', syncError: undefined });
  }
  return rejected.length;
}

/** Synced visits older than `days`. The queue is not an archive — but nothing
 *  unsynced is ever eligible, whatever its age. */
export async function pruneSyncedVisits(days = 30): Promise<number> {
  const all = await getAllVisits();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const stale = all.filter(
    (v) => v.syncStatus === 'synced' && new Date(v.createdAt).getTime() < cutoff
  );
  for (const v of stale) {
    await tx(VISITS, 'readwrite', (s) => s.delete(v.localId));
  }
  return stale.length;
}

// ── Register cache ───────────────────────────────────────────────────────────

export async function saveRegister(records: RegisterRecord[]): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(REGISTER, 'readwrite');
    const store = t.objectStore(REGISTER);
    for (const r of records) store.put(r);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  /* Every register write goes through here, so this is the one place that can
     tell a screen it is now showing the past. See lib/registerBus.ts. */
  notifyRegisterChanged();
}

export async function getRegister(): Promise<RegisterRecord[]> {
  return tx<RegisterRecord[]>(REGISTER, 'readonly', (s) => s.getAll());
}

export async function getRegisterCount(): Promise<number> {
  return tx<number>(REGISTER, 'readonly', (s) => s.count());
}

export async function getRegisterRecord(memberId: string): Promise<RegisterRecord | undefined> {
  return tx<RegisterRecord | undefined>(REGISTER, 'readonly', (s) => s.get(memberId));
}

/** Drop the whole cache. Safe by construction — it is rebuildable from the
 *  server, unlike the visit queue, which this must never touch. */
export async function clearRegister(): Promise<void> {
  await tx(REGISTER, 'readwrite', (s) => s.clear());
}
