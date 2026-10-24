'use client';

// components/KbForm.tsx
// Family planning, as a midwife records it.
//
// WHY A MIDWIFE FORM AT ALL
//
// Sanjib, on how this works in practice: "In indonesia Bidan clinics both
// bidan and doctor handles family planning. The roles are not divided." So
// this is not a referral form that hands a woman to a doctor — it records what
// the midwife herself counselled, chose and provided, in the same shape the
// clinic records it, and v_kb unions the two into one list.
//
// WHAT IT ASKS, AND WHY IT IS SHORT
//
// The engine reads seven facts: counselled, method, selected, provided, device
// life, follow-up, ended. Everything here exists to fill one of those, plus
// breastfeeding — which is not administrative, it decides which methods are
// available at all.
//
// It deliberately does NOT ask the screening questions dok_kb_episodes carries.
// Those belong to a clinic consultation; on a doorstep they would be a page of
// blanks, and a form that always looks unfinished gets abandoned.
//
// COUNSELLED AND CHOSE NOTHING IS AN OUTCOME
//
// The commonest real result of a family planning conversation is that she goes
// away to think, and most models lose it by treating counselling as step one of
// acceptance. Here the method is optional: counselling alone saves, and the
// engine reports her as counselledWithoutChoosing — somebody to follow up,
// not an unfinished form.

import { useMemo } from 'react';
import {
  KB_METHODS, kbMethod, dueFor, nextStep, counselledWithoutChoosing,
  KB_END_REASONS, formulationsFor, needsFormulation, dueForFormulation,
  type KbMethodCode, type KbFormulationCode,
} from '@sahaibat/anc-engine';
import { C, Section, Field, Select, Tri, Hint } from '@/components/ui';
import { useLang } from '@/lib/lang';

export interface KbFormValues {
  visitDate: string;

  /** The conversation happened. True on its own is a complete record. */
  counselled: boolean;

  /** Empty means counselled and chose nothing — a real outcome, not a blank. */
  methodCode: '' | KbMethodCode;
  /**
   * Which formulation of the method.
   *
   * Kemenkes publishes its eligibility lists on this axis, not on the method:
   * separate lists for pil kombinasi and pil progestin, for AKDR Copper and
   * AKDR-LNG. It also decides the repeat interval where DMPA and NET-EN share
   * one method code and differ by thirty days.
   *
   * Empty means UNRECORDED, which is not the same as the commoner one.
   */
  formulationCode: '' | KbFormulationCode;
  /** Brand or packet, free text. A contraceptive catalogue is its own work. */
  product: string;
  /** Provided today: pills handed over, injection given, device placed. */
  provided: boolean;
  /** With its unit written in: three cycles and 0,5 mL are not one number. */
  quantity: string;
  /**
   * The life of the device as SHE recorded it, in months.
   *
   * Asked only for a device, and never defaulted. The engine refuses to
   * compute an expiry without it rather than guessing, because a device
   * removed years early or left years late is the exact harm a reminder exists
   * to prevent.
   */
  deviceMonths: string;

  /** Decides which methods are available. Three-state: not asked is a state. */
  isBreastfeeding: boolean | null;

  /** Overridable. The engine suggests it; her diary is the authority. */
  followUpDue: string;

  /** Ending an episode is its own act, with its own reason. */
  ended: boolean;
  endReason: '' | string;

  note: string;
}

export const EMPTY_KB: KbFormValues = {
  visitDate: '',
  counselled: true,
  methodCode: '',
  formulationCode: '',
  product: '',
  provided: false,
  quantity: '',
  deviceMonths: '',
  isBreastfeeding: null,
  followUpDue: '',
  ended: false,
  endReason: '',
  note: '',
};

function num(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  // Number('') is 0 and so is Number(null). The guard above is why this is safe.
  return Number.isFinite(n) ? n : null;
}

/**
 * The seven facts, as the engine wants them.
 *
 * Dates are stamped from the VISIT DATE, not from now(): a visit queued on a
 * doorstep and synced three days later must not record the counselling as
 * having happened at sync.
 */
