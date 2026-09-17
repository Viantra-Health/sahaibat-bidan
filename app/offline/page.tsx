'use client';

// The service worker serves this when a route is not cached. It must never
// imply that anything was lost — the queue is on the device and the sync
// daemon keeps trying regardless of what is on screen.

import { useLang } from '@/lib/lang';
import { C } from '@/components/ui';

export default function OfflinePage() {
  const { t } = useLang();
  return (
    <main style={{ padding: 24, maxWidth: 420, margin: '0 auto', minHeight: '100dvh',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>{t('Tidak ada sinyal', 'No signal')}</h1>
      <p style={{ color: C.dim, lineHeight: 1.6, margin: 0 }}>
        {t('Halaman ini belum tersimpan di perangkat. Data pemeriksaan yang sudah Anda isi tetap aman dan akan terkirim otomatis saat sinyal kembali.',
           'This page is not stored on the device yet. Anything you have already recorded is safe and will upload automatically when signal returns.')}
      </p>
    </main>
  );
}
