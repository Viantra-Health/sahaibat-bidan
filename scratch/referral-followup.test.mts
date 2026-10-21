/* lib/referral-followup.ts — the question that closes the risti funnel.
 *   npx tsx scratch/referral-followup.test.mts
 */
import { followUpQuestion, arrivalPatch, ARRIVAL_ANSWERS, ASK_FROM_DAYS, ASK_UNTIL_DAYS } from '../lib/referral-followup.ts'

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${l}`) } else { fail++; console.log(`  FAIL  ${l}${d ? ' — ' + d : ''}`) } }

const ref = (daysAgo: number) => ({
  id: 7, createdAt: new Date(Date.UTC(2026, 9, 21 - daysAgo, 9, 0)).toISOString(),
  reason: 'Hipertensi dalam kehamilan', urgency: 'urgent',
})
const VISIT = new Date(Date.UTC(2026, 9, 21, 9, 0))

/* ── when the question is asked ───────────────────────────────────────── */
ok('a referral from today is not asked about — she has not had time to go',
  followUpQuestion(ref(0), VISIT) === null)
ok('one day later it is asked', followUpQuestion(ref(1), VISIT)?.daysAgo === 1)
ok('nine days later it is asked', followUpQuestion(ref(9), VISIT)?.daysAgo === 9)
ok('past the cutoff it is not asked — a guessed answer feeds a Dinas report',
  followUpQuestion(ref(ASK_UNTIL_DAYS + 1), VISIT) === null)
ok('exactly at the cutoff it is still asked',
  followUpQuestion(ref(ASK_UNTIL_DAYS), VISIT) !== null)
ok('no open referral means no question', followUpQuestion(null, VISIT) === null)
ok('a referral with no id is not a referral',
  followUpQuestion({ id: 0, createdAt: VISIT.toISOString(), reason: null, urgency: null } as any, VISIT) === null)
ok('an unparseable date asks nothing rather than throwing',
  followUpQuestion({ id: 3, createdAt: 'yesterday', reason: null, urgency: null }, VISIT) === null)
/* WHOLE DAYS, NOT ELAPSED HOURS. 23.00 yesterday to 07.00 today is one day to
   everyone involved; 8 hours of elapsed time would round to zero and the
   question would never be asked. */
ok('23.00 yesterday to 07.00 today counts as one day',
  followUpQuestion(
    { id: 1, createdAt: new Date(Date.UTC(2026, 9, 20, 23, 0)).toISOString(), reason: null, urgency: null },
    new Date(Date.UTC(2026, 9, 21, 7, 0)),
  )?.daysAgo === 1)
ok('the reason travels, so she knows which referral is meant',
  followUpQuestion(ref(5), VISIT)?.reason === 'Hipertensi dalam kehamilan')

/* ── 'unknown' MUST NOT CLOSE THE REFERRAL ────────────────────────────── */
ok('do-not-know writes nothing at all', arrivalPatch('unknown') === null)
ok('…which is what keeps it open for the next visit', arrivalPatch('unknown') === null)

/* ── she arrived ──────────────────────────────────────────────────────── */
const went = arrivalPatch('arrived', {
  at: new Date(Date.UTC(2026, 9, 14, 15, 0)),
  referredAt: new Date(Date.UTC(2026, 9, 14, 9, 0)),
  note: 'MgSO4 diberikan, stabil',
})!
ok('arrived sets the boolean', went.arrival_confirmed === true)
/* THE MARKER IS ITS OWN COLUMN. arrival_confirmed is NOT NULL and defaults to
   false — 144 of 148 production rows carry false with nobody having answered —
   so the boolean cannot say whether anyone was asked. */
ok('…and stamps WHEN somebody answered, which the boolean cannot say',
  typeof went.arrival_answered_at === 'string' && went.arrival_answered_at.length > 10)
ok('…and the hours between, 9am to 3pm is 6', went.time_to_arrival_hours === 6)
/* HER NOTE GOES TO `outcome` ON ARRIVAL, because what the hospital found IS the
   outcome — that is what the four pre-existing rows hold. */
ok('her note lands in outcome, where a clinician reads it',
  went.outcome === 'MgSO4 diberikan, stabil')
ok('…and NOT in outcome_notes', went.outcome_notes === undefined)
/* AN EMPTY NOTE MUST NOT BLANK A PROSE OUTCOME the clinic already recorded. */
const quiet = arrivalPatch('arrived', { at: new Date(Date.UTC(2026, 9, 14, 15, 0)) })!
ok('no note means outcome is left untouched, not set to empty',
  !('outcome' in quiet))
ok('hours are NOT invented when the referral time is unknown',
  quiet.time_to_arrival_hours === null)
ok('…but the arrival time is still recorded', !!quiet.arrival_time)

/* ── she did not go ───────────────────────────────────────────────────── */
const no = arrivalPatch('did_not_go', { note: 'Keluarga menolak' })!
ok('did-not-go leaves the boolean false', no.arrival_confirmed === false)
ok('…and is told apart from the default ONLY by the marker',
  no.arrival_confirmed === false && typeof no.arrival_answered_at === 'string')
ok('…records no arrival time', no.arrival_time === null && no.time_to_arrival_hours === null)
/* ON NON-ARRIVAL THERE IS NO FACILITY OUTCOME AT ALL, so the reason is a note
   and `outcome` is never written. */
ok('the reason lands in outcome_notes', no.outcome_notes === 'Keluarga menolak')
ok('…and outcome is never touched, because nothing happened at a facility',
  !('outcome' in no))
ok('an empty note is null, not an empty string',
  arrivalPatch('did_not_go', { note: '   ' })!.outcome_notes === null)

/* ── the picker ───────────────────────────────────────────────────────── */
ok('three answers, never two', ARRIVAL_ANSWERS.length === 3)
ok('each is bilingual', ARRIVAL_ANSWERS.every(a => !!a.id && !!a.en))
ok('every answer the picker offers is one arrivalPatch understands',
  ARRIVAL_ANSWERS.every(a => a.value === 'unknown' ? arrivalPatch(a.value) === null : !!arrivalPatch(a.value)))
ok('ASK_FROM_DAYS is at least one day', ASK_FROM_DAYS >= 1)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
