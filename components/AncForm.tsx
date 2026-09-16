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

const num = (s: string): number | null => {
  const v = parseFloat(s);
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
  onSave: () => void;
  saving?: boolean;
}

export default function AncForm({ motherName, motherAge, subtitle, values, onChange, onSave, saving }: Props) {
  const { t, lang } = useLang();
  const [showLabs, setShowLabs] = useState(false);
  const set = (k: keyof AncFormValues) => (val: string) => onChange({ ...values, [k]: val });

  const gw = num(values.gestationalWeeks) ?? 0;

  const { quality, flags, referral, bmi } = useMemo(() => {
    const { visit, clinical, bmi } = toEngineInputs(values, motherAge);
    const flags = generateClinicalFlags(clinical as any);
    return { quality: score10T(visit as any), flags, referral: shouldRefer(flags), bmi };
  }, [values, motherAge]);

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
      {emergencies.length > 0 && (
        <div role="alert" style={{
          border: `1.5px solid ${C.red}`, borderRadius: 11, padding: '13px 15px',
          background: 'rgba(255,107,107,0.12)', marginBottom: 14,
        }}>
          {emergencies.map((f, i) => (
            <div key={i} style={{ fontSize: 13.5, lineHeight: 1.5, color: C.white, marginBottom: i < emergencies.length - 1 ? 8 : 0 }}>
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

      <Section title={t('T9–T10 · Tatalaksana & Tindak Lanjut', 'T9–T10 · Management & Follow-up')}>
        <Field label={t('Tatalaksana', 'Management')} value={values.caseManagement} onChange={set('caseManagement')}
          placeholder={t('tindakan yang diberikan', 'care given')} />
        <Field label={t('Tindak lanjut', 'Follow-up')} value={values.followupPlan} onChange={set('followupPlan')}
          placeholder={t('kontrol 4 minggu', 'review in 4 weeks')} />
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
          background: 'rgba(255,209,102,0.10)', marginBottom: 14,
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
                color: '#04241E',
              }}>
                {referral.urgency === 'emergency' ? t('RUJUK DARURAT', 'REFER NOW') : t('RUJUK', 'REFER')}
              </span>
            )}
          </div>
          <button onClick={onSave} disabled={saving} style={{
            width: '100%', padding: 15, fontSize: 15.5, fontWeight: 700, borderRadius: 11,
            background: saving ? 'rgba(2,195,154,0.35)' : C.teal,
            color: saving ? C.dim : '#04241E', border: 'none', cursor: saving ? 'default' : 'pointer',
          }}>
            {saving ? t('Menyimpan…', 'Saving…') : t('Simpan kunjungan', 'Save visit')}
          </button>
        </div>
      </div>
    </div>
  );
}
