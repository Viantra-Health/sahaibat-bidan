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
  HINT_AFTER_ATTEMPTS, PASSCODE_LENGTH, resetInstructions,
} from '@/lib/passcode';
import { getIdentity } from '@/lib/auth';
import { C } from './ui';

export default function PasscodeGate({ children }: { children: React.ReactNode }) {
  // Undecided until mounted: rendering the app and then hiding it would flash
  // the register on screen, which is exactly what this prevents.
  const [locked, setLocked] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [tries, setTries] = useState(0);

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

      {tries >= HINT_AFTER_ATTEMPTS && (
        <p style={{ fontSize: 12.5, color: C.dim, textAlign: 'center', marginTop: 22, lineHeight: 1.6 }}>
          Lupa PIN? {resetInstructions(phone)}
          {' '}Data kunjungan yang belum terkirim tidak akan hilang.
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
