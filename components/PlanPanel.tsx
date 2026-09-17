'use client';

// components/PlanPanel.tsx
// The suggested plan, and her signature on it.
//
// WHY NOTHING IS TICKED WHEN THIS OPENS
// -------------------------------------
// The tempting design is to pre-accept everything, so a midwife in a hurry
// taps Save and the standard is recorded. It would look efficient and it would
// be a fabrication: the record would claim she gave iron, counselled about tea
// with meals and booked a follow-up, when she may have done none of them.
//
// A clinical record must never assert care that did not happen. So every line
// starts untouched, and only what she taps becomes part of the record. It is
// the same rule as the three-state questions elsewhere in the app — silence is
// not a yes — and it is worth the extra taps.
//
// DECLINING IS A DIFFERENT ANSWER FROM IGNORING. A line she crosses out says
// she considered it and said no, which is a real clinical decision and often a
// correct one: the referral she declined because the road is washed out, the
// iron she declined because the Puskesmas has none. That is worth capturing
// separately from a line she simply never looked at.
//
// EVERY LINE IS EDITABLE. The suggestion is a starting point transcribed from
// the national standard; she knows this woman and this village. What she
// records is her sentence, not ours.

import { useState } from 'react';
import type { PlanItem } from '@sahaibat/anc-engine';
import { C } from './ui';
import { useLang } from '@/lib/lang';

export interface PlanState {
  accepted: string[];
  declined: string[];
  edits: Record<string, string>;
}

export const EMPTY_PLAN: PlanState = { accepted: [], declined: [], edits: {} };

const CATEGORY_LABEL: Record<string, [string, string]> = {
  rujukan:     ['Rujukan', 'Referral'],
  tatalaksana: ['Tatalaksana', 'Management'],
  konseling:   ['Konseling', 'Counselling'],
  jadwal:      ['Tindak lanjut', 'Follow-up'],
};

const CATEGORY_TONE: Record<string, string> = {
  rujukan: C.red, tatalaksana: C.teal, konseling: C.ok, jadwal: C.dim,
};

/** The text that will be recorded for a line — her edit if she made one. */
export function lineText(p: PlanItem, state: PlanState, lang: 'id' | 'en'): string {
  return state.edits[p.code] ?? (lang === 'en' ? p.action_en : p.action_id);
}

interface Props {
  items: PlanItem[];
  state: PlanState;
  onChange: (s: PlanState) => void;
}

export default function PlanPanel({ items, state, onChange }: Props) {
  const { t, lang } = useLang();
  const [editing, setEditing] = useState<string | null>(null);

  if (items.length === 0) return null;

  const accept = (code: string) => {
    const accepted = state.accepted.includes(code)
      ? state.accepted.filter((c) => c !== code)
      : [...state.accepted, code];
    onChange({ ...state, accepted, declined: state.declined.filter((c) => c !== code) });
  };
  const decline = (code: string) => {
    const declined = state.declined.includes(code)
      ? state.declined.filter((c) => c !== code)
      : [...state.declined, code];
    onChange({ ...state, declined, accepted: state.accepted.filter((c) => c !== code) });
  };

  // Grouped, because a midwife reads a plan the way she writes one: refer
  // first, then what she does, then what she says, then when to come back.
  const order = ['rujukan', 'tatalaksana', 'konseling', 'jadwal'];
  const groups = order
    .map((cat) => ({ cat, list: items.filter((i) => i.category === cat) }))
    .filter((g) => g.list.length > 0);

  return (
    <section style={{
      marginBottom: 14, borderRadius: 12, overflow: 'hidden',
      background: C.card2, border: `1px solid ${C.border}`,
    }}>
      <div style={{ padding: '12px 14px 4px' }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '.06em',
          textTransform: 'uppercase', color: C.teal, marginBottom: 3,
        }}>
          {t('Saran rencana asuhan', 'Suggested care plan')}
        </div>
        <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.5, margin: '0 0 4px' }}>
          {t('Saran berdasarkan standar Kemenkes. Bidan yang memutuskan — centang yang dilakukan, coret yang tidak, ubah teksnya bila perlu.',
              'Suggestions from the Kemenkes standard. You decide — tick what you did, cross out what you did not, edit the wording if you want.')}
        </p>
      </div>

      {groups.map((g) => (
        <div key={g.cat} style={{ padding: '6px 14px 2px' }}>
          <div style={{
            fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em',
            textTransform: 'uppercase', color: CATEGORY_TONE[g.cat], marginBottom: 6,
          }}>
            {CATEGORY_LABEL[g.cat][lang === 'en' ? 1 : 0]}
          </div>

          {g.list.map((p) => {
            const on = state.accepted.includes(p.code);
            const off = state.declined.includes(p.code);
            const text = lineText(p, state, lang);
            return (
              <div key={p.code} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  {/* 40px targets: this is used one-handed, outdoors. */}
                  <button
                    onClick={() => accept(p.code)}
                    aria-pressed={on}
                    style={{
                      flex: '0 0 auto', width: 34, height: 34, borderRadius: 8, marginTop: 1,
                      border: `1px solid ${on ? C.teal : C.border}`,
                      background: on ? C.teal : 'transparent',
                      color: on ? C.onAccent : C.dimmer,
                      fontSize: 15, fontWeight: 800, cursor: 'pointer', lineHeight: 1,
                    }}
                  >
                    {on ? '✓' : ''}
                  </button>

                  <button
                    onClick={() => setEditing(editing === p.code ? null : p.code)}
                    style={{
                      flex: 1, textAlign: 'left', background: 'none', border: 'none',
                      padding: '4px 0', cursor: 'pointer', minWidth: 0,
                      color: off ? C.dimmer : C.white,
                      textDecoration: off ? 'line-through' : 'none',
                      fontSize: 13.5, lineHeight: 1.45,
                    }}
                  >
                    {text}
                    {state.edits[p.code] != null && (
                      <span style={{ fontSize: 10.5, color: C.dimmer, marginLeft: 6 }}>
                        {t('(diubah)', '(edited)')}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => decline(p.code)}
                    aria-pressed={off}
                    title={t('Tidak dilakukan', 'Not done')}
                    style={{
                      flex: '0 0 auto', width: 34, height: 34, borderRadius: 8, marginTop: 1,
                      border: `1px solid ${off ? C.red : C.border}`,
                      background: off ? C.red : 'transparent',
                      color: off ? C.onDanger : C.dimmer,
                      fontSize: 14, fontWeight: 800, cursor: 'pointer', lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>

                {editing === p.code && (
                  <input
                    value={text}
                    onChange={(e) => onChange({
                      ...state, edits: { ...state.edits, [p.code]: e.target.value },
                    })}
                    autoFocus
                    style={{
                      width: '100%', marginTop: 7, padding: '11px 12px', borderRadius: 9,
                      border: `1px solid ${C.teal}`, background: C.card,
                      color: C.white, fontSize: 14, fontFamily: 'inherit',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div style={{
        padding: '8px 14px 12px', borderTop: `1px solid ${C.border}`, marginTop: 4,
      }}>
        <span style={{ fontSize: 11.5, color: C.dimmer, lineHeight: 1.5 }}>
          {state.accepted.length === 0
            ? t('Belum ada yang dicentang — tidak ada yang akan dicatat sebagai tindakan.',
                'Nothing ticked yet — nothing will be recorded as care given.')
            : t(`${state.accepted.length} tindakan akan dicatat atas nama Anda.`,
                `${state.accepted.length} action${state.accepted.length > 1 ? 's' : ''} will be recorded under your name.`)}
        </span>
      </div>
    </section>
  );
}
