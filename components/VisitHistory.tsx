'use client';

// components/VisitHistory.tsx
// What happened last time, and what she said she would do about it.
//
// WHY THIS IS THE MOST IMPORTANT PANEL IN THE APP
// ----------------------------------------------
// The app was built around capture → flag → refer, which is the wrong centre
// of gravity for Indonesia. A midwife runs nearly the whole pregnancy and the
// whole puerperium herself; referral is the exception, and in a rural posyandu
// it is rare. So the question she has when she opens a mother is not "should
// I refer" — it is:
//
//     what did I find last time, what did I do, and did it work?
//
// Without that the app is a data-entry tool feeding someone else's dashboard.
// With it, it is her record.
//
// Nothing here is new data. The issue is the highest-severity flag the engine
// already stored on that visit; the plan is the tatalaksana and tindak lanjut
// she already typed. It was all being written and never read back.

import { useState } from 'react';
import type { VisitSummary } from '@/lib/offlineStore';
import { C } from './ui';
import { useLang } from '@/lib/lang';

export default function VisitHistory({ history }: { history?: VisitSummary[] }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);

  if (!history || history.length === 0) {
    return (
      <div style={{
        padding: '11px 14px', borderRadius: 11, marginBottom: 14,
        background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
        fontSize: 12.5, color: C.dim, lineHeight: 1.5,
      }}>
        {t('Belum ada kunjungan tercatat untuk ibu ini.',
           'No previous visits recorded for her.')}
      </div>
    );
  }

  const [last, ...rest] = history;

  return (
    <section style={{
      marginBottom: 14, borderRadius: 12, overflow: 'hidden',
      background: 'rgba(2,195,154,0.06)', border: `1px solid rgba(2,195,154,0.28)`,
    }}>
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
          color: C.teal, marginBottom: 8,
        }}>
          {t('Kunjungan terakhir', 'Last visit')}
        </div>

        <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 7 }}>
          {[fmtDate(last.date, lang), last.visitType, last.context].filter(Boolean).join(' · ')}
        </div>

        {/* The issue is the headline. If the last visit found something, it is
            the first thing she should see — and the thing to ask about. */}
        {last.issue && (
          <Line label={t('Masalah', 'Problem')} value={last.issue} strong />
        )}
        {last.management && <Line label={t('Tatalaksana', 'Management')} value={last.management} />}
        {last.followUp && <Line label={t('Rencana', 'Plan')} value={last.followUp} />}
        {last.vitals && (
          <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {last.vitals}
          </div>
        )}

        {/* The question the record cannot answer for her. Asked, not assumed —
            whether it resolved is a clinical judgement she makes now. */}
        {last.issue && (
          <div style={{
            marginTop: 9, paddingTop: 9, borderTop: `1px solid rgba(2,195,154,0.2)`,
            fontSize: 12, color: C.amber, lineHeight: 1.45,
          }}>
            {t('Periksa apakah masalah ini sudah membaik.',
               'Check whether this has improved.')}
          </div>
        )}
      </div>

      {rest.length > 0 && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            style={{
              width: '100%', padding: '9px 14px', background: 'rgba(255,255,255,0.03)',
              border: 'none', borderTop: `1px solid rgba(2,195,154,0.2)`,
              color: C.dim, fontSize: 12, cursor: 'pointer', textAlign: 'left',
            }}
          >
            {open
              ? t('Sembunyikan riwayat', 'Hide history')
              : t(`+ ${rest.length} kunjungan sebelumnya`, `+ ${rest.length} earlier visit${rest.length > 1 ? 's' : ''}`)}
          </button>

          {open && rest.map((v, i) => (
            <div key={i} style={{
              padding: '11px 14px', borderTop: `1px solid rgba(255,255,255,0.06)`,
              background: 'rgba(0,0,0,0.12)',
            }}>
              <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 5 }}>
                {[fmtDate(v.date, lang), v.visitType, v.context].filter(Boolean).join(' · ')}
              </div>
              {v.issue && <Line label={t('Masalah', 'Problem')} value={v.issue} small />}
              {v.management && <Line label={t('Tatalaksana', 'Management')} value={v.management} small />}
              {v.followUp && <Line label={t('Rencana', 'Plan')} value={v.followUp} small />}
              {v.vitals && (
                <div style={{ fontSize: 11, color: C.dimmer, marginTop: 4 }}>{v.vitals}</div>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function Line({ label, value, strong, small }: {
  label: string; value: string; strong?: boolean; small?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 7, marginBottom: 4, alignItems: 'baseline' }}>
      <span style={{
        fontSize: small ? 10 : 10.5, color: C.dimmer, flex: '0 0 auto',
        minWidth: small ? 62 : 70, letterSpacing: '.03em',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: small ? 12 : 13, lineHeight: 1.45,
        color: strong ? '#fff' : 'rgba(255,255,255,0.78)',
        fontWeight: strong ? 600 : 400,
      }}>
        {value}
      </span>
    </div>
  );
}

/** Short and local. She reads dates, not timestamps. */
function fmtDate(iso: string, lang: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID',
    { day: 'numeric', month: 'short', year: 'numeric' });
}
