// lib/search.ts
// Offline search over the cached register.
//
// Search is by NAME ONLY — midwives do not carry NIKs, and asking for one is
// how you get "register new" and a duplicate. So the query carries no
// identifying signal beyond a name, and everything that orders the results has
// to come from context the app already holds: her village, how recently the
// person was seen, and whether the flow she opened is about pregnancy.
//
// Ranking rather than truncating is the point. Showing five arbitrary Sitis
// with no hint that a sixth exists is precisely what makes a midwife conclude
// the woman is not registered.

import { nameSimilarity, normaliseName } from '@sahaibat/identity';
import type { RegisterRecord } from './offlineStore';

export interface SearchFilters {
  /** Her own village. Not a hard filter — a boost, so a neighbouring-village
   *  record still appears rather than vanishing. */
  homeRegionId?: number | null;
  /** Set by the flow she opened: ANC ranks pregnant women first. */
  preferPregnant?: boolean;
  /** Tapped chips. These ARE hard filters — she asked for them explicitly. */
  onlyPregnant?: boolean;
  onlyRegionId?: number | null;
  seenWithinDays?: number | null;
}

export interface SearchHit {
  record: RegisterRecord;
  score: number;
  /** Short reasons shown under the row, so a ranking decision is legible
   *  rather than mysterious. */
  why: string[];
}

export interface SearchOutcome {
  hits: SearchHit[];
  /** How many matched but are not shown. Surfaced as "+N lainnya" — silent
   *  truncation is what creates duplicates. */
  more: number;
  total: number;
}

const DEFAULT_LIMIT = 10;
const MIN_SCORE = 0.25;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

/**
 * Could an antenatal visit plausibly be for this person?
 *
 * The register is a shared person index for the whole platform — men,
 * children and grandparents are in it, correctly. Bidan is not, so a row that
 * cannot be pregnant should not sit at the top of a midwife's results, and
 * tapping one should ask before opening an antenatal form.
 *
 * UNKNOWN IS ALWAYS PLAUSIBLE. Missing sex or missing age must never demote or
 * block anyone: a woman entered by a kader may have neither recorded, and she
 * is exactly the mother a midwife most needs to find. This narrows a ranking,
 * it does not gate care.
 */
export function ancPlausible(r: RegisterRecord): boolean {
  const sex = (r.sex ?? '').trim().toLowerCase();
  // l / laki-laki / m / male. 'p' is perempuan, so it is NOT a male marker.
  if (sex && /^(l|m|male|laki|laki-laki|pria)$/.test(sex)) return false;

  const age = r.ageYears;
  if (age != null && (age < 12 || age > 55)) return false;

  return true;
}

/** Why a record looks implausible, for the confirmation sentence. */
export function ancImplausibleReason(r: RegisterRecord): string | null {
  const sex = (r.sex ?? '').trim().toLowerCase();
  if (sex && /^(l|m|male|laki|laki-laki|pria)$/.test(sex)) return 'laki-laki';
  const age = r.ageYears;
  if (age != null && age < 12) return `berusia ${age} tahun`;
  if (age != null && age > 55) return `berusia ${age} tahun`;
  return null;
}

/** Local translate, so this module stays pure — no React, no store import. */
type T = (id: string, en: string) => string;
const ID: T = (id) => id;

export function searchRegister(
  query: string,
  register: RegisterRecord[],
  filters: SearchFilters = {},
  t: T = ID,
  limit = DEFAULT_LIMIT
): SearchOutcome {
  const q = normaliseName(query);
  if (!q) return { hits: [], more: 0, total: 0 };

  const scored: SearchHit[] = [];

  for (const r of register) {
    // ── Hard filters: chips she tapped ──
    if (filters.onlyPregnant && !r.isPregnant) continue;
    if (filters.onlyRegionId != null && r.regionId !== filters.onlyRegionId) continue;
    if (filters.seenWithinDays != null) {
      const d = daysSince(r.lastSeenAt);
      if (d == null || d > filters.seenWithinDays) continue;
    }

    const nameScore = nameSimilarity(q, r.name);
    if (nameScore < MIN_SCORE) continue;

    const why: string[] = [];
    let score = nameScore;

    // ── Proximity. The strongest signal she never has to type: she is
    //    standing in her own village, and so is the woman in front of her.
    if (filters.homeRegionId != null && r.regionId === filters.homeRegionId) {
      score += 0.30;
      why.push(t('Desa Anda', 'Your village'));
    } else if (r.village) {
      why.push(t(`Luar desa — ${r.village}`, `Outside village — ${r.village}`));
    }

    // ── Recency. Someone seen last month is likelier than someone seen once
    //    a year ago, and it decays rather than cutting off.
    const d = daysSince(r.lastSeenAt);
    if (d != null) {
      if (d <= 30) { score += 0.15; why.push(t('terakhir < 1 bulan', 'seen < 1 month ago')); }
      else if (d <= 90) score += 0.08;
      else if (d > 365) score -= 0.05;
    }

    // ── Flow context. She opened ANC; a pregnant woman is the likelier hit.
    // Demote rather than hide. A midwife does occasionally need to find a
    // child or a husband, and a row that vanishes reads as "not registered"
    // and produces a duplicate.
    if (!ancPlausible(r)) score -= 0.40;

    if (filters.preferPregnant && r.isPregnant) {
      score += 0.12;
      why.push(t('sedang hamil', 'pregnant'));
    }

    // ── An exact normalised name is worth saying out loud.
    if (normaliseName(r.name) === q) why.unshift(t('nama persis', 'exact name'));

    scored.push({ record: r, score, why });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable, and puts the recently-seen first among equals.
    const da = daysSince(a.record.lastSeenAt) ?? Number.MAX_SAFE_INTEGER;
    const db = daysSince(b.record.lastSeenAt) ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  });

  return {
    hits: scored.slice(0, limit),
    more: Math.max(0, scored.length - limit),
    total: scored.length,
  };
}

