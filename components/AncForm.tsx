'use client';

// components/AncForm.tsx
// The 10T antenatal record, as a form rather than one dense WhatsApp line.
//
// WHY THIS SHAPE. On WhatsApp a midwife types ~30 fields into a single message
// and finds out at the end what was parsed, what was missed, and whether
// anything was dangerous. Two things change here, and they are the whole
// argument for the app:
//
//   1. A field is either filled or explicitly empty. Nothing is silently
//      dropped by a regex, so the 10T score means what it says.
//   2. Scoring and flagging run on every keystroke, offline, via
//      @sahaibat/anc-engine — the same rules the WhatsApp path uses. She sees
//      PRE-EKLAMPSIA the moment she enters the blood pressure, not after
//      submitting.

import { useState, useMemo } from 'react';
import { score10T, generateClinicalFlags, shouldRefer, calculateBMI } from '@sahaibat/anc-engine';
import type { AncVisitData } from '@sahaibat/anc-engine';
import SkipReasons, { type SkipReasonMap } from './SkipReasons';
import PlanPanel, { EMPTY_PLAN, lineText, type PlanState } from './PlanPanel';
import { suggestCarePlan, planToFields, type PlanItem } from '@sahaibat/anc-engine';
import { C, ghostBtn, Section, Row, Hint, Field, Select, Tri } from './ui';
import { useLang, flagMessage } from '@/lib/lang';
import ReferralFollowUp from './ReferralFollowUp';
import { followUpQuestion, type OpenReferral, type ArrivalAnswer } from '@/lib/referral-followup';
import { checkAnc } from '@/lib/plausibility';
import ConfirmWarnings from '@/components/ConfirmWarnings';

export interface AncFormValues {
  /* ── A REFUSAL SHE MADE, NOT AN ABSENCE OF INFORMATION ─────────────────
     null means she did not refuse — never that she accepted. Shown only when
     a referral is actually indicated. See sql/j5-referral-declined.sql. */
  referralDeclined: boolean | null;
  referralDeclineReason: string;
  /* ── THE REFERRAL SHE MADE, ANSWERED ─────────────────────────────────────
     Not a clinical finding of today's visit — the answer to a question about a
     referral days old. Empty means unanswered, which keeps the referral open
     and asks again next time. See lib/referral-followup.ts. */
  /* The vocabulary itself, not a copy of it. Written out by hand here, this
     union silently stopped matching ArrivalAnswer the moment 'declined' was
     added to it — and a union restated in two files always eventually does. */
  referralAnswer: '' | ArrivalAnswer;
  referralNote: string;
  visitType: string;
  gestationalWeeks: string;
  weightKg: string; heightCm: string;
  bpSystolic: string; bpDiastolic: string;
  fundalHeightCm: string; lilaCm: string; djjBpm: string;
  bloodType: string; ttStatus: string; feTablets: string;
  labHb: string; labProtein: string;
  hivStatus: string; syphilisStatus: string; hbsagStatus: string;
  bloodSugarMg: string; malariaRdt: string;
  /* A vital sign, NOT one of the ten -- it must never move the 10T
     denominator. The engine has a test pinning exactly that. */
  temperatureC: string;
  /** Tri-state. null means she was not asked, which is not the same as no. */
  feverLast48h: boolean | null;
  counselling: string; presentation: string;
  caseManagement: string; followupPlan: string; complaints: string;
  // P4K — Perencanaan Persalinan dan Pencegahan Komplikasi. The engine has
  // parsed these from WhatsApp all along and nothing has ever displayed them.
  p4kFasilitas: string; p4kTransportasi: string; p4kDonorDarah: string;
  p4kPendanaan: string; p4kPendamping: string;
}

export const EMPTY_FORM: AncFormValues = {
  referralAnswer: '', referralNote: '',
  referralDeclined: null, referralDeclineReason: '',
  visitType: 'K1', gestationalWeeks: '',
  weightKg: '', heightCm: '', bpSystolic: '', bpDiastolic: '',
  fundalHeightCm: '', lilaCm: '', djjBpm: '',
  bloodType: '', ttStatus: '', feTablets: '',
  labHb: '', labProtein: '', hivStatus: '', syphilisStatus: '', hbsagStatus: '',
  bloodSugarMg: '', malariaRdt: '',
  temperatureC: '', feverLast48h: null,
  counselling: '', presentation: '',
  caseManagement: '', followupPlan: '', complaints: '',
  p4kFasilitas: '', p4kTransportasi: '', p4kDonorDarah: '',
  p4kPendanaan: '', p4kPendamping: '',
};

