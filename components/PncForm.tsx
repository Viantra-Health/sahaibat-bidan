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

const BLEEDING_LABEL: Record<string, string> = {
  '': '—',
  none: 'Tidak ada',
  normal: 'Normal / sedikit',
  high: 'Banyak',
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
      {emergencies.length > 0 && (
        <div role="alert" style={{
          border: `1.5px solid ${C.red}`, borderRadius: 11, padding: '13px 15px',
          background: 'rgba(255,107,107,0.12)', marginBottom: 14,
        }}>
          {emergencies.map((f, i) => (
            <div key={i} style={{
              fontSize: 13.5, lineHeight: 1.5, color: C.white,
              marginBottom: i < emergencies.length - 1 ? 8 : 0,
            }}>
              {f.message_id}
            </div>
          ))}
        </div>
      )}

      <Section title="Kunjungan nifas">
        <Row>
          <Select label="Jenis" value={values.visitType} onChange={set('visitType')}
            options={['KF1', 'KF2', 'KF3', 'KF4']} />
          <Field label="Hari ke-" value={values.daysPostpartum}
            onChange={set('daysPostpartum')} numeric placeholder="mis. 3" />
        </Row>
        {suggestedKf && suggestedKf !== values.visitType && (
          <Hint warn>
            Hari ke-{days} biasanya {suggestedKf}. Ubah jika perlu — kunjungan terlambat
            tetap dicatat.
          </Hint>
        )}
        {days != null && days > 42 && (
          <Hint warn>Hari ke-{days} sudah di luar masa nifas (42 hari).</Hint>
        )}
      </Section>

      <Section title="Ibu · tanda vital">
        <Row>
          <Field label="TD sistolik" unit="mmHg" value={values.bpSystolic}
            onChange={set('bpSystolic')} numeric />
          <Field label="TD diastolik" unit="mmHg" value={values.bpDiastolic}
            onChange={set('bpDiastolic')} numeric />
        </Row>
        <Field label="Suhu" unit="°C" value={values.temperatureC}
          onChange={set('temperatureC')} numeric placeholder="mis. 36,8" />
        {/* Temperature was captured on WhatsApp and never evaluated. It is
            first-class here because fever is the sepsis signal. */}
        <Hint>Demam ≥ 38 °C adalah tanda infeksi nifas — selalu ukur.</Hint>
      </Section>

      <Section title="Ibu · perdarahan & involusi">
        <Select
          label="Perdarahan"
          value={values.bleeding}
          onChange={(v) => set('bleeding')(v as PncFormValues['bleeding'])}
          options={['', 'none', 'normal', 'high']}
        />
        <Hint>{BLEEDING_LABEL[values.bleeding] ?? '—'}</Hint>
        <Tri label="Lokia berbau?" value={values.lochiaFoul} onChange={set('lochiaFoul')} />
        <Tri label="Luka jahitan terinfeksi?" value={values.woundInfected} onChange={set('woundInfected')} />
      </Section>

      <Section title="Bayi">
        <Field label="Berat bayi" unit="kg" value={values.babyWeightKg}
          onChange={set('babyWeightKg')} numeric placeholder="mis. 3,1" />
        <Tri label="Ikterus berat?" value={values.jaundiceSevere} onChange={set('jaundiceSevere')} />
        <Tri label="Menyusui lancar?" value={values.breastfeedingEstablished}
          onChange={set('breastfeedingEstablished')} yes="Lancar" no="Belum" />
      </Section>

      <Section title="Kesehatan jiwa & KB">
        <Field label="Skor EPDS" unit="0–30" value={values.epdsScore}
          onChange={set('epdsScore')} numeric />
        <Hint>≥ 10 perlu tindak lanjut, ≥ 13 kemungkinan depresi postpartum.</Hint>
        <Tri label="Konseling KB diberikan?" value={values.fpCounselling} onChange={set('fpCounselling')} />
      </Section>

      <Section title="Catatan">
        <Field label="Keluhan" value={values.complaints} onChange={set('complaints')}
          placeholder="mis. nyeri perut, demam" />
        <Field label="Tindak lanjut" value={values.followupPlan} onChange={set('followupPlan')} />
      </Section>

      {warnings.length > 0 && (
        <Section title="Perhatian">
          {warnings.map((f, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.5, color: C.amber, marginBottom: 7 }}>
              {f.message_id}
            </div>
          ))}
        </Section>
      )}

      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, padding: '12px 16px 18px',
        background: 'linear-gradient(to top, #04241E 62%, rgba(4,36,30,0))',
      }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          {referral.refer && (
            <div style={{ fontSize: 12.5, color: C.red, marginBottom: 8, textAlign: 'center' }}>
              Rujukan akan dibuat ({referral.urgency === 'emergency' ? 'DARURAT' : 'segera'})
            </div>
          )}
          <button onClick={onSave} disabled={saving} style={{
            width: '100%', padding: 15, fontSize: 15.5, fontWeight: 700, borderRadius: 11,
            background: saving ? 'rgba(2,195,154,0.35)' : C.teal,
            color: saving ? C.dim : '#04241E', border: 'none', cursor: saving ? 'default' : 'pointer',
          }}>
            {saving ? 'Menyimpan…' : 'Simpan kunjungan nifas'}
          </button>
        </div>
      </div>
    </div>
  );
}
