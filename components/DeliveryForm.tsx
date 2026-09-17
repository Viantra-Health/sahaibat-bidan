'use client';

// components/DeliveryForm.tsx
// The birth.
//
// Three things make this different from the antenatal and postnatal forms:
//
//   1. TWO PATIENTS, AND SOMETIMES THREE. Twins are ordinary. Babies are a
//      list, each with its own weight, its own outcome, its own flags — and
//      the form has to let her add a second one without leaving the page.
//
//   2. WHERE AND BY WHOM ARE INDICATORS, NOT TRIVIA. Linakes is derived from
//      exactly two fields on this form, and nothing else in the system can
//      produce it. They sit near the top and are never free text.
//
//   3. SHE MAY BE FILLING IT AT 3AM, HOURS LATE, FROM MEMORY. Everything is
//      optional except the date, nothing blocks a save, and the mandated
//      newborn care questions are three-state — because "I have not answered
//      yet" is not "it was not done", and scolding her on a form she is
//      completing after a long night is how the form gets abandoned.

import { useMemo } from 'react';
import { generateDeliveryFlags, shouldReferDelivery, linakes } from '@sahaibat/anc-engine';
import { C, Section, Row, Hint, Field, Select, Tri } from './ui';
import { useLang, flagMessage } from '@/lib/lang';

export interface BabyValues {
  outcome: '' | 'hidup' | 'mati';
  sex: '' | 'L' | 'P';
  weightGrams: string;
  lengthCm: string;
  criedImmediately: boolean | null;
  imd: boolean | null;
  vitaminK: boolean | null;
  hepatitisB0: boolean | null;
  name: string;
}

export interface DeliveryFormValues {
  deliveryDate: string;
  deliveryTime: string;
  place: string;
  placeName: string;
  attendant: string;
  attendantName: string;
  mode: string;
  gestationalWeeks: string;
  bloodLossMl: string;
  complications: string;
  motherOutcome: '' | 'hidup' | 'mati';
  babies: BabyValues[];
}

export const EMPTY_BABY: BabyValues = {
  outcome: 'hidup', sex: '', weightGrams: '', lengthCm: '',
  criedImmediately: null, imd: null, vitaminK: null, hepatitisB0: null, name: '',
};

export const EMPTY_DELIVERY: DeliveryFormValues = {
  deliveryDate: new Date().toISOString().slice(0, 10),
  deliveryTime: '',
  place: '', placeName: '', attendant: '', attendantName: '',
  mode: '', gestationalWeeks: '', bloodLossMl: '', complications: '',
  motherOutcome: 'hidup',
  babies: [{ ...EMPTY_BABY }],
};

