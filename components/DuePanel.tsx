'use client';

// components/DuePanel.tsx
// What still needs doing, above the form she is about to fill.
//
// This is the second half of the encounter. VisitHistory sits beside it and
// says what was found last time; this says what has never been done at all,
// and the pair is the whole question a midwife has when she opens a mother:
// what happened, and what is still outstanding.
//
// IT IS A PROMPT, NOT AN INSTRUCTION. Nothing here is required, nothing
// blocks, and there is no tick to clear. She may have perfectly good reasons —
// the lab is four hours away, the Puskesmas has had no iron since June — and
// the app has no standing to argue. Those reasons are captured at save time,
// where they belong.
//
// It also collapses. A midwife who knows her mothers does not need to be told
// twice, and a panel that cannot be got out of the way is a panel that trains
// people to scroll past the top of the screen.

import { useState } from 'react';
import type { RegisterRecord } from '@/lib/offlineStore';
import { dueItems, gestationalWeeks, type DueItem } from '@/lib/due';
import { C } from './ui';
import { useLang } from '@/lib/lang';

const TONE: Record<DueItem['urgency'], string> = {
  overdue: C.red,
  due:     C.amber,
  soon:    C.ok,
  info:    C.dim,
};

export default function DuePanel({ record }: { record: RegisterRecord }) {
  const { t } = useLang();
  const [open, setOpen] = useState(true);

  const gw = gestationalWeeks(record);
  const items = dueItems(record, t);

  // Nothing outstanding is worth saying out loud — it is the only positive
  // feedback in the app, and it is earned rather than decorative.
  if (gw != null && items.length === 0) {
    return (
      <div style={{
        padding: '11px 14px', borderRadius: 11, marginBottom: 14,
        background: C.card2, border: `1px solid ${C.border}`,
        fontSize: 12.5, color: C.ok, lineHeight: 1.5, fontWeight: 600,
      }}>
        {t(`✓ Tidak ada yang tertunda · ${gw} minggu`, `✓ Nothing outstanding · ${gw} weeks`)}
      </div>
    );
  }

  if (items.length === 0) return null;

  const worst = items[0].urgency;
  const shown = open ? items : items.slice(0, 2);

  return (
    <section style={{
      marginBottom: 14, borderRadius: 12, overflow: 'hidden',
      background: C.card2, border: `1px solid ${C.border}`,
      borderLeft: `5px solid ${TONE[worst]}`,
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          padding: '11px 14px', cursor: 'pointer', color: C.white,
          display: 'flex', alignItems: 'center', gap: 8, minHeight: 46,
        }}
      >
        <span style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '.06em',
          textTransform: 'uppercase', color: TONE[worst],
        }}>
          {t('Perlu dilakukan', 'Still to do')}
        </span>
        <span style={{ fontSize: 12, color: C.dimmer }}>
          {items.length}{gw != null ? ` · ${gw} ${t('mgg', 'wks')}` : ''}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.dimmer }}>
          {open ? '▾' : '▸'}
        </span>
      </button>

      <div style={{ padding: '0 14px 12px' }}>
        {shown.map((it) => (
          <div key={it.code} style={{ display: 'flex', gap: 9, marginBottom: 8 }}>
            <span style={{
              flex: '0 0 auto', width: 6, height: 6, borderRadius: 3, marginTop: 6,
              background: TONE[it.urgency],
            }} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 13.5, lineHeight: 1.4, fontWeight: 600,
                color: it.urgency === 'info' ? C.dim : C.white,
              }}>
                {it.label}
              </div>
              {it.detail && (
                <div style={{ fontSize: 11.5, color: C.dimmer, lineHeight: 1.45, marginTop: 1 }}>
                  {it.detail}
                </div>
              )}
            </div>
          </div>
        ))}
        {!open && items.length > 2 && (
          <div style={{ fontSize: 11.5, color: C.dimmer }}>
            {t(`+${items.length - 2} lagi`, `+${items.length - 2} more`)}
          </div>
        )}
        {/* Said once, quietly, and never as a nag. */}
        {open && (
          <p style={{ fontSize: 11, color: C.dimmer, margin: '10px 0 0', lineHeight: 1.5 }}>
            {t('Saran, bukan keharusan. Kalau ada yang tidak bisa dilakukan, alasannya dicatat saat menyimpan.',
                'Suggestions, not requirements. If something cannot be done, the reason is recorded when you save.')}
          </p>
        )}
      </div>
    </section>
  );
}
