'use client';

// components/SkipReasons.tsx
// What was not done, and why.
//
// THE POINT OF THIS SCREEN
// ------------------------
// A 10T score of 6/10 tells a midwife she has failed at four things. It is
// almost never true. She did not measure the blood pressure because the cuff
// has been broken since March; she did not give iron because the Puskesmas has
// had no stock for six weeks; the mother refused the blood test. None of that
// is visible in a 6, and a number that blames her for a supply chain she does
// not control is a number she will learn to game.
//
// So the score is never the last word. When something expected is missing she
// is asked why, in one tap, and the answer is stored beside the visit. Two
// things change as a result:
//
//   For her, the score stops being an accusation. "Stok habis" recorded
//   against T5 is a fact about the district, not a mark against her.
//
//   For everyone above her, forty stock-outs in one sub-district in one month
//   stop being an anecdote and become a report. That figure has never existed,
//   because the reason was never captured anywhere — the national system
//   records only whether the service happened.
//
// SHE CAN ALWAYS SAVE. This sheet never blocks. A midwife holding a bleeding
// woman must be able to record the visit and leave, and "Lewati" is one tap
// away. A prompt that can trap her would be abandoned in the field within a
// week, and then nothing at all would be recorded.

import { useState } from 'react';
import { C } from './ui';
import { useLang } from '@/lib/lang';

/**
 * The reasons, in the order a midwife is likeliest to need them.
 *
 * These are causes, not excuses, and they are deliberately about the SYSTEM
 * first: the first three are things nobody at the village can fix, and they
 * are the ones worth counting. "Ibu menolak" sits below them because a refusal
 * is a real clinical event that needs a different response — counselling, not
 * procurement.
 */
export const SKIP_REASONS: Array<{ code: string; id: string; en: string }> = [
  { code: 'alat_rusak',  id: 'Alat rusak / tidak ada', en: 'Equipment broken or absent' },
  { code: 'stok_habis',  id: 'Stok habis',             en: 'Out of stock' },
  { code: 'lab_jauh',    id: 'Lab jauh / tidak ada',   en: 'Lab far away or unavailable' },
  { code: 'ibu_menolak', id: 'Ibu menolak',            en: 'Mother declined' },
  { code: 'tidak_perlu', id: 'Belum perlu kali ini',   en: 'Not indicated this visit' },
  { code: 'darurat',     id: 'Situasi darurat',        en: 'Emergency took priority' },
  { code: 'lainnya',     id: 'Lainnya',                en: 'Other' },
];

export type SkipReasonMap = Record<string, string>;   // standard code -> reason code

interface Props {
  /** Standard codes still missing, e.g. ['t2','t5']. */
  missing: string[];
  /** Human names for those codes, in the current language. */
  nameOf: (code: string) => string;
  value: SkipReasonMap;
  onChange: (v: SkipReasonMap) => void;
  /** Save with whatever has been answered — always available. */
  onConfirm: () => void;
  /** Go back and fill the fields in instead. */
  onCancel: () => void;
  saving?: boolean;
}

export default function SkipReasons({
  missing, nameOf, value, onChange, onConfirm, onCancel, saving,
}: Props) {
  const { t, lang } = useLang();
  const [openFor, setOpenFor] = useState<string | null>(missing[0] ?? null);

  const answered = missing.filter((m) => value[m]).length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(4,20,17,.72)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 480, maxHeight: '88dvh', overflowY: 'auto',
        background: C.card, borderRadius: '16px 16px 0 0',
        border: `1px solid ${C.border}`, borderBottom: 'none',
        padding: '20px 18px 24px',
      }}>
        <h2 style={{ fontSize: 17, margin: '0 0 4px', letterSpacing: '-.01em' }}>
          {t('Ada yang belum tercatat', 'Something is not recorded')}
        </h2>
        {/* The framing matters as much as the question. */}
        <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.55, margin: '0 0 16px' }}>
          {t('Kalau ada alasannya, catat di sini. Ini bukan penilaian — alasan seperti alat rusak atau stok habis perlu diketahui agar bisa diperbaiki.',
              'If there was a reason, record it. This is not a judgement — reasons like broken equipment or a stock-out need to be known so they can be fixed.')}
        </p>

        {missing.map((code) => {
          const chosen = value[code];
          const open = openFor === code;
          return (
            <div key={code} style={{
              borderRadius: 11, border: `1px solid ${chosen ? C.border : C.border}`,
              marginBottom: 9, overflow: 'hidden',
              background: chosen ? 'rgba(255,255,255,.03)' : 'transparent',
            }}>
              <button
                onClick={() => setOpenFor(open ? null : code)}
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none',
                  padding: '12px 14px', cursor: 'pointer', color: C.white,
                  display: 'flex', alignItems: 'center', gap: 10, minHeight: 48,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14.5, flex: 1 }}>{nameOf(code)}</span>
                <span style={{ fontSize: 12.5, color: chosen ? C.teal : C.dimmer }}>
                  {chosen
                    ? (SKIP_REASONS.find((r) => r.code === chosen)?.[lang === 'en' ? 'en' : 'id'] ?? chosen)
                    : t('pilih alasan', 'choose a reason')}
                </span>
              </button>

              {open && (
                <div style={{ padding: '0 10px 10px', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {SKIP_REASONS.map((r) => {
                    const on = chosen === r.code;
                    return (
                      <button
                        key={r.code}
                        onClick={() => {
                          const next = { ...value };
                          if (on) delete next[code]; else next[code] = r.code;
                          onChange(next);
                          if (!on) {
                            // Move to the next unanswered one, so answering
                            // four of these is four taps and not twelve.
                            const rest = missing.filter((m) => m !== code && !value[m]);
                            setOpenFor(rest[0] ?? null);
                          }
                        }}
                        style={{
                          padding: '9px 12px', borderRadius: 999, fontSize: 13, minHeight: 40,
                          border: `1px solid ${on ? C.teal : C.border}`,
                          background: on ? C.teal : 'transparent',
                          color: on ? C.onAccent : C.dim,
                          fontWeight: on ? 700 : 500, cursor: 'pointer',
                        }}
                      >
                        {lang === 'en' ? r.en : r.id}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
          <button onClick={onCancel} disabled={saving} style={{
            flex: 1, padding: 14, borderRadius: 11, fontSize: 14.5, fontWeight: 700,
            background: 'transparent', color: C.dim, border: `1px solid ${C.border}`,
            cursor: 'pointer',
          }}>
            {t('Isi dulu', 'Fill it in')}
          </button>
          <button onClick={onConfirm} disabled={saving} style={{
            flex: 1.4, padding: 14, borderRadius: 11, fontSize: 14.5, fontWeight: 700,
            background: saving ? C.accentMuted : C.teal,
            color: saving ? C.dim : C.onAccent, border: 'none', cursor: 'pointer',
          }}>
            {saving
              ? t('Menyimpan…', 'Saving…')
              : answered > 0
                ? t('Simpan dengan alasan', 'Save with reasons')
                : t('Simpan tanpa alasan', 'Save without reasons')}
          </button>
        </div>
        {/* Said out loud, because a midwife who suspects a prompt can trap her
            will stop using the app rather than risk it. */}
        <p style={{ fontSize: 11.5, color: C.dimmer, textAlign: 'center', margin: '10px 0 0', lineHeight: 1.5 }}>
          {t('Alasan tidak wajib. Kunjungan tetap tersimpan.',
              'Reasons are optional. The visit is saved either way.')}
        </p>
      </div>
    </div>
  );
}