/** One line of context under a name — the fields that actually separate two
 *  women called Siti, in the order a midwife reads them. */
export function describeRecord(r: RegisterRecord, t: T = ID): string {
  const bits: string[] = [];
  if (r.ageYears != null) bits.push(`${r.ageYears} ${t('th', 'yrs')}`);
  else if (r.ageMonths != null) bits.push(`${r.ageMonths} ${t('bln', 'mo')}`);
  if (r.village) bits.push(r.village);
  if (r.motherName) bits.push(t(`anaknya ${r.motherName}`, `child of ${r.motherName}`));
  // HPL is what the Buku KIA calls it; EDD is what an English speaker expects.
  if (r.isPregnant && r.edd) bits.push(`${t('HPL', 'EDD')} ${r.edd}`);
  if (r.nikLast4) bits.push(`NIK …${r.nikLast4}`);
  return bits.join(' · ');
}

/**
 * What this mother needs, not what she is.
 *
 * A row reading "34 th · ATAMBUA" gives a midwife no reason to tap it. The
 * reason to tap is that K4 is five days late — so the row carries the due
 * state, and the list can lead with whoever is furthest overdue.
 *
 * Derived, never stored: gestational age from EDD against the K-schedule.
 * Returns null when there is nothing to say, which is most rows most days.
 */
export interface DueState {
  label: string;                 // "K4 terlambat 5 hari"
  urgency: 'overdue' | 'due' | 'soon';
}

/** Kemenkes six-contact schedule, as the midpoint week each contact targets. */
const K_SCHEDULE: Array<{ k: string; from: number; to: number }> = [
  { k: 'K1', from: 0,  to: 12 },
  { k: 'K2', from: 13, to: 20 },
  { k: 'K3', from: 21, to: 28 },
  { k: 'K4', from: 29, to: 32 },
  { k: 'K5', from: 33, to: 36 },
  { k: 'K6', from: 37, to: 40 },
];

export function dueState(r: RegisterRecord, t: T = ID): DueState | null {
  if (!r.isPregnant || !r.edd) return null;

  const weeksLeft = (new Date(r.edd).getTime() - Date.now()) / (7 * 86_400_000);
  if (!Number.isFinite(weeksLeft)) return null;
  const gw = Math.round(40 - weeksLeft);
  if (gw <= 0 || gw > 45) return null;

  const band = K_SCHEDULE.find((b) => gw >= b.from && gw <= b.to);
  if (!band) return null;

  // Did a visit already happen inside this band? history is newest-first.
  const done = (r.history ?? []).some(
    (v) => v.kind === 'anc' && (v.visitType ?? '').toUpperCase() === band.k,
  );
  if (done) return null;

  const lateWeeks = gw - band.to;
  if (lateWeeks > 0) {
    const days = lateWeeks * 7;
    return { label: t(`${band.k} terlambat ${days} hari`, `${band.k} ${days} days late`), urgency: 'overdue' };
  }
  const untilEnd = band.to - gw;
  if (untilEnd <= 1) return { label: t(`${band.k} jatuh tempo`, `${band.k} due now`), urgency: 'due' };
  return { label: t(`${band.k} dalam ${untilEnd} minggu`, `${band.k} in ${untilEnd} weeks`), urgency: 'soon' };
}

export function describeLastSeen(r: RegisterRecord, t: T = ID, locale = 'id-ID'): string | null {
  if (!r.lastSeenAt) return null;
  const when = new Date(r.lastSeenAt).toLocaleDateString(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  return r.lastSeenBy
    ? t(`Terakhir ${when} — ${r.lastSeenBy}`, `Last seen ${when} — ${r.lastSeenBy}`)
    : t(`Terakhir ${when}`, `Last seen ${when}`);
}
