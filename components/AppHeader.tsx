'use client';

// components/AppHeader.tsx
// One bar on every signed-in screen: whose app this is, who she is, where she
// is working.
//
// Before this the only chrome was a line reading "BIDAN BIDAN YUNI SERAN" —
// the word twice, because the label said "Bidan" and so did her stored name.
// An app with no mark and a doubled word reads as unfinished, which matters
// more than usual here: a midwife is being asked to trust it with a village's
// pregnancies.

import { useEffect, useState } from 'react';
import { C } from './ui';
import { useLang } from '@/lib/lang';
import { useTheme } from '@/lib/theme';
import { clearIdentity } from '@/lib/auth';
import { clearPasscode } from '@/lib/passcode';
import { queueCounts } from '@/lib/offlineStore';

export default function AppHeader({
  name, village, right,
}: {
  name?: string | null;
  village?: string | null;
  right?: React.ReactNode;
}) {
  const { lang, toggle, t } = useLang();
  const { theme, toggleTheme } = useTheme();
  /* ── THERE WAS NO WAY OUT ─────────────────────────────────────────────────
     Three rounds of testing reported it and it is not only a convenience: a
     shared handset is normal here, and a midwife who cannot sign out either
     works as somebody else or the device is passed on still signed in. Behind
     a confirm, because the queue is the one thing on this phone that exists
     nowhere else, and the sheet says what happens to it. */
  const [signingOut, setSigningOut] = useState(false);
  const [queued, setQueued] = useState<{ waiting: number; rejected: number } | null>(null);

  // Read only while the sheet is open. Every screen mounts this header, and
  // none of them needs the queue until she asks to leave.
  useEffect(() => {
    if (!signingOut) return;
    let live = true;
    queueCounts().then((q) => { if (live) setQueued(q); }).catch(() => {});
    return () => { live = false; };
  }, [signingOut]);

  function signOut() {
    /* The PIN goes with the session. It is a DEVICE lock, so leaving it behind
       would strand whoever signs in next behind a code only the last user
       knows -- the same reasoning as the forgotten-PIN reset in
       components/PasscodeGate.tsx, which clears both for the same reason.

       The visit queue is untouched. Each queued visit carries its own
       profileId, so it still uploads under the midwife who recorded it. */
    clearPasscode();
    clearIdentity();
    window.location.href = '/';
  }
  // Her stored name is often already "Bidan Yuni Seran". Do not print the
  // role in front of it and say it twice.
  const display = (name ?? '').trim();
  const withoutRole = display.replace(/^bidan\s+/i, '');

  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <img
          src="/icons/icon-192.png?v=2"
          alt=""
          width={28}
          height={28}
          style={{ borderRadius: 8, display: 'block', flex: '0 0 auto' }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 700, letterSpacing: '.01em', lineHeight: 1.25,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            SahAIbat <span style={{ color: C.teal }}>Bidan</span>
          </div>
          <div style={{
            fontSize: 10.5, color: C.dimmer, lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {[withoutRole || null, village || null].filter(Boolean).join(' · ') || t('Bidan', 'Midwife')}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
        {right}
        {/* Indonesian is the default and the label shows the language you
            would switch TO, which is the convention a bilingual user reads
            fastest. */}
        {/* Night deliveries are real; a phone in dark mode at noon is not the
            same thing as working in the dark, so this is her choice and never
            the system preference. */}
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? t('Mode terang', 'Light mode') : t('Mode gelap', 'Dark mode')}
          style={{
            fontSize: 13, lineHeight: 1, cursor: 'pointer', padding: '5px 8px',
            borderRadius: 20, background: 'transparent', color: C.dim,
            border: `1px solid ${C.border}`,
          }}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button
          onClick={toggle}
          aria-label={lang === 'en' ? 'Ganti ke Bahasa Indonesia' : 'Switch to English'}
          style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', cursor: 'pointer',
            padding: '4px 9px', borderRadius: 20, background: 'transparent',
            color: C.teal, border: `1px solid rgba(2,195,154,.45)`,
          }}
        >
          {lang === 'en' ? 'ID' : 'EN'}
        </button>
        {name && (
          <button
            onClick={() => setSigningOut(true)}
            aria-label={t('Keluar', 'Sign out')}
            style={{
              fontSize: 13, lineHeight: 1, cursor: 'pointer', padding: '5px 8px',
              borderRadius: 20, background: 'transparent', color: C.dim,
              border: `1px solid ${C.border}`,
            }}
          >
            ⏻
          </button>
        )}
      </div>

      {signingOut && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(4,20,17,.72)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{
            width: '100%', maxWidth: 480, background: C.card,
            borderRadius: '16px 16px 0 0', border: `1px solid ${C.border}`,
            borderBottom: 'none', padding: '20px 18px 24px', textAlign: 'left',
          }}>
            <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>{t('Keluar dari aplikasi?', 'Sign out?')}</h2>
            <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: '0 0 10px' }}>
              {t('Untuk masuk lagi Anda perlu sinyal sebentar. PIN perangkat juga akan dihapus.',
                 'To sign in again you will need signal briefly. The device PIN is cleared too.')}
            </p>
            {/* ── WAITING AND REFUSED ARE NOT THE SAME PROMISE ────────────────
                The first version of this counted them together and said they
                would "still be sent". A refused visit will never be sent --
                the server looked at it and said no, and another attempt gets
                the same answer. Telling her it is on its way is worse than
                saying nothing, because she stops looking for it. */}
            {queued && queued.waiting > 0 && (
              <p style={{
                fontSize: 13.5, lineHeight: 1.6, margin: '0 0 10px', fontWeight: 600,
                borderRadius: 9, padding: '10px 12px',
                background: '#FBF1DC', border: '1px solid #8A5D06', color: '#8A5D06',
              }}>
                {t(`${queued.waiting} kunjungan menunggu sinyal. Tidak hilang, dan tetap terkirim atas nama Anda — tetapi hanya setelah ada yang masuk lagi di perangkat ini. Lebih baik cari sinyal dulu.`,
                   `${queued.waiting} visit(s) are waiting for a signal. They are not lost and will still upload under your name — but only once someone signs in on this device again. Better to find a signal first.`)}
              </p>
            )}
            {queued && queued.rejected > 0 && (
              <p style={{
                fontSize: 13.5, lineHeight: 1.6, margin: '0 0 10px', fontWeight: 600,
                borderRadius: 9, padding: '10px 12px',
                background: '#FDEAE8', border: '1px solid #B3261E', color: '#B3261E',
              }}>
                {/* This said "Mencoba lagi tidak menolong" while the register
                    page offered a Coba kirim lagi button two taps away. Both
                    cannot be true. Retrying does nothing while the refusal
                    stands and everything once the cause is fixed, so the two
                    screens now say that same sentence. */}
                {t(`${queued.rejected} kunjungan DITOLAK server dan belum masuk catatan. Kunjungan itu tidak akan terkirim sendiri: di halaman daftar pasien ada tombol "Coba kirim lagi", dan kalau masih ditolak kunjungan itu harus dicatat ulang. Hubungi koordinator Anda.`,
                   `${queued.rejected} visit(s) were REFUSED by the server and are not in the record. They will not go on their own: the register page has a "Try sending again" button, and if they are still refused they have to be recorded again. Contact your coordinator.`)}
              </p>
            )}
            {queued && queued.waiting === 0 && queued.rejected === 0 && (
              <p style={{ fontSize: 13, color: C.dimmer, lineHeight: 1.6, margin: '0 0 16px' }}>
                {t('Semua kunjungan sudah terkirim.', 'Every visit has been uploaded.')}
              </p>
            )}
            <div style={{ height: 6 }} />
            <button onClick={() => setSigningOut(false)} style={{
              width: '100%', minHeight: 50, padding: 14, fontSize: 15, fontWeight: 700,
              borderRadius: 11, background: C.teal, color: C.onAccent,
              border: 'none', cursor: 'pointer', marginBottom: 10,
            }}>
              {t('Tetap masuk', 'Stay signed in')}
            </button>
            <button onClick={signOut} style={{
              width: '100%', minHeight: 48, padding: 13, fontSize: 14.5, fontWeight: 600,
              borderRadius: 11, background: 'transparent', color: C.red,
              border: `1px solid ${C.red}`, cursor: 'pointer',
            }}>
              {t('Keluar', 'Sign out')}
            </button>
            {/* ── WHICH BUILD IS THIS? ──────────────────────────────────────
                Put inside the sign-out sheet on purpose: a midwife never needs
                it, and anybody testing or supporting the app needs it badly and
                can reach it in two taps without DevTools.

                A retest had to clear the service-worker cache by hand to see a
                previous round of fixes, which means some "unchanged" verdicts
                may have been measurements of an old build. There was no way to
                tell from inside the app, and a tester who cannot name the build
                cannot report against it. */}
            <p style={{ marginTop: 14, fontSize: 10.5, color: C.dimmer, textAlign: 'center', lineHeight: 1.5 }}>
              {t('Versi aplikasi', 'App version')}:{' '}
              {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'dev'}
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
