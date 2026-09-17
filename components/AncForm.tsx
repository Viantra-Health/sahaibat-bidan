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
import SkipReasons, { type SkipReasonMap } from './SkipReasons';
import PlanPanel, { EMPTY_PLAN, lineText, type PlanState } from './PlanPanel';
import { suggestCarePlan, planToFields, type PlanItem } from '@sahaibat/anc-engine';
import { C, ghostBtn, Section, Row, Hint, Field, Select } from './ui';
import { useLang, flagMessage } from '@/lib/lang';

export interface AncFormValues {
  visitType: string;
  gestationalWeeks: string;
  weightKg: string; heightCm: string;
  bpSystolic: string; bpDiastolic: string;
  fundalHeightCm: string; lilaCm: string; djjBpm: string;
  bloodType: string; ttStatus: string; feTablets: string;
  labHb: string; labProtein: string;
  hivStatus: string; syphilisStatus: string; hbsagStatus: string;
  bloodSugarMg: string; malariaRdt: string;
  counselling: string; presentation: string;
  caseManagement: string; followupPlan: string; complaints: string;
  // P4K — Perencanaan Persalinan dan Pencegahan Komplikasi. The engine has
  // parsed these from WhatsApp all along and nothing has ever displayed them.
  p4kFasilitas: string; p4kTransportasi: string; p4kDonorDarah: string;
  p4kPendanaan: string; p4kPendamping: string;
}

