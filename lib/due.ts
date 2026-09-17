// lib/due.ts
// What still needs doing for this pregnancy.
//
// VisitHistory answers "what did I find last time and what did I plan".
// This answers the other half: what has still never been done at all.
//
// The distinction matters more than it looks. A midwife reading only the last
// visit can see a normal blood pressure in March and have no way to notice
// that nobody has checked the haemoglobin since booking — and anaemia in
// pregnancy is common, cheap to find and dangerous to miss. Every item below
// is a thing that goes wrong precisely because each visit assumes the last one
// handled it.
//
// WHAT IS DELIBERATELY NOT HERE
// -----------------------------
// USG. The 2024 standard expects two ultrasounds, at K1 and K5, and there is
// no column anywhere that records whether one happened. Prompting for it would
// mean nagging every mother at every visit about something that may well have
// been done — which is how a checklist stops being read. It belongs here the
// day the field exists, and not before.

import type { RegisterRecord } from './offlineStore';

export type DueUrgency = 'overdue' | 'due' | 'soon' | 'info';

export interface DueItem {
  code: string;
  label: string;
  /** Why it is being asked for — the number behind the prompt, where there is one. */
  detail?: string | null;
  urgency: DueUrgency;
}

type T = (id: string, en: string) => string;
const ID: T = (id) => id;

const K_SCHEDULE: Array<{ k: string; from: number; to: number }> = [
  { k: 'K1', from: 0,  to: 12 },
  { k: 'K2', from: 13, to: 20 },
  { k: 'K3', from: 21, to: 28 },
  { k: 'K4', from: 29, to: 32 },
  { k: 'K5', from: 33, to: 36 },
  { k: 'K6', from: 37, to: 40 },
];

/** Weeks of gestation from the EDD, or null if it cannot be worked out. */
export function gestationalWeeks(r: RegisterRecord): number | null {
  if (!r.isPregnant || !r.edd) return null;
  const weeksLeft = (new Date(r.edd).getTime() - Date.now()) / (7 * 86_400_000);
  if (!Number.isFinite(weeksLeft)) return null;
  const gw = Math.round(40 - weeksLeft);
  return gw > 0 && gw <= 45 ? gw : null;
}

/**
 * Everything outstanding, most urgent first.
 *
 * Every item is derived from something already recorded. Nothing here is a
 * guess, and nothing is asserted that the data cannot support — an item is
 * omitted rather than shown as unknown, because a list that cries wolf about
 * things that were probably done is a list she stops reading.
 */
