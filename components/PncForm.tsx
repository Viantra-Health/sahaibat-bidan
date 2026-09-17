'use client';

// components/PncForm.tsx
// The postnatal record (KF1–KF4).
//
// Postnatal is not antenatal with different fields. Three things drive the
// shape of this form:
//
//   1. THE CLOCK IS TIGHT. KF1 falls in the first two days, when haemorrhage
//      kills. Days-since-delivery is the first field and it drives everything
//      else, including which KF this is.
//   2. TWO PATIENTS. Mother and baby are assessed in one visit, and the baby's
//      danger signs are not a subsection of the mother's.
//   3. MOST ANSWERS ARE YES / NO / NOT ASKED. A wound that was never looked at
//      is not a wound that is fine, so every clinical question is three-state.
//      That distinction is the difference between a record and a guess.
//
// Flags run on every change through @sahaibat/anc-engine — the same rules the
// server and the WhatsApp path use — so a fever raises RUJUK SEGERA while the
// thermometer is still in her hand.

import { useMemo } from 'react';
import { generatePncFlags, shouldReferPnc, kfForDay } from '@sahaibat/anc-engine';
import { C, Section, Row, Hint, Field, Select, Tri } from './ui';
import { useLang, flagMessage } from '@/lib/lang';

export interface PncFormValues {
  visitType: string;
  daysPostpartum: string;
  bpSystolic: string; bpDiastolic: string;
  temperatureC: string;
  bleeding: '' | 'none' | 'normal' | 'high';
  lochiaFoul: boolean | null;
  woundInfected: boolean | null;
  breastfeedingEstablished: boolean | null;
  babyWeightKg: string;
  jaundiceSevere: boolean | null;
  epdsScore: string;
  fpCounselling: boolean | null;
  complaints: string;
  followupPlan: string;
}

export const EMPTY_PNC: PncFormValues = {
  visitType: 'KF1', daysPostpartum: '',
  bpSystolic: '', bpDiastolic: '', temperatureC: '',
  bleeding: '', lochiaFoul: null, woundInfected: null,
  breastfeedingEstablished: null, babyWeightKg: '', jaundiceSevere: null,
  epdsScore: '', fpCounselling: null, complaints: '', followupPlan: '',
};

