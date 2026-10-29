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
import { daysBetween, todayLocal, formatStoredDate } from './plausibility';

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
  /** One of the four care flows, from careFlow(). Null means all of them. */
  onlyFlow?: CareFlow | null;
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

  /* ── A CHIP ON ITS OWN IS A QUESTION, AND IT DESERVES AN ANSWER ───────────
     An empty query used to return nothing at all, so tapping "Bayi" and
     expecting the babies produced an empty screen until a name was typed. The
     chips are the four reasons she opens this register -- "show me the babies
     I owe a visit to" is the whole point of one -- and answering it with
     nothing reads as a broken filter.

     A bare empty query with NO filter still returns nothing, deliberately:
     that is the resting state of the screen, and dumping forty rows under the
     search box is not a search result. */
  const filtering = !!(filters.onlyFlow || filters.onlyRegionId || filters.seenWithinDays);
  if (!q && !filtering) return { hits: [], more: 0, total: 0 };

  if (!q && filtering) {
    const all: SearchHit[] = [];
    for (const r of register) {
      if (filters.onlyFlow) {
        const f = careFlow(r);
        const match = filters.onlyFlow === 'anc'
          ? (f === 'anc' || f === 'persalinan')
          : f === filters.onlyFlow;
        if (!match) continue;
      }
      if (filters.onlyRegionId != null && r.regionId !== filters.onlyRegionId) continue;
      if (filters.seenWithinDays != null) {
        const d = daysSince(r.lastSeenAt);
        if (d == null || d > filters.seenWithinDays) continue;
      }
      all.push({ record: r, score: 0, why: [] });
    }
    all.sort((a, b) => a.record.name.localeCompare(b.record.name));
    return { hits: all.slice(0, limit), more: Math.max(0, all.length - limit), total: all.length };
  }

  const scored: SearchHit[] = [];

  for (const r of register) {
    // ── Hard filters: chips she tapped ──
    if (filters.onlyPregnant && !r.isPregnant) continue;
    /* A hard filter, like the others: she tapped it. Antenatal deliberately
       includes the near-term mothers -- they are still antenatal, and a chip
       that hides them from the antenatal list would be wrong. */
    if (filters.onlyFlow) {
      const f = careFlow(r);
      const match = filters.onlyFlow === 'anc'
        ? (f === 'anc' || f === 'persalinan')
        : f === filters.onlyFlow;
      if (!match) continue;
    }
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
      why.push(t('Wilayah Anda', 'Your area'));
    } else if (r.village) {
      why.push(t(`Luar wilayah — ${r.village}`, `Outside your area — ${r.village}`));
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
  /* ── A BABY IS NOT "0 th" ──────────────────────────────────────────────
     Years win over months, which is right for everyone except the people
     this app sees most. A newborn pushed from the clinic carries
     age_years = 0 (the push door computes it from the date of birth), and a
     newborn a midwife registered carries age_years null with the months — so
     two babies the same age sat in one search result reading "0 th" and
     "0 bln". Zero years is not an age, it is the absence of one, and the
     months beside it are the real answer. */
  if (r.ageYears != null && r.ageYears > 0) bits.push(`${r.ageYears} ${t('th', 'yrs')}`);
  else if (r.ageMonths != null) bits.push(`${r.ageMonths} ${t('bln', 'mo')}`);
  else if (r.ageYears != null) bits.push(`${r.ageYears} ${t('th', 'yrs')}`);
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
  /* 'done' is not an alarm and deliberately not 'soon': the row should say
     the schedule is finished rather than go blank, which reads as missing
     data. The rail falls through to its default colour for it. */
  urgency: 'overdue' | 'due' | 'soon' | 'done';
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
  // Same trap as the visit history: a date-only lastSeenAt is a calendar date,
  // and converting it from UTC midnight shows the previous day west of UTC.
  const when = formatStoredDate(r.lastSeenAt, locale);
  return r.lastSeenBy
    ? t(`Terakhir ${when} — ${r.lastSeenBy}`, `Last seen ${when} — ${r.lastSeenBy}`)
    : t(`Terakhir ${when}`, `Last seen ${when}`);
}


/**
 * How old this member is in days, when she is young enough for the newborn
 * flow to be the right one to offer.
 *
 * Returns null for anyone else, which is what the row uses to decide whether
 * tapping opens an antenatal form or a newborn one. Getting this wrong in the
 * other direction is what the delivery record created: a baby registered on
 * the day she was born, appearing in the register, and opening an ANC form.
 *
 * The window runs to 60 days rather than 28 ON PURPOSE. The neonatal period
 * ends at 28 and the kader takes over, but that handover is where babies are
 * lost — the midwife stops and the kader has not started. Nothing here is
 * revoked on day 29: a late KN3 is still recorded, still counted, and still
 * better than no contact at all.
 */
