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

import { useEffect, useState } from 'react';
import { queueCounts } from '@/lib/offlineStore';
import { useLang } from '@/lib/lang';

export default function QueueBanner() {
  const { lang } = useLang();
  const isEN = lang === 'en';
  const t = (id: string, en: string) => (isEN ? en : id);
  const [c, setC] = useState<{ waiting: number; rejected: number } | null>(null);

  useEffect(() => {
    let live = true;
    const read = () => { queueCounts().then((v) => { if (live) setC(v); }).catch(() => {}); };
    read();
    // Cheap, and the number changes under her while the daemon uploads.
    const timer = setInterval(read, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') read(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', read);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', read);
    };
  }, []);

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
          <div style={{ fontWeight: 400, marginTop: 4 }}>
            {t('Mencoba lagi tidak akan menolong. Catat ulang kunjungan itu dengan usia kehamilan terisi, lalu hubungi koordinator Anda.',
               'Trying again will not help. Record those visits again with the gestational age filled in, then contact your coordinator.')}
          </div>
        </div>
      )}
    </div>
  );
}