const num = (s: string): number | null => {
  const v = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

/** Values are codes, so linakes cannot drift on a spelling. Labels are shown. */
const PLACES: Array<[string, string, string]> = [
  ['', '—', '—'],
  ['rs', 'Rumah sakit', 'Hospital'],
  ['puskesmas', 'Puskesmas', 'Puskesmas'],
  ['poskesdes', 'Poskesdes', 'Poskesdes'],
  ['polindes', 'Polindes', 'Polindes'],
  ['klinik', 'Klinik', 'Clinic'],
  ['pmb', 'Praktik mandiri bidan', 'Private midwife practice'],
  ['rumah', 'Rumah', 'Home'],
  ['perjalanan', 'Dalam perjalanan', 'In transit'],
  ['lainnya', 'Lainnya', 'Other'],
];

const ATTENDANTS: Array<[string, string, string]> = [
  ['', '—', '—'],
  ['bidan', 'Bidan', 'Midwife'],
  ['dokter', 'Dokter', 'Doctor'],
  ['dokter_spesialis', 'Dokter spesialis', 'Specialist'],
  ['perawat', 'Perawat', 'Nurse'],
  ['dukun', 'Dukun bayi', 'Traditional attendant'],
  ['keluarga', 'Keluarga', 'Family member'],
  ['tidak_ada', 'Tidak ada penolong', 'Nobody'],
];

const MODES: Array<[string, string, string]> = [
  ['', '—', '—'],
  ['spontan', 'Spontan pervaginam', 'Spontaneous vaginal'],
  ['sc', 'Sectio caesarea', 'Caesarean'],
  ['vakum', 'Vakum', 'Vacuum'],
  ['forceps', 'Forsep', 'Forceps'],
];

export function toDeliveryInput(v: DeliveryFormValues) {
  return {
    gestationalWeeks: num(v.gestationalWeeks),
    place: (v.place || null) as any,
    attendant: (v.attendant || null) as any,
    mode: (v.mode || null) as any,
    bloodLossMl: num(v.bloodLossMl),
    complications: v.complications.split(',').map((c) => c.trim()).filter(Boolean),
    motherOutcome: (v.motherOutcome || null) as any,
    babies: v.babies.map((b, i) => ({
      order: i + 1,
      outcome: (b.outcome || null) as any,
      sex: (b.sex || null) as any,
      weightGrams: num(b.weightGrams),
      lengthCm: num(b.lengthCm),
      criedImmediately: b.criedImmediately,
      imd: b.imd,
      vitaminK: b.vitaminK,
      hepatitisB0: b.hepatitisB0,
    })),
  };
}

interface Props {
  motherName: string;
  subtitle?: string | null;
  values: DeliveryFormValues;
  onChange: (v: DeliveryFormValues) => void;
  onSave: () => void;
  saving?: boolean;
}

export default function DeliveryForm({ motherName, subtitle, values, onChange, onSave, saving }: Props) {
  const { t, lang } = useLang();
  const set = <K extends keyof DeliveryFormValues>(k: K) => (val: DeliveryFormValues[K]) =>
    onChange({ ...values, [k]: val });

  const setBaby = (i: number) => <K extends keyof BabyValues>(k: K) => (val: BabyValues[K]) => {
    const babies = values.babies.map((b, j) => (j === i ? { ...b, [k]: val } : b));
    onChange({ ...values, babies });
  };

  const { flags, referral, indicator } = useMemo(() => {
    const input = toDeliveryInput(values);
    const flags = generateDeliveryFlags(input as any);
    return { flags, referral: shouldReferDelivery(flags), indicator: linakes(input as any) };
  }, [values]);

  const emergencies = flags.filter((f) => f.severity === 'EMERGENCY');
  const warnings = flags.filter((f) => f.severity === 'WARNING');
  const opt = (rows: Array<[string, string, string]>) => rows.map((r) => r[0]);
  const labelOf = (rows: Array<[string, string, string]>, v: string) =>
    (rows.find((r) => r[0] === v) ?? rows[0])[lang === 'en' ? 2 : 1];

  return (
    <div style={{ paddingBottom: 130 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 2px' }}>{motherName}</h1>
        {subtitle && <div style={{ fontSize: 13, color: C.dim }}>{subtitle}</div>}
      </header>

      {/* Solid, above everything, the instant a reading is entered. */}
      {emergencies.length > 0 && (
        <div role="alert" style={{
          borderRadius: 11, padding: '14px 16px', marginBottom: 14,
          background: C.red, color: C.onDanger,
        }}>
          {emergencies.map((f, i) => (
            <div key={i} style={{
              fontSize: 13.5, lineHeight: 1.5, fontWeight: 600,
              marginBottom: i < emergencies.length - 1 ? 8 : 0,
            }}>
              {flagMessage(f, lang)}
            </div>
          ))}
        </div>
      )}

      <Section title={t('Persalinan', 'The birth')}>
        <Row>
          <Field label={t('Tanggal', 'Date')} value={values.deliveryDate}
            onChange={set('deliveryDate')} />
          <Field label={t('Jam', 'Time')} value={values.deliveryTime}
            onChange={set('deliveryTime')} placeholder="14:30" />
        </Row>
        {/* The postnatal clock starts here: KF1 is 6–48 hours, not days. */}
        <Hint>{t('Jam persalinan menentukan jadwal KF1 (6–48 jam).',
                 'The time of birth sets the KF1 window (6–48 hours).')}</Hint>
        <Row>
          <Field label={t('Usia kehamilan', 'Gestational age')} unit="mgg"
            value={values.gestationalWeeks} onChange={set('gestationalWeeks')} numeric />
          <Select label={t('Cara persalinan', 'Mode')} value={values.mode}
            onChange={set('mode')} options={opt(MODES)} />
        </Row>
        <Hint>{labelOf(MODES, values.mode)}</Hint>
      </Section>

      {/* These two fields are the entire national indicator. */}
      <Section title={t('Tempat & penolong', 'Place & attendant')}>
        <Select label={t('Tempat', 'Place')} value={values.place}
          onChange={set('place')} options={opt(PLACES)} />
        <Hint>{labelOf(PLACES, values.place)}</Hint>
        <Select label={t('Penolong', 'Attendant')} value={values.attendant}
          onChange={set('attendant')} options={opt(ATTENDANTS)} />
        <Hint>{labelOf(ATTENDANTS, values.attendant)}</Hint>
        <Field label={t('Nama penolong / fasilitas', 'Attendant / facility name')}
          value={values.attendantName} onChange={set('attendantName')} />
        {(values.place || values.attendant) && (
          <Hint warn={!indicator.skilledAttendant}>
            {indicator.skilledAttendant
              ? t('Ditolong tenaga kesehatan ✓', 'Skilled attendant ✓')
              : t('Bukan tenaga kesehatan — pastikan KF & KN dijadwalkan.',
                  'Not a skilled attendant — make sure KF and KN are scheduled.')}
            {indicator.atFacility
              ? t(' · di fasilitas kesehatan', ' · at a health facility')
              : t(' · di luar fasilitas', ' · outside a facility')}
          </Hint>
        )}
      </Section>

      <Section title={t('Ibu', 'The mother')}>
        <Field label={t('Perdarahan', 'Blood loss')} unit="ml"
          value={values.bloodLossMl} onChange={set('bloodLossMl')} numeric />
        <Field label={t('Komplikasi', 'Complications')} value={values.complications}
          onChange={set('complications')}
          placeholder={t('mis. retensio plasenta, robekan', 'e.g. retained placenta, tear')} />
        <Hint>{t('Pisahkan dengan koma.', 'Separate with commas.')}</Hint>
        <Select label={t('Keadaan ibu', 'Mother’s outcome')} value={values.motherOutcome}
          onChange={(v) => set('motherOutcome')(v as DeliveryFormValues['motherOutcome'])}
          options={['hidup', 'mati']} />
        <Hint>{values.motherOutcome === 'mati'
          ? t('Meninggal — wajib dilaporkan (AMP).', 'Died — mandatory notification (AMP).')
          : t('Hidup', 'Alive')}</Hint>
      </Section>

      {values.babies.map((b, i) => (
        <Section key={i} title={values.babies.length > 1
          ? t(`Bayi ${i + 1}`, `Baby ${i + 1}`) : t('Bayi', 'The baby')}>
          <Row>
            <Select label={t('Keadaan', 'Outcome')} value={b.outcome}
              onChange={(v) => setBaby(i)('outcome')(v as BabyValues['outcome'])}
              options={['hidup', 'mati']} />
            <Select label={t('Jenis kelamin', 'Sex')} value={b.sex}
              onChange={(v) => setBaby(i)('sex')(v as BabyValues['sex'])}
              options={['', 'L', 'P']} />
          </Row>

          {/* Everything below is about a living newborn. */}
          {b.outcome !== 'mati' && (
            <>
              <Row>
                <Field label={t('Berat lahir', 'Birth weight')} unit="g"
                  value={b.weightGrams} onChange={setBaby(i)('weightGrams')} numeric
                  placeholder="3100" />
                <Field label={t('Panjang', 'Length')} unit="cm"
                  value={b.lengthCm} onChange={setBaby(i)('lengthCm')} numeric />
              </Row>
              <Tri label={t('Menangis / bernapas spontan?', 'Cried or breathed spontaneously?')}
                value={b.criedImmediately} onChange={setBaby(i)('criedImmediately')} />
              <Tri label={t('IMD dilakukan?', 'Early breastfeeding done?')}
                value={b.imd} onChange={setBaby(i)('imd')} />
              <Row>
                <Tri label={t('Vitamin K1', 'Vitamin K1')}
                  value={b.vitaminK} onChange={setBaby(i)('vitaminK')} />
                <Tri label={t('HB0', 'Hepatitis B0')}
                  value={b.hepatitisB0} onChange={setBaby(i)('hepatitisB0')} />
              </Row>
              <Field label={t('Nama bayi (bila sudah ada)', 'Baby’s name (if chosen)')}
                value={b.name} onChange={setBaby(i)('name')} />
              <Hint>{t('Boleh dikosongkan — bisa diisi nanti.',
                       'May be left blank — it can be added later.')}</Hint>
            </>
          )}
        </Section>
      ))}

      {/* Twins are ordinary, so adding one must not mean starting again. */}
      {values.babies.length < 4 && (
        <button
          type="button"
          onClick={() => onChange({ ...values, babies: [...values.babies, { ...EMPTY_BABY }] })}
          style={{
            width: '100%', minHeight: 48, padding: 12, borderRadius: 10, marginBottom: 14,
            background: 'transparent', color: C.dim, fontSize: 14, fontWeight: 600,
            border: `1.5px dashed ${C.borderStrong}`, cursor: 'pointer',
          }}
        >
          + {t('Tambah bayi (kembar)', 'Add a baby (twins)')}
        </button>
      )}

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
        position: 'fixed', left: 0, right: 0, bottom: 0, padding: 14,
        background: C.bg, borderTop: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 460, margin: '0 auto' }}>
          {referral.refer && (
            <div style={{ fontSize: 12.5, color: C.red, marginBottom: 8, textAlign: 'center', fontWeight: 700 }}>
              {referral.urgency === 'emergency'
                ? t('RUJUKAN DARURAT', 'EMERGENCY REFERRAL')
                : t('Rujukan akan dibuat', 'A referral will be created')}
            </div>
          )}
          <button onClick={onSave} disabled={saving} style={{
            width: '100%', minHeight: 52, padding: 15, fontSize: 15.5, fontWeight: 800,
            borderRadius: 12, background: saving ? C.accentMuted : C.teal,
            color: C.onAccent, border: 'none', cursor: saving ? 'default' : 'pointer',
          }}>
            {saving ? t('Menyimpan…', 'Saving…') : t('Simpan persalinan', 'Save the birth')}
          </button>
        </div>
      </div>
    </div>
  );
}
