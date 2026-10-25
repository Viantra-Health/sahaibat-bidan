'use client';

// components/KbScreening.tsx
//
// Kriteria persyaratan medis, on a doorstep.
//
// ── WHAT IS DIFFERENT FROM THE CLINIC VERSION ───────────────────────────────
//
// NOTHING IS PREFILLED. The DOK panel reads the patient's coded diagnoses and
// fills in what the record already settles. A midwife has no such record —
// and in a standalone deployment there is no DOK at all — so every condition
// starts unanswered and she asks. That is not a degraded mode; it is the
// normal one for the field, and the screen must not look broken because of it.
//
// It also runs entirely offline. The rules ship inside @sahaibat/anc-engine,
// so this works with no signal, which is the only way it would ever be used.
//
// ── THREE STATES, AND THE THIRD IS THE POINT ────────────────────────────────
//
// Yes, no, and NOT ASKED. A checkbox cannot express the third, and defaulting
// it to off would assert that a woman is clear of something nobody looked for.

import { useMemo } from 'react';
import { screeningFor, type KbScreening as Screening } from '@sahaibat/anc-engine';
import { C } from '@/components/ui';
import { useLang } from '@/lib/lang';

export interface ScreeningAnswers { [code: string]: boolean | null }

export function useScreening(formulation: string, answers: ScreeningAnswers): Screening {
  return useMemo(
    () => screeningFor(formulation || null, { answers }),
    [formulation, answers],
  );
}

export default function KbScreeningList({ screening, answers, onAnswer }: {
  screening: Screening;
  answers: ScreeningAnswers;
  onAnswer: (code: string, v: boolean | null) => void;
}) {
  const { t } = useLang();

  if (!screening.source) {
    return (
      <div style={{ ...box, borderColor: C.border }}>
        <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.55 }}>
          {t('Daftar kriteria untuk jenis ini belum disalin dari Pedoman. Gunakan Roda KLOP seperti biasa.',
             'The criteria list for this formulation is not transcribed yet. Use Roda KLOP as usual.')}
        </div>
      </div>
    );
  }

  const open = screening.unanswered.length;
  const found = screening.present.length;

  return (
    <div style={box}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>
        {t('Kriteria persyaratan medis', 'Medical eligibility criteria')}
      </div>
      <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 1 }}>
        {t(`Pedoman 2020, hlm. ${screening.source.join('–')}`,
           `Pedoman 2020, pp. ${screening.source.join('–')}`)}
      </div>
      <div style={{ fontSize: 12.5, color: open > 0 ? C.amber : C.ok, marginTop: 5 }}>
        {t(`${screening.items.length} kondisi · ${found} ditemukan · ${open} belum dijawab`,
           `${screening.items.length} conditions · ${found} found · ${open} unanswered`)}
      </div>

      <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        {screening.items.map((i) => {
          const v = answers[i.condition.code] ?? null;
          const unanswered = v === null;
          return (
            <div key={i.condition.code} style={{
              borderRadius: 9, padding: '9px 10px',
              background: v === true ? 'rgba(179,38,30,.10)' : C.field,
              border: `1px solid ${v === true ? C.red : unanswered ? C.amber : C.border}`,
            }}>
              <div style={{ fontSize: 13.5, color: C.white, lineHeight: 1.45 }}>
                {t(i.condition.label_id, i.condition.label_en)}
              </div>
              {unanswered && (
                <div style={{ fontSize: 11.5, color: C.amber, marginTop: 2 }}>
                  {t('Belum ditanyakan', 'Not asked')}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                <Pick on={v === true}  colour={C.red}   label={t('Ya', 'Yes')}
                      onClick={() => onAnswer(i.condition.code, true)} />
                <Pick on={v === false} colour={C.ok}    label={t('Tidak', 'No')}
                      onClick={() => onAnswer(i.condition.code, false)} />
                <Pick on={unanswered}  colour={C.amber} label="?"
                      onClick={() => onAnswer(i.condition.code, null)} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 10, lineHeight: 1.5 }}>
        {t('Daftar ini menunjukkan kondisi yang perlu dipertimbangkan, bukan kategori 1–4. Keputusan tetap pada bidan dan pilihan klien.',
           'This lists the conditions to consider, not a category 1–4. The decision stays with the midwife and the client’s choice.')}
      </div>
    </div>
  );
}

function Pick({ on, colour, label, onClick }: {
  on: boolean; colour: string; label: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, fontSize: 13, fontWeight: 700, cursor: 'pointer',
      padding: '8px 0', borderRadius: 8,
      border: `1px solid ${on ? colour : C.border}`,
      background: on ? colour : 'transparent',
      color: on ? C.onAccent : C.dim,
    }}>{label}</button>
  );
}

const box: React.CSSProperties = {
  border: `1px solid ${C.border}`, borderRadius: 11,
  padding: 12, background: C.card, marginTop: 14,
};
