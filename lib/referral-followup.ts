// lib/referral-followup.ts
//
// DID SHE GO? The one question that closes the national risti indicator, and
// the only place in either product that can ask it.
//
// WHAT WAS BROKEN. sahai_referrals has carried arrival_confirmed, arrival_time
// and outcome since it was created and NOTHING EVER WROTE THEM — eleven read
// sites across two repositories, zero writers. Measured 21 Oct 2026: 148
// referrals, 4 confirmed. So the funnel reads "detected 8, referred 7, arrived
// 0" and that last figure looks like midwives sending women who never go. It
// is not. Nobody was ever asked.
//
// WHY IT HAS TO BE HER. ReferralPanel in this app states the fact plainly: the
// receiving facility is not on the platform, "which is the normal case today
// and will stay the normal case in most villages". There is no clerk at the
// Puskesmas to tick a box. The midwife learns on follow-up — she sees the woman
// again, or the family tells her — so the question belongs on the next visit
// and nowhere else.
//
// AND IT MUST WORK WITH NO DOK AT ALL. Bidan is sold standalone to CSR and NGO
// buyers who have no clinic product. If confirming an arrival needed DOK, every
// one of those deployments would report arrival 0 for ever. So this lives here,
// in the field app, and DOK's own confirm control is additive rather than the
// mechanism.
//
// THREE ANSWERS, NEVER A BOOLEAN. "Tidak tahu" is the honest and common one —
// a referral made nine days ago to a hospital four hours away, and she has not
// seen the family since. Collapsing it into "did not go" would manufacture a
// non-attendance, which is the same failure as a fabricated finding. So it is
// recorded as unanswered and asked again next time.

/** What the midwife can say about a referral she made. */
export type ArrivalAnswer = 'arrived' | 'did_not_go' | 'declined' | 'unknown';

export interface OpenReferral {
  id: number;
  createdAt: string;
  reason: string | null;
  urgency: string | null;
}

export interface FollowUpQuestion {
  referralId: number;
  /** Days between the referral and the visit now being recorded. */
  daysAgo: number | null;
  reason: string | null;
  urgency: string | null;
}

const DAY_MS = 86_400_000;

/**
 * Should this visit ask about a referral, and which one?
 *
 * NOT ASKED WHEN THE REFERRAL IS FROM TODAY. A woman referred this morning and
 * seen this afternoon has not had time to go anywhere, and asking would invite
 * a "tidak pergi" that means nothing. One day is the floor.
 *
 * NOR WHEN IT IS ANCIENT. Past the cutoff she will not remember, and an answer
 * she is guessing at is worse than no answer — the indicator it feeds is
 * reported to a Dinas. The referral stays open and unanswered, which is the
 * truthful state.
 */
export const ASK_FROM_DAYS = 1;
export const ASK_UNTIL_DAYS = 120;

export function followUpQuestion(
  openReferral: OpenReferral | null | undefined,
  visitDate: string | Date | null | undefined,
): FollowUpQuestion | null {
  if (!openReferral?.id || !openReferral.createdAt) return null;
  const made = new Date(openReferral.createdAt);
  if (Number.isNaN(made.getTime())) return null;

  const now = visitDate ? new Date(visitDate) : new Date();
  if (Number.isNaN(now.getTime())) return null;

  /* Whole days on the calendar, not elapsed hours: a referral made at 23.00
     yesterday and a visit at 07.00 today is one day ago to everyone involved,
     and 8 hours of elapsed time would read as zero. */
  const d0 = Date.UTC(made.getUTCFullYear(), made.getUTCMonth(), made.getUTCDate());
  const d1 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysAgo = Math.round((d1 - d0) / DAY_MS);

  if (daysAgo < ASK_FROM_DAYS) return null;
  if (daysAgo > ASK_UNTIL_DAYS) return null;

  return {
    referralId: openReferral.id,
    daysAgo,
    reason: openReferral.reason ?? null,
    urgency: openReferral.urgency ?? null,
  };
}