export function dueItems(r: RegisterRecord, t: T = ID): DueItem[] {
  const out: DueItem[] = [];
  const gw = gestationalWeeks(r);
  if (gw == null) return out;

  const p = r.pregnancy ?? null;
  const done = (p?.contactsDone ?? []).map((k) => k.toUpperCase());

  // ── The contact itself ────────────────────────────────────────────────────
  const band = K_SCHEDULE.find((b) => gw >= b.from && gw <= b.to);
  if (band && !done.includes(band.k)) {
    const late = gw - band.to;
    out.push({
      code: band.k,
      label: t(`${band.k} belum dilakukan`, `${band.k} not yet done`),
      detail: t(`Usia kehamilan ${gw} minggu`, `${gw} weeks gestation`),
      urgency: late > 0 ? 'overdue' : 'due',
    });
  }

  // Contacts skipped entirely and now past their window. Named individually
  // rather than as a count, because "K2 terlewat" is actionable and
  // "2 kunjungan terlewat" is only discouraging.
  for (const b of K_SCHEDULE) {
    if (gw > b.to && !done.includes(b.k) && b !== band) {
      out.push({
        code: `${b.k}_missed`,
        label: t(`${b.k} terlewat`, `${b.k} was missed`),
        detail: t(`Jadwalnya minggu ${b.from}–${b.to}`, `Its window was weeks ${b.from}–${b.to}`),
        urgency: 'info',
      });
    }
  }

  // ── Haemoglobin ───────────────────────────────────────────────────────────
  // Expected at booking and again in the third trimester. The "never checked"
  // case is the one worth shouting about.
  if (p) {
    if (p.lastHb == null) {
      out.push({
        code: 'hb',
        label: t('Hb belum pernah diperiksa', 'Haemoglobin never checked'),
        detail: t('Diperlukan pada K1 dan trimester 3', 'Expected at K1 and in the third trimester'),
        urgency: gw >= 12 ? 'overdue' : 'due',
      });
    } else if (p.lastHb < 11) {
      out.push({
        code: 'hb_low',
        label: t('Hb terakhir di bawah 11 — perlu diperiksa ulang',
                 'Last haemoglobin below 11 — needs a recheck'),
        detail: `Hb ${p.lastHb}${p.lastHbDate ? ` · ${p.lastHbDate}` : ''}`,
        urgency: p.lastHb < 8 ? 'overdue' : 'due',
      });
    } else if (gw >= 28 && p.lastHbDate && p.lastHbDate < thirdTrimesterStart(r)) {
      out.push({
        code: 'hb_t3',
        label: t('Hb belum diperiksa di trimester 3', 'Haemoglobin not checked in the third trimester'),
        detail: t(`Terakhir ${p.lastHbDate}`, `Last checked ${p.lastHbDate}`),
        urgency: 'due',
      });
    }

    // ── Tetanus ─────────────────────────────────────────────────────────────
    if (!p.ttStatus) {
      out.push({
        code: 'tt',
        label: t('Status imunisasi TT belum tercatat', 'TT immunisation status not recorded'),
        detail: t('Tanyakan dan catat, walaupun sudah lengkap sebelum hamil',
                  'Ask and record it, even if she completed the course before pregnancy'),
        urgency: 'due',
      });
    }

    // ── Iron ────────────────────────────────────────────────────────────────
    // 90 tablets minimum across the pregnancy. Reported as progress rather
    // than pass/fail, because the shortfall is usually supply, not compliance.
    //
    // "Behind" only from 32 weeks. A daily-rate model would expect all 90 by
    // week 25 and flag a perfectly well-managed pregnancy, because tablets are
    // dispensed about thirty at a visit rather than one a day — so a woman
    // exactly on schedule reaches 90 somewhere around 32 weeks. A prompt that
    // fires on well-run care is a prompt that gets ignored on badly-run care.
    if (p.feTotal < 90) {
      const behind = gw >= 32;
      out.push({
        code: 'fe',
        label: t(`Tablet Fe ${p.feTotal} dari 90`, `Iron tablets ${p.feTotal} of 90`),
        detail: behind
          ? t('Tertinggal dari jadwal', 'Behind schedule')
          : t('Minimal 90 tablet selama kehamilan', 'At least 90 tablets across the pregnancy'),
        urgency: behind ? 'due' : 'info',
      });
    }
  }

  // ── P4K ───────────────────────────────────────────────────────────────────
  // Only from 28 weeks. Asking at booking is how a birth plan becomes a form
  // filled in once and never revisited.
  if (gw >= 28) {
    const bp = r.birthPlan;
    const missing: string[] = [];
    if (!bp?.fasilitas)     missing.push(t('tempat bersalin', 'place of birth'));
    if (!bp?.transportasi)  missing.push(t('transportasi', 'transport'));
    if (!bp?.pendanaan)     missing.push(t('pembiayaan', 'funding'));
    if (!bp?.donorDarah)    missing.push(t('calon donor darah', 'blood donor'));
    if (!bp?.pendamping)    missing.push(t('pendamping', 'birth companion'));
    if (missing.length > 0) {
      out.push({
        code: 'p4k',
        label: t(`P4K belum lengkap — ${missing.length} dari 5`,
                 `Birth plan incomplete — ${missing.length} of 5`),
        detail: missing.join(', '),
        urgency: gw >= 36 ? 'overdue' : 'due',
      });
    }
  }

  const rank: Record<DueUrgency, number> = { overdue: 0, due: 1, soon: 2, info: 3 };
  return out.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}

/** ISO date 12 weeks before the EDD — the start of the third trimester. */
function thirdTrimesterStart(r: RegisterRecord): string {
  const edd = new Date(r.edd!).getTime();
  return new Date(edd - 12 * 7 * 86_400_000).toISOString().slice(0, 10);
}