/**
 * Which of the four care flows this person is in, right now.
 *
 * WHY THIS IS ONE FUNCTION AND NOT A CHIP PREDICATE
 *
 * The register filters offered one flow -- "Hamil" -- so a midwife looking for
 * the babies she owes a KN visit, or the mothers in their puerperium, had to
 * read all 38 rows. That has failed the same test three rounds running.
 *
 * The row buttons already decided this, inline, in the page. Writing a second
 * copy for the chips is how a filter comes to disagree with the row it filtered
 * -- a "Nifas" chip that lists a woman whose row offers her an antenatal visit.
 * So both read this.
 *
 *   kn           she IS a baby, inside the newborn window
 *   persalinan   pregnant and near term; the birth is the next thing to record
 *   anc          pregnant, with the pregnancy still the point
 *   nifas        a woman who is not pregnant and not a child
 *   null         in none of them -- a child past the newborn window, a man
 *
 * `persalinan` is deliberately a subset of pregnancy rather than a separate
 * state: nothing in the register says a labour has started, and twelve weeks
 * to term is the same threshold the row uses to decide which action leads.
 *
 * NIFAS IS DELIBERATELY WIDER THAN THE PUERPERIUM. The precise rule would be
 * "delivered within 42 days", and the register does carry deliveries -- but
 * `history` keeps only the last few visits, so a mother who has since had
 * three postnatal contacts no longer shows the birth that put her there, and
 * she would vanish from the list of mothers owed a postnatal visit. For a
 * FILTER, listing a few women who do not need one is harmless; hiding one who
 * does is not. So the only thing excluded is who it cannot be.
 */
export type CareFlow = 'anc' | 'persalinan' | 'nifas' | 'kn';

export function careFlow(r: RegisterRecord): CareFlow | null {
  if (newbornDayOfLife(r) != null) return 'kn';
  if (r.isPregnant) {
    const weeksLeft = r.edd
      ? (Date.parse(`${String(r.edd).slice(0, 10)}T00:00:00Z`) - Date.parse(`${todayLocal()}T00:00:00Z`))
        / (7 * 86_400_000)
      : null;
    return weeksLeft != null && weeksLeft <= 12 ? 'persalinan' : 'anc';
  }
  /* A three-month-old is in no flow at all. Without this the postnatal filter
     listed every infant in the village, because "not pregnant and not a
     newborn" was being read as "a mother". Age is only used to rule out: a
     record with no age recorded is kept, since the cost of dropping a mother
     from this list is worse than the cost of one extra row. */
  const isChild = (r.role ?? '') === 'anak' || (r.ageYears != null && r.ageYears < 10);
  return isChild ? null : 'nifas';
}

export function newbornDayOfLife(r: RegisterRecord): number | null {
  if (!r.dob) return null;
  if ((r.role ?? '') !== 'anak') return null;
  // Calendar days in the device's own calendar. Subtracting two INSTANTS, with
  // a date string parsing at UTC midnight, made a baby born on the 10th read
  // as 2 days old late on the 11th -- and day of life decides which KN visit
  // is due and which jaundice rule applies. Same fault, second place.
  const days = daysBetween(r.dob);
  if (days == null || days < 0 || days > 60) return null;
  return days;
}

/**
 * Which newborn visit is due, if any.
 *
 * It now checks what has already been done. The register carries newborn
 * visits as of the same change, so this reports the GAP rather than the
 * window: a baby seen today is no longer asked for the visit she just had.
 */
export function knDueState(r: RegisterRecord, t: T = ID): DueState | null {
  const days = newbornDayOfLife(r);
  if (days == null) return null;

  /* ── WHAT HAS ALREADY BEEN DONE ───────────────────────────────────────────
     This read the baby's AGE and nothing else, so it asked for KN1 for the
     first two days of life however many KN1 visits had been recorded. Testing
     found a baby with two uploaded KN1 visits, one of them an emergency
     referral, whose row still said KN1 JATUH TEMPO.

     Half of that was the register never carrying newborn visits at all; this
     is the other half. A visit that has been done is not due. */
  const done = new Set(
    (r.history ?? [])
      .filter((h) => h.kind === 'kn' && h.visitType)
      .map((h) => String(h.visitType).toUpperCase()),
  );
  const nextDue = (['KN1', 'KN2', 'KN3'] as const).find((k) => !done.has(k));

  if (!nextDue) {
    return { label: t('KN1–KN3 selesai', 'KN1–KN3 complete'), urgency: 'done' };
  }

  /* The window is still the baby's age; what changed is that a window whose
     visit is already recorded no longer asks for it. A KN2 recorded early
     still leaves KN1 outstanding and this will say so. */
  if (days <= 2)  return { label: t(`${nextDue} jatuh tempo`, `${nextDue} due now`), urgency: 'due' };
  if (days <= 7)  return { label: t(`${nextDue} jatuh tempo`, `${nextDue} due now`), urgency: 'due' };
  if (days <= 28) return { label: t(`${nextDue} jatuh tempo`, `${nextDue} due now`), urgency: 'due' };
  return {
    label: t(`Neonatal lewat ${days - 28} hari`, `${days - 28} days past neonatal`),
    urgency: 'overdue',
  };
}