// Indonesian keyboards produce a comma. parseFloat('23,5') is 23, and 23 is
// below the 23.5 cm KEK threshold — so the form would diagnose chronic energy
// deficiency on a mother who does not have it. The exact bug fixed in the
// engine and in the other two forms, still live in the most-used one.
const num = (s: string): number | null => {
  const v = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

/** Form strings → the engine's typed inputs. One place, so the live preview and
 *  the saved record can never diverge. */
export function toEngineInputs(v: AncFormValues, motherAge: number | null) {
  const gw = num(v.gestationalWeeks) ?? 0;
  const bmi = calculateBMI(num(v.weightKg), num(v.heightCm));

  /* THE STANDARD'S NUMBERING, as of 20 Oct 2026. These keys used to run t1..t10
     in the engine's own sequence and six of them named the wrong activity, so a
     dashboard printing "T3" meant fundal height where the standard means nilai
     status gizi. See the header of score10T.ts in @sahaibat/anc-engine.

     TYPED, not cast. This object reached score10T through `as any`, which is
     why TypeScript had nothing to say when the engine was renumbered — six
     fields would have gone silently undefined and every visit would have
     scored as missing fundal height, tetanus, Fe, lab, counselling and
     presentation. The annotation is what makes the next rename a compile error
     instead of a quiet collapse in the score. */
  const visit: AncVisitData = {
    gestationalWeeks: gw,
    t1WeightKg: num(v.weightKg),
    t2BpSystolic: num(v.bpSystolic),
    t2BpDiastolic: num(v.bpDiastolic),
    // T3 — nilai status gizi. NEW to the score, and the measurement was already
    // on this form; only the scoring was blind to it.
    t3LilaCm: num(v.lilaCm),
    t4FundalHeightCm: num(v.fundalHeightCm),
    t5Presentation: v.presentation || null,
    t5DjjBpm: num(v.djjBpm),
    t6TtStatus: v.ttStatus || null,
    t7FeTablets: num(v.feTablets),
    t8LabHb: num(v.labHb),
    t8LabProtein: v.labProtein || null,
    t8LabOther: null,
    t9CaseManagement: v.caseManagement || null,
    t10CounsellingTopics: v.counselling ? v.counselling.split(',').map(s => s.trim()).filter(Boolean) : null,
    // Not one of the ten and no longer scored. Still recorded.
    followupPlan: v.followupPlan || null,
    /* Whether T3 is EXPECTED. The form knows which contact this is, and the
       standard assesses nutritional status at the first one — expecting LILA
       again at K4 would mark down a clinic doing exactly the right thing. */
    isFirstContact: String(v.visitType ?? '').toUpperCase() === 'K1',
  };

  const clinical = {
    gestationalWeeks: gw,
    motherAge,
    bpSystolic: num(v.bpSystolic),
    bpDiastolic: num(v.bpDiastolic),
    labHb: num(v.labHb),
    labProtein: v.labProtein || null,
    fundalHeightCm: num(v.fundalHeightCm),
    presentation: v.presentation || null,
    complaints: v.complaints || null,
    weightKg: num(v.weightKg),
    lilaCm: num(v.lilaCm),
    djjBpm: num(v.djjBpm),
    bmi: bmi.bmi,
    bmiCategory: bmi.category,
    hivStatus: v.hivStatus || null,
    syphilisStatus: v.syphilisStatus || null,
    hbsagStatus: v.hbsagStatus || null,
    bloodSugarMg: num(v.bloodSugarMg),
    malariaRdt: v.malariaRdt || null,
    // Blank stays blank. A missing temperature is not 36.5, and a midwife with
    // no thermometer must not be read as having found no fever.
    temperatureC: num(v.temperatureC),
    feverLast48h: v.feverLast48h,
    usgResults: null,
    // Null when she has filled nothing — the rules distinguish "no plan yet"
    // from "a plan missing its transport", and collapsing that into an object
    // of nulls would silence NO_BIRTH_PLAN entirely.
    birthPlan: birthPlanOf(v),
  };

  return { visit, clinical, bmi };
}

/**
 * A stored place-of-birth value as the engine's code.
 *
 * WHY THIS IS NOT JUST A CAST. The Select used to store its own labels, so a
 * plan saved before that was fixed holds 'Rumah' or 'Rumah sakit' rather than
 * 'rumah' or 'rs'. Carried forward unchanged into the corrected Select, such a
 * value matches no option and the field silently shows blank -- a birth plan
 * the midwife completed last month reading as unarranged.
 *
 * ORDER MATTERS HERE. 'rumah sakit' CONTAINS 'rumah', so the hospital label has
 * to be tested FIRST or every hospital plan becomes a home birth -- which is
 * also the exact bug the engine's own rule had with the old labels.
 *
 * An unrecognised value is returned UNCHANGED rather than blanked: it will not
 * match an option, which is visible, and blanking it would destroy what she
 * recorded. Never dropped.
 */
export function placeCode(stored: string | null | undefined): string {
  const raw = String(stored ?? '').trim()
  if (!raw) return ''
  const s = raw.toLowerCase()
  const CODES = ['rs', 'puskesmas', 'poskesdes', 'polindes', 'klinik', 'pmb', 'rumah', 'perjalanan', 'lainnya']
  if (CODES.includes(s)) return s
  // Hospital before home, for the reason above.
  if (s.includes('rumah sakit') || s === 'rsud' || s === 'rsia') return 'rs'
  if (s.includes('puskesmas')) return 'puskesmas'
  if (s.includes('poskesdes')) return 'poskesdes'
  if (s.includes('polindes')) return 'polindes'
  if (s.includes('bidan')) return 'pmb'
  if (s.includes('klinik')) return 'klinik'
  if (s.includes('rumah')) return 'rumah'
  if (s.includes('perjalanan')) return 'perjalanan'
  return raw
}

/** P4K, or null when nothing has been arranged yet. */
export function birthPlanOf(v: AncFormValues) {
  const plan = {
    fasilitas: v.p4kFasilitas || null,
    transportasi: v.p4kTransportasi || null,
    donorDarah: v.p4kDonorDarah || null,
    pendanaan: v.p4kPendanaan || null,
    pendamping: v.p4kPendamping || null,
    catatan: null as string | null,
  };
  return Object.values(plan).some(Boolean) ? plan : null;
}

/** What is still unarranged, for the checklist. */
export function p4kMissing(v: AncFormValues, t: (id: string, en: string) => string): string[] {
  const missing: string[] = [];
  if (!v.p4kFasilitas) missing.push(t('tempat bersalin', 'place of birth'));
  if (!v.p4kTransportasi) missing.push(t('transportasi', 'transport'));
  if (!v.p4kPendanaan) missing.push(t('pembiayaan', 'funding'));
  if (!v.p4kDonorDarah) missing.push(t('calon donor darah', 'blood donor'));
  if (!v.p4kPendamping) missing.push(t('pendamping', 'birth companion'));
  return missing;
}

/** The 10T standards by name. `belum: t1, t2, t4, t5…` is the app talking to
 *  itself; a midwife is trained on Timbang, Tekanan Darah, Tinggi Fundus. */
const T_NAME: Record<string, [string, string]> = {
  t1:  ['Timbang', 'Weight'],
  t2:  ['Tekanan darah', 'Blood pressure'],
  t3:  ['Tinggi fundus', 'Fundal height'],
  t4:  ['Imunisasi TT', 'TT immunisation'],
  t5:  ['Tablet Fe', 'Iron tablets'],
  t6:  ['Laboratorium', 'Laboratory'],
  t7:  ['Temu wicara', 'Counselling'],
  t8:  ['Presentasi janin', 'Fetal presentation'],
  t9:  ['Tatalaksana', 'Management'],
  t10: ['Tindak lanjut', 'Follow-up'],
};

interface Props {
  motherName: string;
  /**
   * A referral she made that nobody has closed, from the cached register.
   *
   * Optional, so a caller that does not have one — a new mother with no
   * history — renders no question rather than an empty panel.
   */
  openReferral?: OpenReferral | null;
  motherAge: number | null;
  subtitle?: string | null;
  values: AncFormValues;
  onChange: (v: AncFormValues) => void;
  /**
   * Called with everything the form decided, not just the raw fields:
   *
   *   values      the form values with the accepted plan already merged into
   *               T9 and T10 — what should actually be recorded
   *   plan        which lines she accepted, declined and edited, kept
   *               separately because "she considered the referral and said no"
   *               is a clinical decision worth having in the record
   *   skipReasons why an expected 10T standard was not done, where she said
   */
  onSave: (payload?: {
    values?: AncFormValues;
    plan?: PlanState;
    skipReasons?: SkipReasonMap;
  }) => void;
  saving?: boolean;
}

export default function AncForm({ motherName, motherAge, subtitle, values, onChange, onSave, saving, openReferral }: Props) {
  const { t, lang } = useLang();
  const [showLabs, setShowLabs] = useState(false);
  const [askingWhy, setAskingWhy] = useState(false);
  /* Numbers that cannot be true now take a confirming tap. Three rounds of
     testing walked straight past the printed warning and saved 900/600 with a
     weight of 0 -- see components/ConfirmWarnings.tsx for why this confirms
     rather than blocks. */
  const [askingValues, setAskingValues] = useState(false);
  const [plan, setPlan] = useState<PlanState>(EMPTY_PLAN);
  const [skipReasons, setSkipReasons] = useState<SkipReasonMap>({});
  /* Generic, like PncForm's. It was string-only, so a tri-state field could
     not be wired to it at all -- the setter it handed back only accepted a
     string and `null` was not assignable. */
  const set = <K extends keyof AncFormValues>(k: K) => (val: AncFormValues[K]) =>
    onChange({ ...values, [k]: val });

  const gw = num(values.gestationalWeeks) ?? 0;

  // Recomputed as she types, like the clinical flags beside it.
  const implausible = useMemo(() => checkAnc({
    weightKg: values.weightKg, bpSystolic: values.bpSystolic,
    bpDiastolic: values.bpDiastolic, gestationalWeeks: values.gestationalWeeks,
    lilaCm: values.lilaCm, labHb: values.labHb, temperatureC: values.temperatureC,
  }), [values.weightKg, values.bpSystolic, values.bpDiastolic,
       values.gestationalWeeks, values.lilaCm, values.labHb, values.temperatureC]);

  // Findings first. These depend only on the measurements, never on the plan,
  // which is what keeps the chain below acyclic.
  const { flags, referral, bmi } = useMemo(() => {
    const { clinical, bmi } = toEngineInputs(values, motherAge);
    const flags = generateClinicalFlags(clinical as any);
    return { flags, referral: shouldRefer(flags), bmi };
  }, [values, motherAge]);

  // The suggested plan follows from the findings, so it recomputes with them.
  // Due codes are passed as the empty list here: the ANC form does not hold a
  // register record, and inventing them would let the plan and the what's-due
  // panel disagree on screen, which is worse than the plan being shorter.
  const planItems: PlanItem[] = useMemo(
    () => suggestCarePlan({ flags, gestationalWeeks: gw, due: [] }),
    [flags, gw],
  );

  /**
   * What she actually signed off, as the two fields the record already has.
   *
   * Her own typed text wins position: the plan is appended to whatever she
   * wrote, never the other way round, so a sentence she composed herself is
   * never buried under six suggestions.
   */
  const composed = useMemo(() => {
    const accepted = planItems
      .filter((p) => plan.accepted.includes(p.code))
      .map((p) => ({ ...p, action_id: lineText(p, plan, 'id'), action_en: lineText(p, plan, 'en') }));
    const { t9, t10 } = planToFields(accepted, lang === 'en' ? 'en' : 'id');
    const join = (own: string, add: string) =>
      [own.trim(), add.trim()].filter(Boolean).join('; ');
    return {
      caseManagement: join(values.caseManagement, t9),
      followupPlan:   join(values.followupPlan, t10),
    };
  }, [planItems, plan, values.caseManagement, values.followupPlan, lang]);

  // Scored on what will actually be recorded, not on what she typed by hand.
  // Accepting a management plan genuinely completes T9, and scoring the raw
  // field would mark her down for using the feature.
  const quality = useMemo(
    () => score10T(toEngineInputs({ ...values, ...composed }, motherAge).visit),
    [values, composed, motherAge],
  );

  /* Read off the engine's own answer rather than re-deciding here. A second
     copy of "is she febrile" would drift from the one that raises the flag. */
  const needsMalariaTest = flags.some((f) => f.type === 'MALARIA_TEST_REQUIRED');

  const emergencies = flags.filter(f => f.severity === 'EMERGENCY');
  const warnings = flags.filter(f => f.severity === 'WARNING');
  const p4kOutstanding = p4kMissing(values, t);

  return (
    <div style={{ paddingBottom: 120 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 2px' }}>{motherName}</h1>
        {subtitle && <div style={{ fontSize: 13, color: C.dim }}>{subtitle}</div>}
      </header>

      {/* Danger first. On WhatsApp the flag block arrives at the end of a long
          reply and can be truncated by the 1500-character cap; here it sits
          above the form and appears the instant the reading is entered. */}
      {/* Solid, not a bordered box among bordered boxes. At arm's length in
          daylight a border is a rectangle; a filled block is an alarm. */}
      {/* ── WARNINGS SIT WITH THE EMERGENCIES, AT THE TOP ──────────────────
          These were drawn below the birth-plan section, several screens down.
          A midwife typing LILA near the top of the form never saw the KEK
          warning without scrolling to look for it, and the bottom bar badges
          emergencies only. A warning nobody scrolls to is not a warning. */}
      {/* ── RED BEFORE YELLOW, ALWAYS ──────────────────────────────────
          The warnings block used to be drawn ABOVE this one, so at 39.2 °C
          the yellow "WAJIB PERIKSA MALARIA" notice sat on top of the red
          "DEMAM TINGGI" emergency. She reads down; the thing that must be
          acted on now has to be the first thing there. */}
      {emergencies.length > 0 && (
        <div role="alert" style={{
          borderRadius: 11, padding: '14px 16px', marginBottom: 14,
          background: C.red, color: C.onDanger,
          boxShadow: '0 2px 10px -4px rgba(179,38,30,.5)',
        }}>
          {emergencies.map((f, i) => (
            <div key={i} style={{ fontSize: 13.5, lineHeight: 1.5, fontWeight: 600, color: C.onDanger, marginBottom: i < emergencies.length - 1 ? 8 : 0 }}>
              {flagMessage(f, lang)}
            </div>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{
          border: `1px solid ${C.amber}`, borderRadius: 11, padding: '12px 14px',
          background: C.amberSoft, marginBottom: 14,
        }}>
          {warnings.map((f, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.5, color: C.white, marginBottom: i < warnings.length - 1 ? 7 : 0 }}>
              {flagMessage(f, lang)}
            </div>
          ))}
        </div>
      )}

      {/* ── THE REFERRAL SHE MADE, BEFORE TODAY'S FIELDS ──────────────────
          Above the form because it is context for this visit rather than a
          finding of it, and because a question buried under thirty inputs is a
          question answered by whoever scrolls. Renders nothing when there is no
          open referral, which is the normal case. */}
      <ReferralFollowUp
        question={followUpQuestion(openReferral, new Date())}
        answer={values.referralAnswer}
        note={values.referralNote}
        onAnswer={(a) => onChange({ ...values, referralAnswer: a, referralNote: a ? values.referralNote : '' })}
        onNote={(n) => onChange({ ...values, referralNote: n })}
      />

      <Section title={t('Kunjungan', 'Visit')}>
        <Row>
          <Select label={t('Jenis', 'Type')} value={values.visitType} onChange={set('visitType')}
            options={['K1', 'K2', 'K3', 'K4', 'K5', 'K6']} />
          <Field label={t('Usia kehamilan', 'Gestational age')} unit="mgg" value={values.gestationalWeeks}
            onChange={set('gestationalWeeks')} numeric />
        </Row>
      </Section>

      {/* ══ THE TEN, IN THE NATIONAL ORDER ════════════════════════════════
          RENUMBERED AND REORDERED 21 OCT 2026. The engine was aligned to the
          Kemenkes sequence (Pedoman Pelayanan Antenatal Terpadu) and this form
          was not, so the screen said "T6 · Laboratorium" where the standard
          says T8, "T7 · Temu Wicara" where it says T10, and "T8 · Presentasi
          Janin" where it says T5. The data recorded was always correct and so
          was the score — only these labels were wrong, which is the worst kind
          of wrong: a midwife reconciling this form against her register or her
          training found numbers that did not match, and nothing in the product
          told her which to trust.

          EVERY SECTION NOW CARRIES WHAT IT IS FOR. A bare "T10" teaches
          nobody. A midwife trained on the ten knows it; a new staff member
          being shown the app does not, and neither should have to hold the
          Kemenkes list in their head to fill in a form.

          GROUPED BY WHAT IS MEASURED TOGETHER, not one section per item: LILA
          and fundal height are both the tape measure, presentation and DJJ are
          both the examination. Ascending order throughout, so the form and the
          register read the same way down the page. */}

      <Section title={t('T1–T2 · Berat, Tinggi & Tekanan Darah', 'T1–T2 · Weight, Height & Blood Pressure')}
        note={t('Timbang berat badan, ukur tinggi badan, dan ukur tekanan darah.',
                'Weigh her, measure her height, and take her blood pressure.')}>
        <Row>
          <Field label="BB" unit="kg" value={values.weightKg} onChange={set('weightKg')} numeric />
          <Field label="TB" unit="cm" value={values.heightCm} onChange={set('heightCm')} numeric />
        </Row>
        {bmi.bmi != null && (
          <Hint>BMI {bmi.bmi.toFixed(1)} — {bmi.category}</Hint>
        )}
        <Row>
          <Field label={t('TD sistolik', 'BP systolic')} unit="mmHg" value={values.bpSystolic} onChange={set('bpSystolic')} numeric />
          <Field label={t('TD diastolik', 'BP diastolic')} unit="mmHg" value={values.bpDiastolic} onChange={set('bpDiastolic')} numeric />
        </Row>
        {/* ── FEVER ────────────────────────────────────────────────────────
            A vital sign, so it sits with the vitals rather than in the lab
            block. The question beside it is not a convenience: it is the
            Kemenkes malaria rule verbatim -- "fever, or a history of fever in
            the last 48 hours" -- it catches the woman who was febrile at three
            in the morning, and unlike the thermometer it works on a device
            where there is no thermometer at all.

            NOT ONE OF THE TEN, and deliberately not labelled as one. */}
        <Field label={t('Suhu', 'Temperature')} unit="°C" value={values.temperatureC}
          onChange={set('temperatureC')} numeric placeholder="36.8" />
        <Tri label={t('Demam dalam 48 jam terakhir?', 'Fever in the last 48 hours?')}
          value={values.feverLast48h} onChange={set('feverLast48h')} />
      </Section>

      {/* T3 IS EXPECTED AT THE FIRST CONTACT ONLY. Re-measuring LILA at K4 is
          not what the standard asks, and the scorer does not expect it — so
          this is not gated away later, but nor is a blank one a gap. */}
      <Section title={t('T3–T4 · Status Gizi (LILA) & Tinggi Fundus', 'T3–T4 · Nutritional Status (MUAC) & Fundal Height')}
        note={t('T3 nilai status gizi dengan mengukur LILA — di bawah 23,5 cm berarti risiko KEK. T4 ukur tinggi fundus uteri untuk menilai pertumbuhan janin.',
                'T3 assesses nutrition by measuring mid-upper-arm circumference — under 23.5 cm means chronic energy deficiency. T4 measures fundal height to judge fetal growth.')}>
        <Row>
          <Field label="LILA" unit="cm" value={values.lilaCm} onChange={set('lilaCm')} numeric />
          <Field label="TFU" unit="cm" value={values.fundalHeightCm} onChange={set('fundalHeightCm')} numeric />
        </Row>
        {num(values.lilaCm) != null && num(values.lilaCm)! < 23.5 && (
          <Hint warn>LILA &lt; 23,5 cm — risiko KEK</Hint>
        )}
      </Section>

      {/* ── T5 IS ONE ITEM COVERING TWO THINGS ───────────────────────────
          The standard reads "tentukan presentasi janin dan DJJ", so they belong
          in one section. They are not asked at the same gestation though: DJJ
          is recorded whenever it can be heard, and presentation is scored only
          from 36 weeks. Hiding the presentation field earlier is not cosmetic —
          the scorer does not expect it, so an empty field would imply a gap
          that is not one. */}
      <Section title={t('T5 · Presentasi Janin & DJJ', 'T5 · Fetal Presentation & Heart Rate')}
        note={gw >= 36
          ? t('Tentukan presentasi janin dan denyut jantung janin.',
              'Determine the fetal presentation and the fetal heart rate.')
          : t('Tentukan denyut jantung janin. Presentasi ditanyakan mulai 36 minggu.',
              'Record the fetal heart rate. Presentation is asked from 36 weeks.')}>
        <Field label="DJJ" unit="dpm" value={values.djjBpm} onChange={set('djjBpm')} numeric />
        {gw >= 36 && (
          <Select label={t('Presentasi', 'Presentation')} value={values.presentation} onChange={set('presentation')}
            options={['', 'kepala', 'sungsang', 'lintang']} />
        )}
      </Section>

      <Section title={t('T6–T7 · Imunisasi TT & Tablet Tambah Darah', 'T6–T7 · TT Immunisation & Iron Tablets')}
        note={t('T6 skrining status imunisasi tetanus. T7 berikan tablet tambah darah dan catat jumlahnya.',
                'T6 reviews her tetanus immunisation status. T7 is the iron supplementation you give her, and how many tablets.')}>
        <Row>
          <Select label={t('Status TT', 'TT status')} value={values.ttStatus} onChange={set('ttStatus')}
            options={['', 'T1', 'T2', 'T3', 'T4', 'T5', 'lengkap']} />
          <Field label="Fe" unit="tablet" value={values.feTablets} onChange={set('feTablets')} numeric />
        </Row>
      </Section>

      <Section title={t('T8 · Pemeriksaan Laboratorium', 'T8 · Laboratory Screening')}
        note={t('Hb dan protein urine setiap kunjungan. Skrining lengkap (HIV, sifilis, HBsAg, golongan darah, gula darah, malaria) pada K1.',
                'Haemoglobin and urine protein at every visit. The full screen (HIV, syphilis, HBsAg, blood group, blood sugar, malaria) at K1.')}>
        <Row>
          <Field label="Hb" unit="g/dL" value={values.labHb} onChange={set('labHb')} numeric />
          <Select label={t('Protein urine', 'Urine protein')} value={values.labProtein} onChange={set('labProtein')}
            options={['', '-', '+', '++', '+++']} />
        </Row>

        {/* K1 screening is a long block that is only mandated once. Collapsed by
            default so a K3 visit is not a wall of empty fields — but opened
            automatically at K1, where leaving it blank is a real gap. */}
        {/* ── THE TEST SHE IS BEING TOLD TO DO MUST BE RECORDABLE ────────
            This block is collapsed on anything but K1, and the malaria RDT
            lives inside it. So the engine could raise MALARIA_TEST_REQUIRED at
            K3 and she would have nowhere to enter the result -- an instruction
            with no field behind it, which is how a prompt becomes something
            she learns to ignore. A fever opens the block. */}
        {/* `values.malariaRdt` keeps it open once she has answered. Without
            it, entering "negatif" cleared MALARIA_TEST_REQUIRED, the condition
            that had opened the block went false, and the block folded away
            taking the result she had just recorded out of sight. A field that
            hides what you typed into it reads as having lost it. */}
        {(values.visitType === 'K1' || showLabs || needsMalariaTest
          || !!values.malariaRdt || !!values.hivStatus || !!values.syphilisStatus
          || !!values.hbsagStatus || !!values.bloodSugarMg || !!values.bloodType) ? (
          <>
            <Row>
              <Select label="HIV" value={values.hivStatus} onChange={set('hivStatus')}
                options={['', 'non-reaktif', 'reaktif']} />
              <Select label={t('Sifilis', 'Syphilis')} value={values.syphilisStatus} onChange={set('syphilisStatus')}
                options={['', 'non-reaktif', 'reaktif']} />
            </Row>
            <Row>
              <Select label="HBsAg" value={values.hbsagStatus} onChange={set('hbsagStatus')}
                options={['', 'non-reaktif', 'reaktif']} />
              <Select label={t('Gol. darah', 'Blood type')} value={values.bloodType} onChange={set('bloodType')}
                options={['', 'A', 'B', 'AB', 'O']} />
            </Row>
            <Row>
              <Field label={t('Gula darah', 'Blood sugar')} unit="mg/dL" value={values.bloodSugarMg} onChange={set('bloodSugarMg')} numeric />
              <Select label="Malaria RDT" value={values.malariaRdt} onChange={set('malariaRdt')}
                options={['', 'negatif', 'positif']} />
            </Row>
          </>
        ) : (
          <button onClick={() => setShowLabs(true)} style={ghostBtn}>+ Skrining lab (HIV, sifilis, HBsAg…)</button>
        )}
      </Section>

      {/* The plan sits immediately above the two fields it fills, so the
          relationship is visible: tick a line, watch it appear below. Both of
          those fields are in the T9 section below, which is why the panel did
          not move when the sections were reordered. */}
      <PlanPanel items={planItems} state={plan} onChange={setPlan} />

      <Section title={t('T9 · Tata Laksana Kasus', 'T9 · Manage What You Found')}
        note={t('Catat tindakan yang diberikan untuk temuan hari ini. Tindak lanjut dan keluhan dicatat di sini juga, tetapi keduanya bukan bagian dari 10T.',
                'Record the care you gave for what you found today. Follow-up and complaints are recorded here too, but neither is one of the ten.')}>
        <Field label={t('Tatalaksana', 'Management')} value={values.caseManagement} onChange={set('caseManagement')}
          placeholder={t('tindakan yang diberikan', 'care given')} />
        {/* What the accepted lines will add, shown as a preview rather than
            typed into the field. Editing them belongs in the panel, where the
            original wording is still visible beside her change. */}
        {composed.caseManagement !== values.caseManagement && (
          <Hint>{t('+ dari rencana: ', '+ from the plan: ')}
            {composed.caseManagement.slice(values.caseManagement.trim().length).replace(/^;\s*/, '')}</Hint>
        )}
        {/* ── NOT ONE OF THE TEN, AND IT USED TO COST HER A MARK ──────────
            This was scored as the engine's `t10` until 20 Oct 2026, so a visit
            lost a tenth of its completeness for omitting something the standard
            never asked for. The engine calls it followupPlan now and does not
            score it. Saying so on screen stops the question being asked again. */}
        <Field label={t('Tindak lanjut (di luar 10T)', 'Follow-up (not one of the ten)')}
          value={values.followupPlan} onChange={set('followupPlan')}
          placeholder={t('kontrol 4 minggu', 'review in 4 weeks')} />
        {composed.followupPlan !== values.followupPlan && (
          <Hint>{t('+ dari rencana: ', '+ from the plan: ')}
            {composed.followupPlan.slice(values.followupPlan.trim().length).replace(/^;\s*/, '')}</Hint>
        )}
        <Field label={t('Keluhan (di luar 10T)', 'Complaints (not one of the ten)')}
          value={values.complaints} onChange={set('complaints')}
          placeholder={t('jika ada', 'if any')} />
      </Section>

      <Section title={t('T10 · Temu Wicara (Konseling)', 'T10 · Counselling')}
        note={t('Temu wicara: apa yang Anda bicarakan dengan ibu hari ini — tanda bahaya, gizi, persiapan persalinan, KB.',
                'What you talked about with her today — danger signs, nutrition, preparing for the birth, family planning.')}>
        <Field label={t('Topik konseling', 'Counselling topics')} value={values.counselling} onChange={set('counselling')}
          placeholder={t('tanda bahaya, gizi, KB', 'danger signs, nutrition, FP')} />
      </Section>

      {/* P4K — the birth plan. Shown from 28 weeks, because before that the
          answers are guesses; emphasised from 36, because a mother with no
          transport arranged at 36 weeks is the one who dies on the way. */}
      {gw >= 28 && (
        <Section title={t('P4K · Rencana Persalinan', 'P4K · Birth Plan')}>
          {/* THE VALUE IS THE ENGINE'S CODE, NOT THE LABEL ON SCREEN.
              generateClinicalFlags tests `birthPlan.fasilitas.includes('rumah')`
              to warn when a home birth is planned on a high-risk pregnancy.
              These options used to STORE their own labels, so the stored value
              was 'Rumah' with a capital R -- and 'Rumah'.includes('rumah') is
              false. The warning could never fire for anybody.
              Lowercasing the labels would have been worse, not better:
              'rumah sakit' CONTAINS 'rumah', so every hospital birth would have
              raised a home-birth warning instead.
              So the values are BirthPlace from @sahaibat/anc-engine -- the same
              codes sahai_deliveries stores for where a birth actually happened,
              which also makes planned and actual comparable. */}
          <Select label={t('Tempat bersalin', 'Place of birth')} value={values.p4kFasilitas} onChange={set('p4kFasilitas')}
            options={[['', '—'], ['puskesmas', 'Puskesmas'], ['rs', t('Rumah sakit', 'Hospital')],
                      ['poskesdes', 'Poskesdes'], ['polindes', 'Polindes'], ['klinik', t('Klinik', 'Clinic')],
                      ['pmb', t('Bidan praktik mandiri', 'Private midwife practice')],
                      ['rumah', t('Rumah', 'Home')], ['lainnya', t('Lainnya', 'Other')]]} />
          <Select label={t('Transportasi', 'Transport')} value={values.p4kTransportasi} onChange={set('p4kTransportasi')}
            options={['', 'Ambulans', 'Mobil', 'Motor', 'Ojek', 'Angkot', 'Lainnya']} />
          <Select label={t('Pembiayaan', 'Funding')} value={values.p4kPendanaan} onChange={set('p4kPendanaan')}
            options={['', 'BPJS', 'Jampersal', 'KIS', 'Tabungan', 'Mandiri', 'Lainnya']} />
          <Row>
            <Field label={t('Calon donor darah', 'Blood donor')} value={values.p4kDonorDarah}
              onChange={set('p4kDonorDarah')} placeholder={t('nama / gol.', 'name / type')} />
            <Field label={t('Pendamping', 'Birth companion')} value={values.p4kPendamping}
              onChange={set('p4kPendamping')} placeholder={t('suami / keluarga', 'husband / family')} />
          </Row>
          {p4kOutstanding.length > 0 && (
            <Hint warn={gw >= 36}>
              {t('Belum disiapkan', 'Not yet arranged')}: {p4kOutstanding.join(', ')}.
              {gw >= 36 ? t(' Ibu sudah ≥36 minggu — lengkapi sekarang.', ' She is ≥36 weeks — complete this now.') : ''}
            </Hint>
          )}
          {p4kOutstanding.length === 0 && <Hint>{t('Rencana persalinan lengkap.', 'Birth plan complete.')}</Hint>}
        </Section>
      )}

      {/* Sticky, because the score is feedback while she works — not a verdict
          delivered after she submits. */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, padding: 14,
        background: 'rgba(13,31,28,0.96)', borderTop: `1px solid ${C.border}`,
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ maxWidth: 460, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
            <span style={{
              fontSize: 22, fontWeight: 800, lineHeight: 1,
              // Still the 0-10 ratio, because a threshold has to be
              // comparable across visits with different denominators.
              color: quality.score >= 8 ? C.teal : quality.score >= 5 ? C.amber : C.dim,
              fontVariantNumeric: 'tabular-nums', flex: '0 0 auto',
            }}>
              {/* ── THE REAL DENOMINATOR, NOT A SCALE OF TEN ──────────────────
                  score is a RATIO rescaled to 10, and printing it beside a
                  COUNT of missing items made the two contradict each other:
                  "3/10" next to "6 missing" invites 10 − 6 = 4 and none of the
                  numbers agree. Two completed items out of eight expected is
                  2/8, and 2 + 6 = 8.

                  The denominator also moves, which is the point: before 12
                  weeks fundal height is not expected and before 36 weeks nor
                  is presentation, so a full visit early in pregnancy is out of
                  eight and is not a worse visit for it. */}
              {quality.completed.length}
              <span style={{ fontSize: 13, fontWeight: 600, opacity: .6 }}>
                /{quality.completed.length + quality.expectedButSkipped.length}
              </span>
            </span>
            {/* Named, not coded, and capped at two so the line never wraps and
                push the save button off a small screen. */}
            <span style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.35, minWidth: 0 }}>
              {quality.expectedButSkipped.length > 0 ? (() => {
                const names = quality.expectedButSkipped
                  .map((k) => (T_NAME[k] ? T_NAME[k][lang === 'en' ? 1 : 0] : k));
                const shown = names.slice(0, 2).join(', ');
                const rest = names.length - 2;
                return `${t('belum', 'missing')}: ${shown}${rest > 0 ? t(` +${rest} lagi`, ` +${rest} more`) : ''}`;
              })() : t('✓ 10T lengkap', '✓ 10T complete')}
            </span>
            {referral.refer && (
              <span style={{
                marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em',
                padding: '3px 8px', borderRadius: 4,
                background: referral.urgency === 'emergency' ? C.red : C.amber,
                color: C.onAccent,
              }}>
                {referral.urgency === 'emergency' ? t('RUJUK DARURAT', 'REFER NOW') : t('RUJUK', 'REFER')}
              </span>
            )}
          </div>
          {/* ── NUMBERS THAT CANNOT BE TRUE ─────────────────────────────────
              Named, never blocking — rule 4.4. The one marked willBeRefused is
              different in kind: the server has a CHECK constraint on it, so
              saving anyway means the visit is accepted here and silently
              refused there. She is told that plainly, and QueueBanner tells her
              again afterwards if it happens. */}
          {implausible.length > 0 && (
            <div style={{ marginBottom: 12, display: 'grid', gap: 6 }}>
              {implausible.map((w, i) => (
                <div key={i} style={{
                  fontSize: 13, lineHeight: 1.5, borderRadius: 9, padding: '9px 11px',
                  background: w.willBeRefused ? '#FDEAE8' : '#FBF1DC',
                  border: `1px solid ${w.willBeRefused ? '#B3261E' : '#8A5D06'}`,
                  color: w.willBeRefused ? '#B3261E' : '#8A5D06',
                  fontWeight: w.willBeRefused ? 600 : 400,
                }}>{t(w.id, w.en)}</div>
              ))}
            </div>
          )}
          {/* ── SHE SAID NO ──────────────────────────────────────────────
              A referral is advised and the woman declines — in the room, during
              this conversation. The product could record that she never arrived
              and had no way at all to record that she refused (case J-05,
              25 Oct 2026): nothing on the referral screen, nothing in the
              letter, nothing in her record. "Ibu menolak" existed only as a
              reason for an unrecorded 10T standard.

              IT SITS HERE, BEFORE SAVE, and not on the referral panel that
              follows. That panel appears after the visit is queued and possibly
              already uploaded, so a refusal captured there would need a second
              write and a second way to fail. Captured here it travels with the
              visit, reaches the server in the same request that creates the
              referral, and works with no signal — the state she is usually in
              when this matters.

              NEVER A BLOCK. It does not cancel the referral or the letter: she
              may change her mind, and the midwife should still hand her the
              paper. It records a decision; it refuses nothing. */}
          {referral.refer && (
            <div style={{
              marginBottom: 12, padding: '10px 12px', borderRadius: 10,
              background: C.card2,
              border: `1px solid ${values.referralDeclined ? C.amber : C.border}`,
            }}>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={values.referralDeclined === true}
                  onChange={(e) => onChange({
                    ...values,
                    referralDeclined: e.target.checked ? true : null,
                    referralDeclineReason: e.target.checked ? values.referralDeclineReason : '',
                  })}
                  style={{ marginTop: 2, width: 18, height: 18 }}
                />
                <span style={{ fontSize: 13.5, color: C.white, lineHeight: 1.5 }}>
                  {t('Ibu menolak dirujuk', 'She declined the referral')}
                  <span style={{ display: 'block', color: C.dim, fontSize: 12, marginTop: 2 }}>
                    {t('Dicatat sebagai keputusannya. Surat rujukan tetap bisa dibuat.',
                       'Recorded as her decision. The referral letter can still be made.')}
                  </span>
                </span>
              </label>
              {values.referralDeclined === true && (
                <input
                  type="text"
                  value={values.referralDeclineReason}
                  onChange={(e) => onChange({ ...values, referralDeclineReason: e.target.value })}
                  placeholder={t('Alasan (boleh dikosongkan)', 'Reason (may be left empty)')}
                  style={{
                    width: '100%', marginTop: 8, padding: '10px 11px', borderRadius: 9,
                    background: C.field, color: C.white, fontSize: 13.5,
                    border: `1px solid ${C.fieldLine}`,
                  }}
                />
              )}
            </div>
          )}
          <button
            onClick={() => {
              // Ask why BEFORE saving rather than after: afterwards the visit
              // is already recorded and the answer is a survey, which nobody
              // fills in. Here it is still part of finishing the visit.
              //
              // The numbers are questioned first, because a reading that cannot
              // be true makes every answer below it about the wrong visit.
              // A notice is shown above the button but does not gate the save:
              // see Implausible.notice. Only something that cannot be true does.
              if (implausible.some((w) => !w.notice) && !askingValues) setAskingValues(true);
              else if (quality.expectedButSkipped.length > 0 && !askingWhy) setAskingWhy(true);
              else onSave({ values: { ...values, ...composed }, plan, skipReasons });
            }}
            disabled={saving}
            style={{
              width: '100%', padding: 15, fontSize: 15.5, fontWeight: 700, borderRadius: 11,
              background: saving ? C.accentMuted : C.teal,
              color: saving ? C.dim : C.onAccent, border: 'none', cursor: saving ? 'default' : 'pointer',
            }}>
            {saving
              ? t('Menyimpan…', 'Saving…')
              : (planItems.length > 0 && plan.accepted.length + plan.declined.length === 0)
                // Named rather than blocked. She may have every reason to skip
                // the plan, and a button that refuses her is a button she
                // stops trusting — but an untouched plan should not slip past
                // silently either, because the record will say she did none
                // of it and that will be true.
                ? t('Simpan tanpa rencana asuhan', 'Save without a care plan')
                : t('Simpan kunjungan', 'Save visit')}
          </button>
        </div>
      </div>

      {askingValues && (
        <ConfirmWarnings
          items={implausible}
          saving={saving}
          onCancel={() => setAskingValues(false)}
          /* Only offered when the gestational age itself is what the server
             will refuse. Clearing it is now safe -- the column holds an unknown
             since phase-9k -- so the Hb and the pressure survive instead of
             going down with it. */
          onSaveWithout={
            implausible.some((w) => w.field === 'gestationalWeeks' && w.willBeRefused)
              ? () => {
                  setAskingValues(false);
                  const cleared = { ...values, gestationalWeeks: '' };
                  onChange(cleared);
                  onSave({ values: { ...cleared, ...composed }, plan, skipReasons });
                }
              : undefined
          }
          onConfirm={() => {
            // She has seen them and stands by the reading. Carry on into the
            // ordinary save path -- including the skipped-items question, which
            // still has to be asked.
            setAskingValues(false);
            if (quality.expectedButSkipped.length > 0) setAskingWhy(true);
            else onSave({ values: { ...values, ...composed }, plan, skipReasons });
          }}
        />
      )}

      {askingWhy && (
        <SkipReasons
          missing={quality.expectedButSkipped}
          nameOf={(k) => (T_NAME[k] ? T_NAME[k][lang === 'en' ? 1 : 0] : k)}
          value={skipReasons}
          onChange={setSkipReasons}
          onConfirm={() => onSave({ values: { ...values, ...composed }, plan, skipReasons })}
          onCancel={() => setAskingWhy(false)}
          saving={saving}
        />
      )}
    </div>
  );
}
