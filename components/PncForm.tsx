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
import { generatePncFlags, shouldReferPnc, kfForDay, KBPP_DAYS } from '@sahaibat/anc-engine';
import { C, Section, Row, Hint, Field, Select, Tri } from './ui';
import { useLang, flagMessage } from '@/lib/lang';
import ReferralFollowUp from './ReferralFollowUp';
import { followUpQuestion, type OpenReferral, type ArrivalAnswer } from '@/lib/referral-followup';

export interface PncFormValues {
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
  /* ── A REFUSAL SHE MADE, NOT AN ABSENCE OF INFORMATION ─────────────────
     null means she did not refuse — never that she accepted. See the control
     above the save button and sql/j5-referral-declined.sql. */
  referralDeclined: boolean | null;
  referralDeclineReason: string;
  complaints: string;
  followupPlan: string;
}

export const EMPTY_PNC: PncFormValues = {
  referralAnswer: '', referralNote: '',
  visitType: 'KF1', daysPostpartum: '',
  bpSystolic: '', bpDiastolic: '', temperatureC: '',
  bleeding: '', lochiaFoul: null, woundInfected: null,
  breastfeedingEstablished: null, babyWeightKg: '', jaundiceSevere: null,
  epdsScore: '', fpCounselling: null,
  referralDeclined: null, referralDeclineReason: '',
  complaints: '', followupPlan: '',
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
  /**
   * A referral she made that nobody has closed, from the cached register.
   *
   * Optional, so a caller that does not have one — a new mother with no
   * history — renders no question rather than an empty panel.
   */
  openReferral?: OpenReferral | null;
  subtitle?: string | null;
  /**
   * Open her family-planning screen. Absent where there is nothing to open —
   * a mother being registered for the first time has no member id until the
   * visit syncs, so /pnc/baru offers the window and not the button. An
   * invitation that leads nowhere is worse than none.
   */
  onStartKb?: (() => void) | null;
  values: PncFormValues;
  onChange: (v: PncFormValues) => void;
  onSave: () => void;
  saving?: boolean;
}

