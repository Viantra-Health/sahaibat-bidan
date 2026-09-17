'use client';

// components/PasscodePrompt.tsx
// Offers a device PIN once, on the register screen, after she is already in.
//
// Not on the login screen: the first thing a new user meets should be the app
// working, not a security chore. And not compulsory — a midwife who declines
// still needs the register, and a lock she was forced into is a lock she will
// write on the back of the phone.

import { useEffect, useState } from 'react';
import { isPasscodeSet, setPasscode, PASSCODE_LENGTH } from '@/lib/passcode';
import { C } from './ui';
import { useLang } from '@/lib/lang';

const DISMISSED = 'sahaibat_bidan_pin_prompt_dismissed';

export default function PasscodePrompt() {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const { t } = useLang();

  useEffect(() => {
    try {
      setShow(!isPasscodeSet() && localStorage.getItem(DISMISSED) !== '1');
    } catch { setShow(false); }
  }, []);

  if (!show) return null;

  if (done) {
    return (
      <div style={box}>
        <span style={{ fontSize: 13, color: C.teal }}>{t('✓ PIN aktif. Diminta setiap membuka aplikasi.', '✓ PIN active. Asked each time you open the app.')}</span>
      </div>
    );
  }

  async function save() {
    if (code.length !== PASSCODE_LENGTH) { setError(`PIN harus ${PASSCODE_LENGTH} angka.`); return; }
    if (code !== confirm) { setError('PIN tidak sama.'); return; }
    try {
      await setPasscode(code);
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'Gagal menyimpan PIN.');
    }
  }

  function dismiss() {
    try { localStorage.setItem(DISMISSED, '1'); } catch { /* ignore */ }
    setShow(false);
  }

  return (
    <div style={box}>
      {!open ? (
        <>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 10 }}>
            {t('Kunci aplikasi dengan PIN? Daftar ibu hamil di desa ini tersimpan di perangkat.',
                'Lock the app with a PIN? The list of pregnant women in this village is stored on the device.')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setOpen(true)} style={{ ...pill, borderColor: C.teal, color: C.teal }}>
              {t('Buat PIN', 'Create PIN')}
            </button>
            <button onClick={dismiss} style={pill}>{t('Nanti saja', 'Later')}</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: C.dim, marginBottom: 9 }}>
            {t(`${PASSCODE_LENGTH} angka. Lupa PIN? Bisa dihapus dari perangkat — data kunjungan tidak akan hilang.`,
                `${PASSCODE_LENGTH} digits. Forget it? You can clear it on the device — your recorded visits will not be lost.`)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}>
            <Pin value={code} onChange={setCode} placeholder={t('PIN', 'PIN')} />
            <Pin value={confirm} onChange={setConfirm} placeholder={t('Ulangi', 'Repeat')} />
          </div>
          {error && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 9 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} style={{ ...pill, borderColor: C.teal, color: C.teal }}>{t('Simpan', 'Save')}</button>
            <button onClick={() => { setOpen(false); setError(''); }} style={pill}>{t('Batal', 'Cancel')}</button>
          </div>
        </>
      )}
    </div>
  );
}

function Pin({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, PASSCODE_LENGTH))}
      placeholder={placeholder}
      inputMode="numeric"
      type="password"
      style={{
        flex: 1, padding: '10px 12px', fontSize: 16, borderRadius: 9, letterSpacing: '.3em',
        background: C.field, color: C.white,
        border: `1px solid ${C.border}`, outline: 'none',
      }}
    />
  );
}

const box: React.CSSProperties = {
  padding: '13px 15px', borderRadius: 11, marginBottom: 14,
  background: C.accentSoft, border: `1px solid rgba(2,195,154,0.28)`,
  color: C.white,
};
const pill: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, background: 'transparent',
  color: C.dim, fontSize: 13, cursor: 'pointer',
  border: `1px solid ${C.border}`,
};