/**
 * What the server should write for an answer.
 *
 * RETURNS NULL FOR 'unknown', and that is the point. An unanswered referral
 * must stay open: marking it answered would remove it from the next visit's
 * question and leave a permanent "we asked and nobody knew" where the truth is
 * "ask again in two weeks".
 *
 * THREE COLUMNS, THREE JOBS, and working this out from the live data changed
 * the design. arrival_answered_at says WHETHER somebody answered —
 * arrival_confirmed is NOT NULL and defaults to false, so 144 of 148 rows carry
 * false with nobody having been asked, and the boolean cannot hold a third
 * state. arrival_confirmed says WHAT they answered. And `outcome` is left
 * alone as what it has always been: clinical prose from the receiving facility,
 * "MgSO4 administered, stabilised" on the four answered rows. A status token
 * written there would overload a column clinicians read.
 *
 * SO HER NOTE GOES WHERE A READER EXPECTS IT. On arrival that is `outcome`,
 * because what the hospital found IS the outcome. On non-arrival there is no
 * facility outcome at all, so the reason is a note.
 */
export function arrivalPatch(
  answer: ArrivalAnswer,
  opts: { at?: string | Date | null; referredAt?: string | Date | null; note?: string | null } = {},
): {
  arrival_answered_at: string;
  arrival_confirmed: boolean;
  arrival_time: string | null;
  time_to_arrival_hours: number | null;
  outcome?: string;
  outcome_notes?: string | null;
  declined_at?: string;
  declined_reason?: string | null;
} | null {
  if (answer === 'unknown') return null;

  const note = String(opts.note ?? '').trim() || null;
  const answeredAt = new Date().toISOString();

  if (answer === 'did_not_go' || answer === 'declined') {
    return {
      arrival_answered_at: answeredAt,
      arrival_confirmed: false,
      arrival_time: null,
      time_to_arrival_hours: null,
      outcome_notes: note,
      /* A REFUSAL IS ITS OWN COLUMN, not a flavour of non-arrival.
         Both answers close the arrival question — asking "did she arrive?" at
         the next visit is wrong once she has said no — but only one of them
         records a decision she made. declined_at carries that; a plain
         did_not_go leaves it null, so the two never read alike.
         See sql/j5-referral-declined.sql. */
      ...(answer === 'declined'
        ? { declined_at: answeredAt, declined_reason: note }
        : {}),
    };
  }

  /* SHE ARRIVED. The time is the midwife's best knowledge, which is usually the
     day rather than the hour — so hours-to-arrival is only computed when both
     ends are real, and is never invented from a date alone. */
  const at = opts.at ? new Date(opts.at) : new Date();
  const atIso = Number.isNaN(at.getTime()) ? null : at.toISOString();
  const ref = opts.referredAt ? new Date(opts.referredAt) : null;
  const hours = atIso && ref && !Number.isNaN(ref.getTime())
    ? Math.max(0, Math.round(((at.getTime() - ref.getTime()) / 3_600_000) * 10) / 10)
    : null;

  return {
    arrival_answered_at: answeredAt,
    arrival_confirmed: true,
    arrival_time: atIso,
    time_to_arrival_hours: hours,
    /* Omitted when she wrote nothing, so an empty note cannot blank a prose
       outcome that a clinic had already recorded. */
    ...(note ? { outcome: note } : {}),
  };
}

/** The answers, for a picker. Labels live with the logic they describe. */
export const ARRIVAL_ANSWERS: Array<{ value: ArrivalAnswer; id: string; en: string }> = [
  { value: 'arrived', id: 'Ya, dia pergi', en: 'Yes, she went' },
  { value: 'did_not_go', id: 'Tidak pergi', en: 'She did not go' },
  /* ── SHE SAID NO, AND THAT IS NOT THE SAME AS NOT GOING ─────────────────
     "Tidak pergi" is an absence of information about what happened after she
     left. "Menolak" is a decision she made, in the room. They carry different
     weight for her care and for any count of referrals refused rather than
     lost, and before this the product could only express the first — there was
     no control anywhere to record a refusal (case J-05). */
  { value: 'declined', id: 'Menolak dirujuk', en: 'She declined the referral' },
  { value: 'unknown', id: 'Belum tahu', en: 'Do not know yet' },
];
