'use client';

// components/KnForm.tsx
// The newborn record (KN1–KN3).
//
// This is the first form in the app whose patient is not the mother, and it is
// shaped by three things that are specific to a newborn:
//
//   1. THE DAY OF LIFE IS THE DIAGNOSIS, not just the schedule. The same
//      yellow skin is an emergency on day 1 and an ordinary finding on day 4.
//      So the day is the first field, it is never optional, and it is echoed
//      back next to the findings it changes.
//   2. SHE DECOMPENSATES IN HOURS. Thresholds that are warnings in the mother
//      are emergencies here — 36.5 °C, not 35.5; 37.5 °C, not 38. The danger
//      signs sit at the TOP of the form rather than buried under measurements,
//      because a midwife who only ever fills the first section has still
//      captured the part that saves the baby.
//   3. NOT ASKED IS NOT NORMAL. Every clinical question is three-state. If
//      "not recorded" collapsed into "no danger signs", an examination the
//      midwife never finished would read as a clean bill of health for a baby
//      who might be septic. That is the worst thing this form could do, so
//      nothing here defaults to false.
//
// Weight needs a baseline to mean anything, and most babies will have no
// delivery record in the system — born before the app arrived, or born
// elsewhere. So birth weight is askable here and read off the Buku KIA.

import { useMemo } from 'react';
import { generateKnFlags, shouldReferKn, knForDay } from '@sahaibat/anc-engine';
import { C, Section, Row, Hint, Field, Select, Tri } from './ui';
import { useLang, flagMessage } from '@/lib/lang';

export interface KnFormValues {
  visitType: string;
  dayOfLife: string;
  visitDate: string;
  birthDate: string;

  weightGrams: string;
  birthWeightGrams: string;
  lengthCm: string;
  headCircCm: string;
  temperatureC: string;

  feedingWell: boolean | null;
  cordInfected: boolean | null;
  jaundice: boolean | null;
  jaundicePalmsSoles: boolean | null;
  convulsions: boolean | null;
  fastBreathing: boolean | null;
  chestIndrawing: boolean | null;
  lethargic: boolean | null;

  hepatitisB0: boolean | null;
  bcg: boolean | null;
  polio0: boolean | null;
  vitaminK: boolean | null;
  shkTaken: boolean | null;
  shkResult: '' | 'normal' | 'abnormal' | 'pending';

  note: string;
}

export const EMPTY_KN: KnFormValues = {
  visitType: 'KN1', dayOfLife: '', visitDate: '', birthDate: '',
  weightGrams: '', birthWeightGrams: '', lengthCm: '', headCircCm: '', temperatureC: '',
  feedingWell: null, cordInfected: null, jaundice: null, jaundicePalmsSoles: null,
  convulsions: null, fastBreathing: null, chestIndrawing: null, lethargic: null,
  hepatitisB0: null, bcg: null, polio0: null, vitaminK: null,
  shkTaken: null, shkResult: '', note: '',
};