// Indonesian keyboards produce commas. The engine handles them in free text;
// here the field is already numeric, so normalise on the way in.
const num = (s: string): number | null => {
  const v = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

export function toPncInput(v: PncFormValues) {
  return {
    daysPostpartum: num(v.daysPostpartum) ?? 0,
    bpSystolic: num(v.bpSystolic),
    bpDiastolic: num(v.bpDiastolic),
    temperatureC: num(v.temperatureC),
    bleeding: (v.bleeding === '' ? null : v.bleeding) as 'none' | 'normal' | 'high' | null,
    lochiaFoul: v.lochiaFoul,
    woundInfected: v.woundInfected,
    breastfeedingEstablished: v.breastfeedingEstablished,
    babyWeightKg: num(v.babyWeightKg),
    jaundiceSevere: v.jaundiceSevere,
    epdsScore: num(v.epdsScore),
    complaints: v.complaints.trim() || null,
  };
}

const BLEEDING_LABEL: Record<string, [string, string]> = {
  '': ['—', '—'],
  none: ['Tidak ada', 'None'],
  normal: ['Normal / sedikit', 'Normal / light'],
  high: ['Banyak', 'Heavy'],
};

interface Props {
  motherName: string;
  subtitle?: string | null;
  values: PncFormValues;
  onChange: (v: PncFormValues) => void;
  onSave: () => void;
  saving?: boolean;
}

export default function PncForm({ motherName, subtitle, values, onChange, onSave, saving }: Props) {
  const { t, lang } = useLang();
  const set = <K extends keyof PncFormValues>(k: K) => (val: PncFormValues[K]) =>
    onChange({ ...values, [k]: val });

  const days = num(values.daysPostpartum);
  const suggestedKf = days != null ? kfForDay(days) : null;

  const { flags, referral } = useMemo(() => {
    const input = toPncInput(values);
    const flags = generatePncFlags(input as any);
    return { flags, referral: shouldReferPnc(flags) };
  }, [values]);

  const emergencies = flags.filter((f) => f.severity === 'EMERGENCY');
  const warnings = flags.filter((f) => f.severity === 'WARNING');

  return (
    <div style={{ paddingBottom: 120 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 2px' }}>{motherName}</h1>
        {subtitle && <div style={{ fontSize: 13, color: C.dim }}>{subtitle}</div>}
      </header>

      {/* Danger first, above the form, the instant a reading is entered. */}
      {/* Solid, not a bordered box among bordered boxes. At arm's length in
          daylight a border is a rectangle; a filled block is an alarm. */}
      {emergencies.length > 0 && (
        <div role="alert" style={{
          borderRadius: 11, padding: '14px 16px', marginBottom: 14,
          background: C.red, color: C.onDanger,
          boxShadow: '0 2px 10px -4px rgba(179,38,30,.5)',
        }}>
          {emergencies.map((f, i) => (
            <div key={i} style={{
              fontSize: 13.5, lineHeight: 1.5, fontWeight: 600, color: C.onDanger,
              marginBottom: i < emergencies.length - 1 ? 8 : 0,
            }}>
              {flagMessage(f, lang)}
            </div>
          ))}
        </div>
      )}

      <Section title={t('Kunjungan nifas', 'Postnatal visit')}>
        <Row>
          <Select label={t('Jenis', 'Type')} value={values.visitType} onChange={set('visitType')}
            options={['KF1', 'KF2', 'KF3', 'KF4']} />
          <Field label={t('Hari ke-', 'Day')} value={values.daysPostpartum}
            onChange={set('daysPostpartum')} numeric placeholder={t('mis. 3', 'e.g. 3')} />
        </Row>
        {suggestedKf && suggestedKf !== values.visitType && (
          <Hint warn>
            {t(`Hari ke-${days} biasanya ${suggestedKf}. Ubah jika perlu — kunjungan terlambat tetap dicatat.`,
               `Day ${days} is usually ${suggestedKf}. Change it if needed — a late visit is still recorded.`)}
          </Hint>
        )}
        {days != null && days > 42 && (
          <Hint warn>{t(`Hari ke-${days} sudah di luar masa nifas (42 hari).`,
                         `Day ${days} is outside the postnatal period (42 days).`)}</Hint>
        )}
      </Section>

      <Section title={t('Ibu · tanda vital', 'Mother · vital signs')}>
        <Row>
          <Field label={t('TD sistolik', 'BP systolic')} unit="mmHg" value={values.bpSystolic}
            onChange={set('bpSystolic')} numeric />
          <Field label={t('TD diastolik', 'BP diastolic')} unit="mmHg" value={values.bpDiastolic}
            onChange={set('bpDiastolic')} numeric />
        </Row>
        <Field label={t('Suhu', 'Temperature')} unit="°C" value={values.temperatureC}
          onChange={set('temperatureC')} numeric placeholder={t('mis. 36,8', 'e.g. 36.8')} />
        {/* Temperature was captured on WhatsApp and never evaluated. It is
            first-class here because fever is the sepsis signal. */}
        <Hint>{t('Demam ≥ 38 °C adalah tanda infeksi nifas — selalu ukur.',
                  'A fever ≥ 38 °C is a sign of puerperal infection — always measure.')}</Hint>
      </Section>

      <Section title={t('Ibu · perdarahan & involusi', 'Mother · bleeding & involution')}>
        <Select
          label={t('Perdarahan', 'Bleeding')}
          value={values.bleeding}
          onChange={(v) => set('bleeding')(v as PncFormValues['bleeding'])}
          options={['', 'none', 'normal', 'high']}
        />
        <Hint>{(BLEEDING_LABEL[values.bleeding] ?? ['—', '—'])[lang === 'en' ? 1 : 0]}</Hint>
        <Tri label={t('Lokia berbau?', 'Foul-smelling lochia?')} value={values.lochiaFoul} onChange={set('lochiaFoul')} />
        <Tri label={t('Luka jahitan terinfeksi?', 'Wound infected?')} value={values.woundInfected} onChange={set('woundInfected')} />
      </Section>

      <Section title={t('Bayi', 'Baby')}>
        <Field label={t('Berat bayi', 'Baby weight')} unit="kg" value={values.babyWeightKg}
          onChange={set('babyWeightKg')} numeric placeholder={t('mis. 3,1', 'e.g. 3.1')} />
        <Tri label={t('Ikterus berat?', 'Severe jaundice?')} value={values.jaundiceSevere} onChange={set('jaundiceSevere')} />
        <Tri label={t('Menyusui lancar?', 'Breastfeeding established?')} value={values.breastfeedingEstablished}
          onChange={set('breastfeedingEstablished')} yes={t('Lancar', 'Yes')} no={t('Belum', 'Not yet')} />
      </Section>

      <Section title={t('Kesehatan jiwa & KB', 'Mental health & family planning')}>
        <Field label={t('Skor EPDS', 'EPDS score')} unit="0–30" value={values.epdsScore}
          onChange={set('epdsScore')} numeric />
        <Hint>{t('≥ 10 perlu tindak lanjut, ≥ 13 kemungkinan depresi postpartum.',
                  '≥ 10 needs follow-up, ≥ 13 probable postnatal depression.')}</Hint>
        <Tri label={t('Konseling KB diberikan?', 'Family planning counselling given?')} value={values.fpCounselling} onChange={set('fpCounselling')} />
      </Section>

      <Section title={t('Catatan', 'Notes')}>
        <Field label={t('Keluhan', 'Complaints')} value={values.complaints} onChange={set('complaints')}
          placeholder={t('mis. nyeri perut, demam', 'e.g. abdominal pain, fever')} />
        <Field label={t('Tindak lanjut', 'Follow-up')} value={values.followupPlan} onChange={set('followupPlan')} />
      </Section>

      {warnings.length > 0 && (
        <Section title={t('Perhatian', 'Attention')}>
          {warnings.map((f, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.5, color: C.amber, marginBottom: 7 }}>
              {flagMessage(f, lang)}
            </div>
          ))}
        </Section>
      )}

      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, padding: '12px 16px 18px',
        background: 'linear-gradient(to top, var(--on-accent) 62%, rgba(4,36,30,0))',
      }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          {referral.refer && (
            <div style={{ fontSize: 12.5, color: C.red, marginBottom: 8, textAlign: 'center' }}>
              {t('Rujukan akan dibuat', 'A referral will be created')} ({referral.urgency === 'emergency'
                ? t('DARURAT', 'EMERGENCY') : t('segera', 'urgent')})
            </div>
          )}
          <button onClick={onSave} disabled={saving} style={{
            width: '100%', padding: 15, fontSize: 15.5, fontWeight: 700, borderRadius: 11,
            background: saving ? C.accentMuted : C.teal,
            color: saving ? C.dim : C.onAccent, border: 'none', cursor: saving ? 'default' : 'pointer',
          }}>
            {saving ? t('Menyimpan…', 'Saving…') : t('Simpan kunjungan nifas', 'Save postnatal visit')}
          </button>
        </div>
      </div>
    </div>
  );
}