export const EMPTY_FORM: AncFormValues = {
  visitType: 'K1', gestationalWeeks: '',
  weightKg: '', heightCm: '', bpSystolic: '', bpDiastolic: '',
  fundalHeightCm: '', lilaCm: '', djjBpm: '',
  bloodType: '', ttStatus: '', feTablets: '',
  labHb: '', labProtein: '', hivStatus: '', syphilisStatus: '', hbsagStatus: '',
  bloodSugarMg: '', malariaRdt: '',
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

  const visit = {
    gestationalWeeks: gw,
    t1WeightKg: num(v.weightKg),
    t2BpSystolic: num(v.bpSystolic),
    t2BpDiastolic: num(v.bpDiastolic),
    t3FundalHeightCm: num(v.fundalHeightCm),
    t4TtStatus: v.ttStatus || null,
    t5FeTablets: num(v.feTablets),
    t6LabHb: num(v.labHb),
    t6LabProtein: v.labProtein || null,
    t6LabOther: null,
    t7CounsellingTopics: v.counselling ? v.counselling.split(',').map(s => s.trim()).filter(Boolean) : null,
    t8Presentation: v.presentation || null,
    t9CaseManagement: v.caseManagement || null,
    t10FollowupPlan: v.followupPlan || null,
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
    usgResults: null,
    // Null when she has filled nothing — the rules distinguish "no plan yet"
    // from "a plan missing its transport", and collapsing that into an object
    // of nulls would silence NO_BIRTH_PLAN entirely.
    birthPlan: birthPlanOf(v),
  };

  return { visit, clinical, bmi };
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

export default function AncForm({ motherName, motherAge, subtitle, values, onChange, onSave, saving }: Props) {
  const { t, lang } = useLang();
  const [showLabs, setShowLabs] = useState(false);
  const [askingWhy, setAskingWhy] = useState(false);
  const [plan, setPlan] = useState<PlanState>(EMPTY_PLAN);
  const [skipReasons, setSkipReasons] = useState<SkipReasonMap>({});
  const set = (k: keyof AncFormValues) => (val: string) => onChange({ ...values, [k]: val });

  const gw = num(values.gestationalWeeks) ?? 0;

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
    () => score10T(toEngineInputs({ ...values, ...composed }, motherAge).visit as any),
    [values, composed, motherAge],
  );

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

      <Section title={t('Kunjungan', 'Visit')}>
        <Row>
          <Select label={t('Jenis', 'Type')} value={values.visitType} onChange={set('visitType')}
            options={['K1', 'K2', 'K3', 'K4', 'K5', 'K6']} />
          <Field label={t('Usia kehamilan', 'Gestational age')} unit="mgg" value={values.gestationalWeeks}
            onChange={set('gestationalWeeks')} numeric />
        </Row>
      </Section>

      <Section title={t('T1–T2 · Timbang & Tekanan Darah', 'T1–T2 · Weight & Blood Pressure')}>
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
      </Section>

      <Section title={t('T3 · Tinggi Fundus, LILA, DJJ', 'T3 · Fundal Height, LILA, DJJ')}>
        <Row>
          <Field label="TFU" unit="cm" value={values.fundalHeightCm} onChange={set('fundalHeightCm')} numeric />
          <Field label="LILA" unit="cm" value={values.lilaCm} onChange={set('lilaCm')} numeric />
        </Row>
        {num(values.lilaCm) != null && num(values.lilaCm)! < 23.5 && (
          <Hint warn>LILA &lt; 23,5 cm — risiko KEK</Hint>
        )}
        <Field label="DJJ" unit="dpm" value={values.djjBpm} onChange={set('djjBpm')} numeric />
      </Section>

      <Section title={t('T4–T5 · Imunisasi TT & Tablet Fe', 'T4–T5 · TT Immunisation & Iron')}>
        <Row>
          <Select label={t('Status TT', 'TT status')} value={values.ttStatus} onChange={set('ttStatus')}
            options={['', 'T1', 'T2', 'T3', 'T4', 'T5', 'lengkap']} />
          <Field label="Fe" unit="tablet" value={values.feTablets} onChange={set('feTablets')} numeric />
        </Row>
      </Section>

      <Section title={t('T6 · Laboratorium', 'T6 · Laboratory')}>
        <Row>
          <Field label="Hb" unit="g/dL" value={values.labHb} onChange={set('labHb')} numeric />
          <Select label={t('Protein urine', 'Urine protein')} value={values.labProtein} onChange={set('labProtein')}
            options={['', '-', '+', '++', '+++']} />
        </Row>

        {/* K1 screening is a long block that is only mandated once. Collapsed by
            default so a K3 visit is not a wall of empty fields — but opened
            automatically at K1, where leaving it blank is a real gap. */}
        {(values.visitType === 'K1' || showLabs) ? (
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

      <Section title={t('T7 · Temu Wicara', 'T7 · Counselling')}>
        <Field label={t('Topik konseling', 'Counselling topics')} value={values.counselling} onChange={set('counselling')}
          placeholder={t('tanda bahaya, gizi, KB', 'danger signs, nutrition, FP')} />
      </Section>

      {/* T8 only exists from 36 weeks. Hiding it earlier is not cosmetic: the
          scorer does not expect it, so showing an empty field would imply a gap
          that is not one. */}
      {gw >= 36 && (
        <Section title={t('T8 · Presentasi Janin', 'T8 · Fetal Presentation')}>
          <Select label={t('Presentasi', 'Presentation')} value={values.presentation} onChange={set('presentation')}
            options={['', 'kepala', 'sungsang', 'lintang']} />
        </Section>
      )}

      {/* The plan sits immediately above the two fields it fills, so the
          relationship is visible: tick a line, watch it appear below. */}
      <PlanPanel items={planItems} state={plan} onChange={setPlan} />

      <Section title={t('T9–T10 · Tatalaksana & Tindak Lanjut', 'T9–T10 · Management & Follow-up')}>
        <Field label={t('Tatalaksana', 'Management')} value={values.caseManagement} onChange={set('caseManagement')}
          placeholder={t('tindakan yang diberikan', 'care given')} />
        {/* What the accepted lines will add, shown as a preview rather than
            typed into the field. Editing them belongs in the panel, where the
            original wording is still visible beside her change. */}
        {composed.caseManagement !== values.caseManagement && (
          <Hint>{t('+ dari rencana: ', '+ from the plan: ')}
            {composed.caseManagement.slice(values.caseManagement.trim().length).replace(/^;\s*/, '')}</Hint>
        )}
        <Field label={t('Tindak lanjut', 'Follow-up')} value={values.followupPlan} onChange={set('followupPlan')}
          placeholder={t('kontrol 4 minggu', 'review in 4 weeks')} />
        {composed.followupPlan !== values.followupPlan && (
          <Hint>{t('+ dari rencana: ', '+ from the plan: ')}
            {composed.followupPlan.slice(values.followupPlan.trim().length).replace(/^;\s*/, '')}</Hint>
        )}
        <Field label={t('Keluhan', 'Complaints')} value={values.complaints} onChange={set('complaints')}
          placeholder={t('jika ada', 'if any')} />
      </Section>

      {/* P4K — the birth plan. Shown from 28 weeks, because before that the
          answers are guesses; emphasised from 36, because a mother with no
          transport arranged at 36 weeks is the one who dies on the way. */}
      {gw >= 28 && (
        <Section title={t('P4K · Rencana Persalinan', 'P4K · Birth Plan')}>
          <Select label={t('Tempat bersalin', 'Place of birth')} value={values.p4kFasilitas} onChange={set('p4kFasilitas')}
            options={['', 'Puskesmas', 'Rumah sakit', 'Poskesdes', 'Klinik', 'Bidan praktik', 'Rumah']} />
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
              color: quality.score >= 8 ? C.teal : quality.score >= 5 ? C.amber : C.dim,
              fontVariantNumeric: 'tabular-nums', flex: '0 0 auto',
            }}>
              {quality.score}<span style={{ fontSize: 13, fontWeight: 600, opacity: .6 }}>/10</span>
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
          <button
            onClick={() => {
              // Ask why BEFORE saving rather than after: afterwards the visit
              // is already recorded and the answer is a survey, which nobody
              // fills in. Here it is still part of finishing the visit.
              if (quality.expectedButSkipped.length > 0 && !askingWhy) setAskingWhy(true);
              else onSave({ values: { ...values, ...composed }, plan, skipReasons });
            }}
            disabled={saving}
            style={{
              width: '100%', padding: 15, fontSize: 15.5, fontWeight: 700, borderRadius: 11,
              background: saving ? C.accentMuted : C.teal,
              color: saving ? C.dim : C.onAccent, border: 'none', cursor: saving ? 'default' : 'pointer',
            }}>
            {saving ? t('Menyimpan…', 'Saving…') : t('Simpan kunjungan', 'Save visit')}
          </button>
        </div>
      </div>

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
