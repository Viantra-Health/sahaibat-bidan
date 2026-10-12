'use client';

// components/QueueBanner.tsx
//
// What is still on this device and has not reached the record.
//
// WHY THIS EXISTS
//
// The queue has always worked and has never been visible. End-to-end testing
// found three visits sitting on a device with status "failed" — two antenatal
// visits and a delivery, all refused by a database constraint on gestational
// age — while every screen in the app said nothing at all. The app had told
// her "Kunjungan tersimpan. Akan terkirim otomatis saat ada sinyal." and she
// had every reason to believe it.
//
// A midwife who does not know the gestational age records a visit, is told it
// is saved, and it never reaches the record. That is the one failure the whole
// offline design exists to prevent, and it was invisible.
//
// TWO STATES, NOT ONE
//
// Waiting is normal and needs no alarm: she has no signal, it will go when she
// does. REFUSED is not normal — the server looked at it and said no, another
// attempt changes nothing, and somebody has to do something. They are coloured
// and worded differently for that reason, and the refused count never hides.

import { useCallback, useEffect, useState } from 'react';
import { queueCounts, getRejectedVisits, retryRejectedVisits } from '@/lib/offlineStore';
import { syncPendingVisits } from '@/lib/syncClient';
import { useLang } from '@/lib/lang';

export default function QueueBanner() {
  const { lang } = useLang();
  const isEN = lang === 'en';
  const t = (id: string, en: string) => (isEN ? en : id);
  const [c, setC] = useState<{ waiting: number; rejected: number } | null>(null);
  /* WHICH mother, and WHY. The first version of this banner gave a count and
     one piece of advice — "re-record it with the gestational age filled in" —
     which was wrong for a stuck delivery that already had one. A banner that
     cannot say which record it means sends her looking through the register. */
  const [stuck, setStuck] = useState<Array<{ name: string; visitType: string; why: { id: string; en: string } | null }>>([]);
  const [retrying, setRetrying] = useState(false);

  /* Lifted out of the effect because the retry button needs it too. A local
     `read` inside the effect left the banner showing the old counts for
     fifteen seconds after she pressed it, which reads as nothing happening. */
  const read = useCallback(() => {
    queueCounts().then(setC).catch(() => {});
    getRejectedVisits().then((rows) => {
      /* ── THE FIELD NAMES WERE ALL WRONG ────────────────────────────────
         This read memberName, values.motherName and values.babyName. A
         QueuedVisit has none of them: the fields are `motherName` and
         `visitType`, both at the top level. So every line fell through to the
         em-dash fallback and the banner read "— — ...", which is a banner that
         cannot say which mother it means -- the exact failure it was built to
         fix. The fallback hid the mistake perfectly. */
      setStuck(rows.slice(0, 5).map((r: any) => ({
        name: String(r?.motherName || '—'),
        visitType: String(r?.visitType || ''),
        why: whyRefused(r),
      })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    read();
    // Cheap, and the number changes under her while the daemon uploads.
    const timer = setInterval(read, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') read(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', read);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', read);
    };
  }, [read]);

  if (!c || (c.waiting === 0 && c.rejected === 0)) return null;

  return (
    <div style={{ display: 'grid', gap: 7, marginBottom: 12 }}>
      {c.waiting > 0 && (
        <div style={{
          fontSize: 13, lineHeight: 1.5, borderRadius: 10, padding: '9px 12px',
          background: 'var(--surface-2, #FDF4F5)', border: '1px solid var(--line, #EEE0E3)',
          color: 'var(--ink-2, #6B4A54)',
        }}>
          {t(`${c.waiting} kunjungan menunggu sinyal. Tersimpan di perangkat ini.`,
             `${c.waiting} visit${c.waiting === 1 ? '' : 's'} waiting for a signal. Saved on this device.`)}
        </div>
      )}

      {c.rejected > 0 && (
        <div role="alert" style={{
          fontSize: 13, lineHeight: 1.5, borderRadius: 10, padding: '10px 12px',
          background: '#FDEAE8', border: '1px solid #B3261E', color: '#B3261E', fontWeight: 600,
        }}>
          {t(`${c.rejected} kunjungan DITOLAK server dan belum masuk ke catatan.`,
             `${c.rejected} visit${c.rejected === 1 ? '' : 's'} were REFUSED by the server and are not in the record.`)}
          {stuck.length > 0 && (
            <ul style={{ fontWeight: 400, margin: '6px 0 0', paddingLeft: 18 }}>
              {stuck.map((r, i) => (
                <li key={i} style={{ marginBottom: 2 }}>
                  <strong style={{ fontWeight: 700 }}>{r.name}</strong>
                  {r.visitType && <span style={{ opacity: .85 }}>{` · ${r.visitType}`}</span>}
                  {r.why && <span style={{ opacity: .85 }}>{` — ${isEN ? r.why.en : r.why.id}`}</span>}
                </li>
              ))}
            </ul>
          )}
          <div style={{ fontWeight: 400, marginTop: 6 }}>
            {t('Perbaiki yang disebut di atas lalu catat ulang kunjungan itu, atau hubungi koordinator Anda.',
               'Correct what is named above and record those visits again, or contact your coordinator.')}
          </div>
          {/* ── WHEN THE REASON FOR THE REFUSAL IS FIXED ────────────────────
              A refused visit is never retried automatically, and that is
              right while the refusal stands -- the server will just say no
              again. But a refusal can be FIXED at the other end: the server
              used to reject a blank gestational age and no longer does. Seven
              visits were stuck on a test device for exactly that reason, and
              with no way to ask again those records were lost for good even
              after the cause was gone.

              Safe to press at any time. A visit whose refusal still stands is
              refused again with the same message; nothing is deleted. */}
          <button
            onClick={async () => {
              setRetrying(true);
              try {
                await retryRejectedVisits();
                await syncPendingVisits();
              } finally {
                setRetrying(false);
                read();
              }
            }}
            disabled={retrying}
            style={{
              marginTop: 9, width: '100%', minHeight: 44, padding: '10px 12px',
              borderRadius: 9, cursor: retrying ? 'default' : 'pointer',
              background: 'transparent', color: '#B3261E', fontWeight: 700, fontSize: 13,
              border: '1px solid #B3261E',
            }}
          >
            {retrying
              ? t('Mencoba…', 'Trying…')
              : t('Coba kirim lagi', 'Try sending again')}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── WHY IT WAS REFUSED, WITHOUT GUESSING ────────────────────────────────────
   The old version tested /gestational_weeks/ against the server's message and
   printed "outside the accepted range" on every match. Two of the five visits
   stuck on the test device had no gestational age at ALL, which is a different
   problem with a different fix, and both were told the wrong one.

   So the VALUE decides the sentence, not the column name; the column name only
   says which field to talk about. Anything we do not recognise shows the
   server's own words rather than an invented explanation -- a coordinator can
   act on "violates check constraint", and cannot act on silence. */
function whyRefused(r: any): { id: string; en: string } | null {
  const err = String(r?.syncError ?? '').trim();
  if (!err) return null;

  if (/gestational_weeks/i.test(err)) {
    const gw = r?.gestationalWeeks;
    if (gw == null || gw === '') {
      return {
        id: 'usia kehamilan tidak diisi',
        en: 'gestational age was left empty',
      };
    }
    return {
      id: `usia kehamilan ${gw} minggu di luar batas yang diterima`,
      en: `a gestational age of ${gw} weeks is outside the accepted range`,
    };
  }

  // Not a constraint we have a sentence for. Show what the server said.
  const short = err.length > 120 ? `${err.slice(0, 117)}…` : err;
  return { id: short, en: short };
}