export default function PncForm({ motherName, subtitle, values, onChange, onSave, saving, openReferral, onStartKb }: Props) {
  const { t, lang } = useLang();
  const set = <K extends keyof PncFormValues>(k: K) => (val: PncFormValues[K]) =>
    onChange({ ...values, [k]: val });

  const days = num(values.daysPostpartum);
  const suggestedKf = days != null ? kfForDay(days) : null;

  /* ── THE KBPP WINDOW, ON THE SCREEN WHERE SHE IS SITTING ────────────────
     KBPP is contraception started within 42 days of delivery, and it is the
     single most time-limited thing on a postnatal visit — yet this screen
     asked "Konseling KB diberikan? Tidak / Ya" and never said how much of the
     window was left (case C-03). The day count was already here in
     daysPostpartum; nothing was done with it.

     Computed from the day count rather than kbppWindow(), because this form
     has the day and not the delivery date. KBPP_DAYS is the engine's, so the
     two cannot drift on the number that matters. The 7-day "closing" warning
     matches kbppWindow's, for the same reason it exists there: a window that
     announces itself on the last day announces nothing. */
  const kbpp = days == null || days < 0 ? null : {
    day: days,
    left: KBPP_DAYS - days,
    state: days > KBPP_DAYS ? 'closed' : days >= KBPP_DAYS - 7 ? 'closing' : 'open',
  } as const;

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

      {/* Yellow goes where red goes -- the top. BUG-12 was fixed on the
          antenatal form and left standing on every other one, which is how it
          came back twice. A warning below a screen of inputs is read after the
          decision it was meant to inform. */}
      {warnings.length > 0 && (
        <div style={{
          border: `1px solid ${C.amber}`, borderRadius: 11, padding: '12px 14px',
          background: C.amberSoft, marginBottom: 14,
        }}>
          {warnings.map((f, i) => (
            <div key={i} style={{
              fontSize: 13, lineHeight: 1.5, color: C.white,
              marginBottom: i < warnings.length - 1 ? 7 : 0,
            }}>
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
          /* ── THE LABELS WERE ALWAYS THERE ────────────────────────────────
             This passed the raw values, so the picker read "none / normal /
             high" to a midwife working in Indonesian while the correct words
             sat in the Hint one line below it. Exactly the delivery-dropdown
             bug, in the one form it was not fixed in. */
          options={(['', 'none', 'normal', 'high'] as const).map((k) =>
            [k, k === '' ? '—' : BLEEDING_LABEL[k][lang === 'en' ? 1 : 0]] as [string, string])}
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
        {kbpp && (
          <div style={{
            marginTop: 10, padding: '11px 13px', borderRadius: 11,
            background: C.card2, fontSize: 13.5, lineHeight: 1.55, color: C.white,
            border: `1px solid ${kbpp.state === 'closed' ? C.border
              : kbpp.state === 'closing' ? C.amber : C.ok}`,
          }}>
            <strong>
              {t(`KB pascasalin — hari ke-${kbpp.day} dari ${KBPP_DAYS}`,
                 `Postpartum family planning — day ${kbpp.day} of ${KBPP_DAYS}`)}
            </strong>
            <div style={{ color: kbpp.state === 'closing' ? C.amber : C.dim, fontSize: 12.5, marginTop: 3 }}>
              {kbpp.state === 'closed'
                ? t(`Jendela KBPP sudah lewat ${-kbpp.left} hari. KB tetap bisa dimulai — hanya tidak lagi tercatat sebagai KBPP.`,
                    `The KBPP window closed ${-kbpp.left} days ago. She can still start family planning — it is simply no longer counted as KBPP.`)
                : kbpp.state === 'closing'
                  ? t(`Tinggal ${kbpp.left} hari. Konseling perlu satu kunjungan untuk diatur — tawarkan hari ini.`,
                      `${kbpp.left} days left. Counselling takes a visit to arrange — offer it today.`)
                  : t(`Tersisa ${kbpp.left} hari. Waktu terbaik menawarkan konseling KB.`,
                      `${kbpp.left} days left. This is the time to offer family planning counselling.`)}
            </div>
            {/* THE INVITATION. The Tri below records that counselling happened;
                it was never a way to DO it, so a midwife answering "Ya" had to
                know on her own that a KB screen existed elsewhere. */}
            {onStartKb && (
              <button type="button" onClick={onStartKb} style={{
                marginTop: 9, width: '100%', minHeight: 44, borderRadius: 10,
                background: kbpp.state === 'closed' ? 'transparent' : C.teal,
                color: kbpp.state === 'closed' ? C.dim : C.onAccent,
                border: `1px solid ${kbpp.state === 'closed' ? C.border : C.teal}`,
                fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
              }}>
                {t('Buka konseling KB', 'Open family planning counselling')}
              </button>
            )}
          </div>
        )}
        <Tri label={t('Konseling KB diberikan?', 'Family planning counselling given?')} value={values.fpCounselling} onChange={set('fpCounselling')} />
      </Section>

      <Section title={t('Catatan', 'Notes')}>
        <Field label={t('Keluhan', 'Complaints')} value={values.complaints} onChange={set('complaints')}
          placeholder={t('mis. nyeri perut, demam', 'e.g. abdominal pain, fever')} />
        <Field label={t('Tindak lanjut', 'Follow-up')} value={values.followupPlan} onChange={set('followupPlan')} />
      </Section>

      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, padding: '12px 16px 18px',
        background: 'linear-gradient(to top, var(--on-accent) 62%, rgba(4,36,30,0))',
      }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          {/* ── SHE SAID NO ──────────────────────────────────────────────
              A referral is advised and the woman declines — in the room, during
              this conversation, not days later. The product could record that
              she never arrived and had no way at all to record that she refused
              (case J-05, 25 Oct 2026): nothing on the referral screen, nothing
              in the letter, nothing in her record.

              IT SITS HERE, BEFORE SAVE, and not on the referral panel that
              follows it. The panel appears after the visit is already queued and
              possibly already uploaded, so a refusal captured there would need a
              second write and a second way to fail. Captured here it travels
              with the visit, reaches the server in the same request that creates
              the referral, and works with no signal at all — which is the state
              she is usually in when this matters.

              NEVER A BLOCK. Recording a refusal does not cancel the referral or
              the letter: she may still change her mind, and the midwife should
              still be able to hand her the paper. It records a decision; it
              refuses nothing. */}
          {referral.refer && (
            <div style={{
              marginBottom: 8, padding: '10px 12px', borderRadius: 10,
              background: C.card2, border: `1px solid ${values.referralDeclined ? C.amber : C.border}`,
              textAlign: 'left',
            }}>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={values.referralDeclined === true}
                  onChange={(e) => onChange({
                    ...values,
                    referralDeclined: e.target.checked ? true : null,
                    // Clearing the tick clears the reason, so a stale reason
                    // cannot be filed against a refusal she did not make.
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