// Indonesian keyboards produce commas, and this bit has been wrong twice.
const num = (s: string): number | null => {
  const v = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

/**
 * Grams, entered either way.
 *
 * A midwife writes 3,1 in the Buku KIA and 3100 on a scale, and both mean the
 * same baby. Anything under 100 is read as kilograms, because no newborn this
 * app will ever see weighs 3 grams and none weighs 3100 kilograms.
 */
export function toGrams(s: string): number | null {
  const v = num(s);
  if (v == null) return null;
  return v < 100 ? Math.round(v * 1000) : Math.round(v);
}

export function toKnInput(v: KnFormValues) {
  return {
    dayOfLife: num(v.dayOfLife) ?? 0,
    weightGrams: toGrams(v.weightGrams),
    birthWeightGrams: toGrams(v.birthWeightGrams),
    temperatureC: num(v.temperatureC),
    feedingWell: v.feedingWell,
    cordInfected: v.cordInfected,
    jaundice: v.jaundice,
    jaundicePalmsSoles: v.jaundicePalmsSoles,
    convulsions: v.convulsions,
    fastBreathing: v.fastBreathing,
    chestIndrawing: v.chestIndrawing,
    lethargic: v.lethargic,
    hepatitisB0: v.hepatitisB0,
    bcg: v.bcg,
    polio0: v.polio0,
    vitaminK: v.vitaminK,
    shk: v.shkTaken,
  };
}

const SHK_LABEL: Record<string, [string, string]> = {
  '': ['—', '—'],
  normal: ['Normal', 'Normal'],
  abnormal: ['Tidak normal — rujuk', 'Abnormal — refer'],
  pending: ['Menunggu hasil', 'Awaiting result'],
};

interface Props {
  babyName: string;
  subtitle?: string | null;
  values: KnFormValues;
  onChange: (v: KnFormValues) => void;
  onSave: () => void;
  saving?: boolean;
}

export default function KnForm({ babyName, subtitle, values, onChange, onSave, saving }: Props) {
  const { t, lang } = useLang();
  const set = <K extends keyof KnFormValues>(k: K) => (val: KnFormValues[K]) =>
    onChange({ ...values, [k]: val });

  const day = num(values.dayOfLife);
  const suggestedKn = day != null ? knForDay(day) : null;

  const { flags, referral } = useMemo(() => {
    const input = toKnInput(values);
    const f = generateKnFlags(input as any);
    return { flags: f, referral: shouldReferKn(f) };
  }, [values]);

  const emergencies = flags.filter((f) => f.severity === 'EMERGENCY');
  const warnings = flags.filter((f) => f.severity === 'WARNING');

  // Shown live, because a midwife should not have to do this arithmetic on a
  // doorstep. Up to 10% is physiological; past it is a feeding problem.
  const w = toGrams(values.weightGrams);
  const bw = toGrams(values.birthWeightGrams);
  const lostPct = (w != null && bw != null && bw > 0 && w < bw)
    ? ((bw - w) / bw) * 100 : null;

  return (
    <div style={{ paddingBottom: 120 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 2px' }}>{babyName}</h1>
        {subtitle && <div style={{ fontSize: 13, color: C.dim }}>{subtitle}</div>}
      </header>

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

      <Section title={t('Kunjungan neonatal', 'Newborn visit')}>
        <Row>
          <Select label={t('Jenis', 'Type')} value={values.visitType} onChange={set('visitType')}
            options={['KN1', 'KN2', 'KN3']} />
          <Field label={t('Usia (hari)', 'Age (days)')} value={values.dayOfLife}
            onChange={set('dayOfLife')} numeric placeholder={t('mis. 3', 'e.g. 3')} />
        </Row>
        <Hint>{t('KN1 hari 0–2 · KN2 hari 3–7 · KN3 hari 8–28.',
                  'KN1 days 0–2 · KN2 days 3–7 · KN3 days 8–28.')}</Hint>
        {suggestedKn && suggestedKn !== values.visitType && (
          <Hint warn>
            {t(`Hari ke-${day} biasanya ${suggestedKn}. Ubah jika perlu — kunjungan terlambat tetap dicatat.`,
               `Day ${day} is usually ${suggestedKn}. Change it if needed — a late visit is still recorded.`)}
          </Hint>
        )}
        {day != null && day > 28 && (
          <Hint warn>
            {t(`Hari ke-${day} sudah di luar masa neonatal (28 hari). Kunjungan tetap dicatat dan tetap dihitung.`,
               `Day ${day} is past the neonatal period (28 days). The visit is still recorded and still counts.`)}
          </Hint>
        )}
      </Section>

      {/* ── FIRST, because a form only half filled must still have caught
          these. MTBM: any one of them is a referral on its own. ── */}
      <Section title={t('Tanda bahaya', 'Danger signs')}>
        <Tri label={t('Mau menyusu?', 'Feeding well?')} value={values.feedingWell}
          onChange={set('feedingWell')} yes={t('Mau', 'Yes')} no={t('Tidak / lemah', 'No / weak')} />
        <Tri label={t('Kejang?', 'Convulsions?')} value={values.convulsions} onChange={set('convulsions')} />
        <Tri label={t('Bergerak hanya bila dirangsang?', 'Moves only when stimulated?')}
          value={values.lethargic} onChange={set('lethargic')} />
        <Tri label={t('Napas cepat (≥ 60/menit)?', 'Fast breathing (≥ 60/min)?')}
          value={values.fastBreathing} onChange={set('fastBreathing')} />
        <Tri label={t('Tarikan dinding dada?', 'Chest indrawing?')}
          value={values.chestIndrawing} onChange={set('chestIndrawing')} />
        <Hint>{t('Satu tanda saja sudah cukup untuk merujuk. "Tidak ditanya" bukan berarti tidak ada.',
                  'Any one of these is enough to refer. "Not asked" does not mean absent.')}</Hint>
      </Section>

      <Section title={t('Suhu', 'Temperature')}>
        <Field label={t('Suhu', 'Temperature')} unit="°C" value={values.temperatureC}
          onChange={set('temperatureC')} numeric placeholder={t('mis. 36,8', 'e.g. 36.8')} />
        <Hint>{t('Normal 36,5–37,4 °C. Bayi baru lahir tidak bisa menghangatkan dirinya sendiri — dingin sama berbahayanya dengan demam.',
                  'Normal 36.5–37.4 °C. A newborn cannot rewarm herself — cold is as dangerous as fever.')}</Hint>
      </Section>

      <Section title={t('Berat badan', 'Weight')}>
        <Row>
          <Field label={t('Berat sekarang', 'Weight now')} unit="g" value={values.weightGrams}
            onChange={set('weightGrams')} numeric placeholder={t('mis. 3100 atau 3,1', 'e.g. 3100 or 3.1')} />
          <Field label={t('Berat lahir', 'Birth weight')} unit="g" value={values.birthWeightGrams}
            onChange={set('birthWeightGrams')} numeric placeholder={t('dari Buku KIA', 'from the Buku KIA')} />
        </Row>
        {lostPct != null && (
          <Hint warn={lostPct > 10}>
            {t(`Turun ${lostPct.toFixed(0)}% dari berat lahir${lostPct > 10 ? ' — lebih dari 10%.' : ' — masih normal (sampai 10%).'}`,
               `Down ${lostPct.toFixed(0)}% from birth weight${lostPct > 10 ? ' — more than 10%.' : ' — still normal (up to 10%).'}`)}
          </Hint>
        )}
        <Row>
          <Field label={t('Panjang', 'Length')} unit="cm" value={values.lengthCm}
            onChange={set('lengthCm')} numeric />
          <Field label={t('Lingkar kepala', 'Head circumference')} unit="cm" value={values.headCircCm}
            onChange={set('headCircCm')} numeric />
        </Row>
      </Section>

      <Section title={t('Tali pusat & kulit', 'Cord & skin')}>
        <Tri label={t('Tali pusat merah / bernanah / berbau?', 'Cord red, discharging or foul?')}
          value={values.cordInfected} onChange={set('cordInfected')} />
        <Tri label={t('Kuning (ikterus)?', 'Jaundice?')} value={values.jaundice} onChange={set('jaundice')} />
        {values.jaundice === true && (
          <>
            <Tri label={t('Sampai telapak tangan / kaki?', 'Reaching palms or soles?')}
              value={values.jaundicePalmsSoles} onChange={set('jaundicePalmsSoles')} />
            <Hint warn={day != null && day <= 1}>
              {day != null && day <= 1
                ? t('Ikterus pada hari pertama selalu patologis — rujuk.',
                    'Jaundice on the first day is always pathological — refer.')
                : t('Kuning pada hari ke-2 sampai ke-14 umumnya fisiologis; setelah 14 hari perlu pemeriksaan.',
                    'Jaundice on days 2–14 is usually physiological; past 14 days it needs assessment.')}
            </Hint>
          </>
        )}
      </Section>

      {/* Carried from the birth record where it exists, so she is not asked
          twice — but askable here, because most babies have no birth record
          in this system at all. */}
      <Section title={t('Pelayanan wajib', 'Mandated newborn care')}>
        <Tri label={t('Vitamin K1 diberikan?', 'Vitamin K1 given?')} value={values.vitaminK} onChange={set('vitaminK')} />
        <Tri label={t('HB0 diberikan?', 'Hepatitis B0 given?')} value={values.hepatitisB0} onChange={set('hepatitisB0')} />
        <Tri label={t('BCG diberikan?', 'BCG given?')} value={values.bcg} onChange={set('bcg')} />
        <Tri label={t('Polio 0 diberikan?', 'Polio 0 given?')} value={values.polio0} onChange={set('polio0')} />
      </Section>

      <Section title={t('Skrining hipotiroid (SHK)', 'Congenital hypothyroid screening (SHK)')}>
        <Tri label={t('Sampel sudah diambil?', 'Sample taken?')} value={values.shkTaken} onChange={set('shkTaken')} />
        <Hint>{t('Tusuk tumit, idealnya usia 48–72 jam.', 'Heel prick, ideally at 48–72 hours.')}</Hint>
        {values.shkTaken === true && (
          <>
            <Select label={t('Hasil', 'Result')} value={values.shkResult}
              onChange={(v) => set('shkResult')(v as KnFormValues['shkResult'])}
              options={['', 'pending', 'normal', 'abnormal']} />
            <Hint>{(SHK_LABEL[values.shkResult] ?? ['—', '—'])[lang === 'en' ? 1 : 0]}</Hint>
            {/* The sample and the result are weeks apart, so an empty result
                is the normal state for most of the first month. */}
            <Hint>{t('Hasil biasanya baru keluar beberapa minggu kemudian — kosongkan jika belum ada.',
                      'The result usually comes back weeks later — leave it blank until then.')}</Hint>
          </>
        )}
      </Section>

      <Section title={t('Catatan', 'Notes')}>
        <Field label={t('Catatan', 'Note')} value={values.note} onChange={set('note')}
          placeholder={t('mis. ibu perlu bantuan perlekatan', 'e.g. mother needs help with attachment')} />
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
            {saving ? t('Menyimpan…', 'Saving…') : t('Simpan kunjungan neonatal', 'Save newborn visit')}
          </button>
        </div>
      </div>
    </div>
  );
}