export function toKbFacts(v: KbFormValues) {
  const on = v.visitDate || null;
  return {
    counselled_at: v.counselled ? on : null,
    method_code: v.methodCode || null,
    formulation_code: v.formulationCode || null,
    selected_at: v.methodCode ? on : null,
    provided_at: v.provided && v.methodCode ? on : null,
    device_months: num(v.deviceMonths),
    follow_up_due: v.followUpDue || null,
    ended_at: v.ended ? on : null,
    end_reason: v.ended ? (v.endReason || null) : null,
  };
}

interface Props {
  motherName: string;
  subtitle?: string;
  /** Her delivery date, where there is one, for the KBPP window. */
  kbppNote?: string | null;
  values: KbFormValues;
  onChange: (v: KbFormValues) => void;
  onSave: () => void;
  saving?: boolean;
}

export default function KbForm({
  motherName, subtitle, kbppNote, values, onChange, onSave, saving,
}: Props) {
  const { t } = useLang();

  const set = <K extends keyof KbFormValues>(k: K) => (val: KbFormValues[K]) => {
    const next = { ...values, [k]: val };

    /* ── A HIDDEN ANSWER IS STILL AN ANSWER ────────────────────────────────
       The same trap the newborn form documents. Clearing the method clears
       what only applied to it, rather than leaving a device life and a
       quantity attached to "chose nothing" — a record that contradicts
       itself from one corrected tap. */
    if (k === 'methodCode') {
      const m = val ? kbMethod(val as string) : null;
      if (!m || !m.device) next.deviceMonths = '';
      if (!val) { next.provided = false; next.quantity = ''; next.product = ''; }
      // A KPK left attached to an AKDR is a record that contradicts itself.
      next.formulationCode = '';
    }
    if (k === 'ended' && val !== true) next.endReason = '';

    onChange(next);
  };

  const method = values.methodCode ? kbMethod(values.methodCode) : null;

  /* Suggested, never imposed. dueFor() reads the facts and returns a kind as
     well as a date — a refill, an injection, a device expiry or a review —
     and they are different sentences to a woman. */
  const due = useMemo(() => {
    const facts = toKbFacts(values);
    if (!facts.provided_at) return null;
    return dueForFormulation(
      { ...facts, provided_at: facts.provided_at } as any,
      values.formulationCode || null,
      values.visitDate || undefined,
    );
  }, [values]);

  const step = useMemo(() => nextStep(toKbFacts(values) as any), [values]);
  const parkedAfterCounselling = counselledWithoutChoosing(toKbFacts(values) as any);

  const DUE_WORDS: Record<string, { id: string; en: string }> = {
    refill: { id: 'Pil habis', en: 'Pills run out' },
    injection: { id: 'Suntik berikutnya', en: 'Next injection' },
    device_expiry: { id: 'Masa alat berakhir', en: 'Device reaches end of life' },
    review: { id: 'Harus ditinjau ulang', en: 'Must be reviewed' },
    none: { id: 'Tidak berulang', en: 'Does not recur' },
  };

  return (
    <div style={{ paddingBottom: 120 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 2px' }}>{motherName}</h1>
        {subtitle && <div style={{ fontSize: 13, color: C.dim }}>{subtitle}</div>}
      </header>

      {/* ── THE KBPP WINDOW ────────────────────────────────────────────────
          Forty-two days after delivery, and it is the window that matters
          most: a woman who leaves without a method is the one who returns
          pregnant. Shown at the top rather than buried, and computed from the
          delivery date by the engine rather than stored, so a corrected
          delivery date corrects the window. */}
      {kbppNote && (
        <div style={{
          borderRadius: 11, padding: '12px 14px', marginBottom: 14,
          background: C.card2, border: `1px solid ${C.border}`,
          fontSize: 13.5, lineHeight: 1.55, color: C.white,
        }}>
          {kbppNote}
        </div>
      )}

      <Section title={t('Konseling', 'Counselling')}>
        <Tri
          label={t('Konseling KB dilakukan hari ini', 'Family planning counselled today')}
          value={values.counselled}
          onChange={(v) => set('counselled')(v === true)}
        />
        {parkedAfterCounselling && (
          <Hint>
            {t('Tercatat sebagai: sudah dikonseling, belum memilih. Ini hasil yang sah — beliau perlu ditindaklanjuti, bukan formulir yang belum selesai.',
               'Recorded as: counselled, chose nothing. That is a legitimate outcome — she is someone to follow up, not an unfinished form.')}
          </Hint>
        )}
      </Section>

      <Section
        title={t('Metode', 'Method')}
        note={t('Boleh dikosongkan kalau beliau belum memilih.',
                'Can be left empty if she has not chosen.')}
      >
        <Select
          label={t('Metode yang dipilih', 'Method chosen')}
          value={values.methodCode}
          onChange={(v) => set('methodCode')(v as any)}
          options={[
            ['', t('— belum memilih —', '— not chosen —')],
            ...KB_METHODS.map((m) => [m.code, t(m.label_id, m.label_en)] as [string, string]),
          ]}
        />

        {method && needsFormulation(values.methodCode) && (
          <>
            <Select
              label={t('Jenis / formulasi', 'Formulation')}
              value={values.formulationCode}
              onChange={(v) => set('formulationCode')(v as any)}
              options={[
                ['', t('— belum dicatat —', '— not recorded —')],
                ...formulationsFor(values.methodCode).map(
                  (f) => [f.code, t(f.label_id, f.label_en)] as [string, string]),
              ]}
            />
            {!values.formulationCode && (
              <Hint warn>
                {t('Jenisnya menentukan jadwal suntik/kontrol berikutnya dan penapisan kelayakan. Isi kalau tahu.',
                   'The formulation decides the next dose date and the eligibility screening. Fill it in if you know it.')}
              </Hint>
            )}
          </>
        )}

        {method && (
          <>
            <Field
              label={t('Merek / produk', 'Brand or product')}
              value={values.product}
              onChange={set('product')}
              placeholder={t('opsional', 'optional')}
            />
            <Tri
              label={t('Diberikan hari ini', 'Provided today')}
              value={values.provided}
              onChange={(v) => set('provided')(v === true)}
            />
            {values.provided && (
              <Field
                label={t('Jumlah', 'Quantity')}
                value={values.quantity}
                onChange={set('quantity')}
                placeholder={t('mis. 3 siklus / 0,5 mL', 'e.g. 3 cycles / 0.5 mL')}
              />
            )}
            {method.device && (
              <>
                <Field
                  label={t('Masa pakai alat (bulan)', 'Device life (months)')}
                  value={values.deviceMonths}
                  onChange={set('deviceMonths')}
                  numeric
                  placeholder={t('mis. 36', 'e.g. 36')}
                />
                {!values.deviceMonths && (
                  <Hint warn>
                    {t('Tanpa masa pakai, tanggal pelepasan tidak bisa dihitung. Implan 3 tahun dan 5 tahun berbeda menurut produknya — tulis yang tertera.',
                       'Without the device life no removal date can be computed. A three-year and a five-year implant differ by product — write what the packet says.')}
                  </Hint>
                )}
              </>
            )}
            {method.removal_is_a_procedure && (
              <Hint>
                {t('Pelepasan alat ini adalah tindakan tersendiri, bukan sekadar berhenti.',
                   'Removing this is itself a procedure, not simply stopping.')}
              </Hint>
            )}
          </>
        )}
      </Section>

      <Section
        title={t('Menyusui', 'Breastfeeding')}
        note={t('Menentukan metode mana yang boleh dipakai, bukan catatan administrasi.',
                'This decides which methods are available, not an administrative note.')}
      >
        <Tri
          label={t('Sedang menyusui', 'Currently breastfeeding')}
          value={values.isBreastfeeding}
          onChange={set('isBreastfeeding')}
        />
      </Section>

      <Section title={t('Tindak lanjut', 'Follow-up')}>
        {due && (
          <Hint>
            {t(
              `${DUE_WORDS[due.kind]?.id ?? due.kind}${due.due_date ? ` — ${due.due_date}` : ''}${due.reason ? ' (tanggal tidak bisa dihitung)' : ''}`,
              `${DUE_WORDS[due.kind]?.en ?? due.kind}${due.due_date ? ` — ${due.due_date}` : ''}${due.reason ? ' (no date can be computed)' : ''}`,
            )}
          </Hint>
        )}
        <Field
          label={t('Tanggal kontrol', 'Follow-up date')}
          value={values.followUpDue}
          onChange={set('followUpDue')}
          placeholder="YYYY-MM-DD"
        />
        {due?.due_date && !values.followUpDue && (
          <Hint>
            {t(`Saran mesin: ${due.due_date}. Isi kalau beliau sepakat.`,
               `Suggested: ${due.due_date}. Fill it in if she agrees.`)}
          </Hint>
        )}
      </Section>

      <Section
        title={t('Mengakhiri metode', 'Ending the method')}
        note={t('Hanya kalau beliau berhenti atau berganti cara hari ini.',
                'Only if she stops or switches today.')}
      >
        <Tri
          label={t('Metode dihentikan hari ini', 'Method ended today')}
          value={values.ended}
          onChange={(v) => set('ended')(v === true)}
        />
        {values.ended && (
          <Select
            label={t('Alasan', 'Reason')}
            value={values.endReason}
            onChange={set('endReason')}
            options={[
              ['', t('— pilih —', '— choose —')],
              ...KB_END_REASONS.map((r) => {
                const w = END_LABELS[r];
                return [r, w ? t(w[0], w[1]) : r] as [string, string];
              }),
            ]}
          />
        )}
        {values.ended && values.endReason === 'ganti_cara' && (
          <Hint>
            {t('Berganti cara dicatat sebagai dua episode: yang ini berakhir, lalu catat metode barunya. Riwayat pergantiannya yang justru perlu dibaca nanti.',
               'A switch is two episodes: this one ends, then record the new method. The fact that she switched is the part worth reading later.')}
          </Hint>
        )}
      </Section>

      <Section title={t('Catatan', 'Note')}>
        <Field label={t('Catatan bidan', 'Midwife’s note')} value={values.note} onChange={set('note')} />
      </Section>

      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, padding: 16,
        background: C.bg, borderTop: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div style={{ fontSize: 12, color: C.dimmer, marginBottom: 8 }}>
            {STEP_WORDS[step] ? t(STEP_WORDS[step][0], STEP_WORDS[step][1]) : ''}
          </div>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              width: '100%', padding: 15, borderRadius: 11, background: C.teal,
              color: C.onAccent, fontWeight: 700, fontSize: 15.5, border: 'none',
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? t('Menyimpan…', 'Saving…') : t('Simpan catatan KB', 'Save family planning record')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Indonesian first, because the midwife reads that one. */
const END_LABELS: Record<string, [string, string]> = {
  ganti_cara: ['Ganti cara', 'Switched method'],
  efek_samping: ['Efek samping', 'Side effects'],
  ingin_hamil: ['Ingin hamil', 'Wants to conceive'],
  habis_masa: ['Masa pakai habis', 'Device life ended'],
  dilepas_medis: ['Dilepas atas indikasi medis', 'Removed on medical grounds'],
  tidak_lanjut: ['Tidak melanjutkan', 'Stopped coming'],
  menopause: ['Menopause', 'Menopause'],
  lainnya: ['Lainnya', 'Other'],
};

/** What is still missing, in her words rather than the engine's. */
const STEP_WORDS: Record<string, [string, string]> = {
  counsel: ['Belum ada yang tercatat.', 'Nothing recorded yet.'],
  select: ['Sudah dikonseling, belum memilih metode.', 'Counselled, no method chosen.'],
  provide: ['Metode dipilih, belum diberikan.', 'Method chosen, not yet provided.'],
  schedule_follow_up: ['Sudah diberikan — tanggal kontrol belum diisi.', 'Provided — no follow-up date yet.'],
  complete: ['Lengkap.', 'Complete.'],
  ended: ['Episode ini ditutup.', 'This episode is closed.'],
};
