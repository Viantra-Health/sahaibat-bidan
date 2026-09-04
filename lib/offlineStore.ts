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

const DB_NAME = 'sahaibat_bidan';
const DB_VERSION = 1;
const VISITS = 'queued_visits';
const REGISTER = 'register';

// ── Types ────────────────────────────────────────────────────────────────────

export type VisitFlow = 'anc' | 'pnc';

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
  visitType: string;              // K1..K6 | KF1..KF4
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
  syncStatus: 'pending' | 'synced' | 'failed';
  syncError?: string;
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
  isPregnant: boolean;
  edd: string | null;
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

export async function getPendingVisits(): Promise<QueuedVisit[]> {
  const all = await getAllVisits();
  return all.filter((v) => v.syncStatus === 'pending' || v.syncStatus === 'failed');
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
  return new Promise((resolve, reject) => {
    const t = db.transaction(REGISTER, 'readwrite');
    const store = t.objectStore(REGISTER);
    for (const r of records) store.put(r);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
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
