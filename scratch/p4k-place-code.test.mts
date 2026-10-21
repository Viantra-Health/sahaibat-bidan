/**
 * The P4K place-of-birth value, which is an ENGINE INTERFACE and not a label.
 *
 * generateClinicalFlags warns when a home birth is planned on a high-risk
 * pregnancy, and it tests `birthPlan.fasilitas.includes('rumah')`. The Select
 * used to store its own labels, so the value was 'Rumah' with a capital R and
 * the warning could never fire for anybody. Lowercasing would have been worse:
 * 'rumah sakit' contains 'rumah', so every HOSPITAL birth would have raised a
 * home-birth warning.
 *
 * These tests assert against the engine's real rule, not against a copy of it.
 */
import { placeCode } from '../components/AncForm.tsx'
import { generateClinicalFlags } from '@sahaibat/anc-engine'

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${l}`) } else { fail++; console.log(`  FAIL  ${l} ${d}`) } }

/** A pregnancy the engine already considers risky, so the home-birth rule can fire. */
const risky = (fasilitas: string | null) => generateClinicalFlags({
  gestationalWeeks: 34,
  bpSystolic: 160, bpDiastolic: 110,     // severe hypertension -> a WARNING/EMERGENCY
  birthPlan: fasilitas === null ? null : {
    fasilitas, transportasi: 'ambulans', donorDarah: null, pendanaan: 'bpjs',
    pendamping: 'suami', catatan: null,
  },
} as any).map((f: any) => f.type)

/* ── THE RULE FIRES FOR A HOME BIRTH ──────────────────────────────────── */
ok("the engine warns on a home birth at risk", risky('rumah').includes('HOME_DELIVERY_HIGH_RISK'))
// THE BUG: the old stored label.
ok("'Rumah' (the old stored label) does NOT fire it",
  !risky('Rumah').includes('HOME_DELIVERY_HIGH_RISK'))
ok('…so placeCode turns it into one that does',
  risky(placeCode('Rumah')).includes('HOME_DELIVERY_HIGH_RISK'))

/* ── AND IT MUST NOT FIRE FOR A HOSPITAL ──────────────────────────────── */
// The trap in the other direction: 'rumah sakit' contains 'rumah'.
ok("'rumah sakit' WOULD wrongly fire the home-birth rule",
  risky('rumah sakit').includes('HOME_DELIVERY_HIGH_RISK'))
ok('…and placeCode maps it to rs, which does not',
  !risky(placeCode('Rumah sakit')).includes('HOME_DELIVERY_HIGH_RISK'))
ok('…because hospital is tested before home', placeCode('Rumah sakit') === 'rs')
ok('…including the shorthands', placeCode('RSUD') === 'rs' && placeCode('rsia') === 'rs')

/* ── EVERY LEGACY LABEL MAPS ──────────────────────────────────────────── */
for (const [label, code] of [
  ['Puskesmas', 'puskesmas'], ['Poskesdes', 'poskesdes'], ['Polindes', 'polindes'],
  ['Klinik', 'klinik'], ['Bidan praktik', 'pmb'], ['Rumah', 'rumah'],
] as const) {
  ok(`'${label}' -> ${code}`, placeCode(label) === code)
}

/* ── A CODE PASSES THROUGH UNCHANGED ──────────────────────────────────── */
for (const c of ['rs', 'puskesmas', 'poskesdes', 'polindes', 'klinik', 'pmb', 'rumah', 'perjalanan', 'lainnya']) {
  ok(`${c} is already a code`, placeCode(c) === c)
}
ok('case and padding do not defeat a code', placeCode('  RUMAH  ') === 'rumah')

/* ── NOTHING IS DROPPED ───────────────────────────────────────────────── */
// An unrecognised value will not match an option, which is VISIBLE. Blanking it
// would destroy what she recorded.
ok('an unknown value is returned unchanged', placeCode('Rumah Bersalin Ibu Kita') === 'rumah',
  placeCode('Rumah Bersalin Ibu Kita'))
ok('a value matching nothing at all survives', placeCode('xyz') === 'xyz')
for (const blank of ['', '   ', null, undefined]) {
  ok(`${JSON.stringify(blank)} is empty, not a guess`, placeCode(blank as any) === '')
}

/* ── NO PLAN AT ALL IS ITS OWN FLAG, AND MUST STAY SO ─────────────────── */
// birthPlanOf returns null when nothing is filled, which is what lets
// NO_BIRTH_PLAN fire. An object of nulls would silently suppress it.
ok('no birth plan at 34 weeks raises NO_BIRTH_PLAN', risky(null).includes('NO_BIRTH_PLAN'))
ok('…and a plan with a place does not', !risky('rumah').includes('NO_BIRTH_PLAN'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
