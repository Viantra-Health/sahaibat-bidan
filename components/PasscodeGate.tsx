'use client';

// components/PasscodeGate.tsx
// Wraps the app. Shows a keypad when a passcode is set and the session is
// locked; otherwise renders straight through and costs nothing.
//
// Deliberately NOT a route. A lock that lives at /lock is a lock you can
// navigate around by typing a URL, and on a shared handset that is the whole
// threat model.

import { useEffect, useState } from 'react';
import {
  isPasscodeSet, isUnlocked, verifyPasscode, attempts,
  PASSCODE_LENGTH, clearPasscode,
} from '@/lib/passcode';
import { getIdentity, clearIdentity } from '@/lib/auth';
import { C } from './ui';

export default function PasscodeGate({ children }: { children: React.ReactNode }) {
  // Undecided until mounted: rendering the app and then hiding it would flash
  // the register on screen, which is exactly what this prevents.
  const [locked, setLocked] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [tries, setTries] = useState(0);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    setLocked(isPasscodeSet() && !isUnlocked());
    setTries(attempts());
  }, []);

  useEffect(() => {
    if (code.length !== PASSCODE_LENGTH) return;
    let cancelled = false;
    verifyPasscode(code).then((ok) => {
      if (cancelled) return;
      if (ok) { setLocked(false); setCode(''); setError(''); }
      else {
        setCode('');
        setTries(attempts());
        setError('PIN salah.');
      }
    });
    return () => { cancelled = true; };
  }, [code]);

  if (locked === null) return null;
  if (!locked) return <>{children}</>;

  const phone = getIdentity()?.phone ?? null;
  const press = (d: string) => setCode((c) => (c.length < PASSCODE_LENGTH ? c + d : c));

  /**
   * Clear the PIN and the session, then send her back to the login screen.
   *
   * This is deliberately NOT a secret-protected reset. A PIN cannot be
   * stronger than the front door it sits behind, and the front door is a
   * phone number with no OTP — anyone who knows her number can already
   * install the app fresh and sign in as her. So requiring a sign-in after
   * a reset is exactly as strong as the system already was, and needs no
   * code, no SMS and no supervisor.
   *
   * The queue is untouched, and SyncDaemon keeps uploading it even from this
   * screen, so the cost of a forgotten PIN is access, never data.
   */
  function handleForgot() {
    clearPasscode();
    clearIdentity();
    window.location.href = '/';
  }

  if (forgot) {
    return (
      <main style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: 26, maxWidth: 380, margin: '0 auto',
      }}>
        <h1 style={{ fontSize: 19, margin: '0 0 12px' }}>Atur ulang PIN</h1>
        <p style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.6, margin: '0 0 12px' }}>
          PIN akan dihapus dan Anda keluar dari aplikasi. Untuk masuk lagi,
          Anda perlu sinyal sebentar.
        </p>
        <p style={{ fontSize: 14.5, color: C.teal, lineHeight: 1.6, margin: '0 0 22px' }}>
          Data kunjungan yang belum terkirim <strong>tidak akan hilang</strong> &mdash;
          tetap tersimpan dan terkirim otomatis saat ada sinyal.
        </p>
        <button onClick={handleForgot} style={{
          padding: 15, borderRadius: 11, background: C.teal, color: '#04241E',
          fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer',
        }}>
          Hapus PIN &amp; keluar
        </button>
        <button onClick={() => setForgot(false)} style={{
          marginTop: 12, padding: 13, borderRadius: 11, background: 'transparent',
          color: C.dim, fontSize: 14, border: `1px solid ${C.border}`, cursor: 'pointer',
        }}>
          Batal
        </button>
      </main>
    );
  }

  return (
    <main style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24, maxWidth: 340, margin: '0 auto',
    }}>
      <div style={{ fontSize: 30, marginBottom: 10 }}>🔒</div>
      <h1 style={{ fontSize: 18, margin: '0 0 6px', textAlign: 'center' }}>Masukkan PIN</h1>
      <p style={{ fontSize: 13, color: C.dim, textAlign: 'center', margin: '0 0 22px', lineHeight: 1.55 }}>
        Data ibu di perangkat ini bersifat pribadi.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        {Array.from({ length: PASSCODE_LENGTH }).map((_, i) => (
          <span key={i} style={{
            width: 13, height: 13, borderRadius: '50%',
            background: i < code.length ? C.teal : 'transparent',
            border: `1.5px solid ${i < code.length ? C.teal : C.border}`,
          }} />
        ))}
      </div>

      <div style={{ minHeight: 20, marginBottom: 10 }}>
        {error && <span style={{ fontSize: 13, color: C.red }}>{error}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: '100%' }}>
        {['1','2','3','4','5','6','7','8','9'].map((d) => (
          <Key key={d} onClick={() => press(d)}>{d}</Key>
        ))}
        <span />
        <Key onClick={() => press('0')}>0</Key>
        <Key onClick={() => setCode((c) => c.slice(0, -1))} aria-label="Hapus">⌫</Key>
      </div>

      {/* From the first attempt, not the sixth. A midwife who has forgotten
          her PIN does not discover the way out by failing five more times. */}
      <button onClick={() => setForgot(true)} style={{
        marginTop: 22, background: 'none', border: 'none', cursor: 'pointer',
        color: C.dim, fontSize: 13, textDecoration: 'underline', padding: 8,
      }}>
        Lupa PIN?
      </button>

      {tries >= 3 && (
        <p style={{ fontSize: 12, color: C.dimmer, textAlign: 'center', marginTop: 4, lineHeight: 1.6 }}>
          {phone ? `Masuk sebagai ${phone}.` : ''} Data kunjungan Anda aman.
        </p>
      )}
    </main>
  );
}

function Key({ children, onClick, ...rest }: {
  children: React.ReactNode; onClick: () => void; 'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      style={{
        padding: '17px 0', fontSize: 21, fontWeight: 600, borderRadius: 12,
        background: 'rgba(255,255,255,0.06)', color: C.white,
        border: `1px solid ${C.border}`, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
