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

      {/* ── WHAT SHE CAN STILL DO, NOT ONLY WHAT SHE CANNOT ──────────────────
          A midwife reaching this page is standing in front of a mother. The
          register, the search and the three "new" forms are all on the device
          and all work with no signal — saying so turns a dead end into the next
          step. Reported from the field as tapping a mother offline giving the
          browser's own error page; she now gets this instead, and from here she
          can still record the visit. */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, marginTop: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          {t('Yang tetap bisa dikerjakan tanpa sinyal', 'What still works with no signal')}
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {([
            ['/search', t('Daftar pasien — cari dan lihat ibu yang tersimpan', 'Patient register — search the mothers stored here')],
            ['/anc/baru', t('Pemeriksaan kehamilan — ibu baru', 'Antenatal visit — a new mother')],
            ['/pnc/baru', t('Kunjungan nifas — ibu baru', 'Postnatal visit — a new mother')],
            ['/kn/baru', t('Kunjungan neonatal — bayi baru', 'Newborn visit — a new baby')],
          ] as const).map(([href, label]) => (
            <a key={href} href={href}
              style={{ display: 'block', padding: '11px 13px', borderRadius: 10, textDecoration: 'none',
                       border: `1px solid ${C.border}`, color: C.white, fontSize: 13.5, fontWeight: 600 }}>
              {label}
            </a>
          ))}
        </div>
        <p style={{ color: C.dim, fontSize: 12, lineHeight: 1.6, marginTop: 12, marginBottom: 0 }}>
          {t('Rekam ibu yang sudah pernah dibuka saat ada sinyal juga tersimpan. Yang belum pernah dibuka perlu sinyal sekali untuk pertama kalinya.',
             'A mother’s record you have opened before while online is stored too. One that has never been opened needs signal once, the first time.')}
        </p>
      </div>
    </main>
  );
}
