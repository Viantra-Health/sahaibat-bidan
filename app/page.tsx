'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { normalisePhone } from '@sahaibat/identity';
import { saveIdentity, isLoggedIn } from '@/lib/auth';
import { syncRegister } from '@/lib/syncClient';

const C = {
  bg: '#0D1F1C',
  teal: '#02C39A',
  white: '#FFFFFF',
  dim: 'rgba(255,255,255,0.55)',
  dimmer: 'rgba(255,255,255,0.28)',
  border: 'rgba(2,195,154,0.28)',
  red: '#FF6B6B',
};

export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    if (isLoggedIn()) router.replace('/search');
  }, [router]);

  async function handleLogin() {
    if (!phone.trim() || loading) return;
    setLoading(true);
    setError('');

    // Same canonical form the server matches on, so "0812…", "+62812…" and
    // "812…" all find the same profile.
    const normalised = normalisePhone(phone);
    if (!normalised) {
      setError('Nomor tidak valid. Contoh: 081234567890');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalised }),
      });
      if (!res.ok) throw new Error('Server error');
      const data = await res.json();

      if (!data.found) {
        setError('Nomor belum terdaftar sebagai Bidan. Hubungi koordinator Anda.');
        setLoading(false);
        return;
      }

      saveIdentity({
        profileId: data.profileId,
        name: data.name,
        ngoId: data.ngoId,
        facilityId: data.facilityId ?? null,
        regionId: data.regionId ?? null,
        village: data.village ?? null,
        phone: normalised,
        savedAt: new Date().toISOString(),
      });

      // Pull the register while we still have the signal this login needed.
      // Non-blocking: an empty register is recoverable, a blocked login is not.
      syncRegister(data.profileId, true).catch(() => {});
      router.replace('/search');
    } catch {
      setError(
        navigator.onLine
          ? 'Terjadi kesalahan. Coba lagi.'
          : 'Tidak ada koneksi. Login pertama kali membutuhkan internet sebentar.'
      );
      setLoading(false);
    }
  }

  if (!mounted) return null;

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      justifyContent: 'center', padding: 24, maxWidth: 420, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>🏥</div>
        <h1 style={{ fontSize: 26, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          SahAIbat <span style={{ color: C.teal }}>Bidan</span>
        </h1>
        <p style={{ color: C.dim, margin: 0, fontSize: 15, lineHeight: 1.5 }}>
          Dokumentasi ANC &amp; PNC. Bekerja tanpa sinyal.
        </p>
      </div>

      <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: C.dim }}>
        Nomor WhatsApp terdaftar
      </label>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
        placeholder="081234567890"
        style={{
          width: '100%', padding: '14px 16px', fontSize: 17, borderRadius: 12,
          background: 'rgba(255,255,255,0.06)', color: C.white,
          border: `1.5px solid ${C.border}`, outline: 'none', marginBottom: 14,
        }}
      />

      {error && (
        <p role="alert" style={{ color: C.red, fontSize: 14, margin: '0 0 14px', lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      <button
        onClick={handleLogin}
        disabled={loading || !phone.trim()}
        style={{
          width: '100%', padding: 16, fontSize: 16, fontWeight: 700, borderRadius: 12,
          background: loading || !phone.trim() ? 'rgba(2,195,154,0.35)' : C.teal,
          color: loading || !phone.trim() ? C.dim : '#04241E',
          border: 'none', cursor: loading || !phone.trim() ? 'default' : 'pointer',
        }}
      >
        {loading ? 'Memeriksa…' : 'Masuk'}
      </button>

      <p style={{ color: C.dimmer, fontSize: 12.5, marginTop: 18, lineHeight: 1.6 }}>
        Cukup nomor Anda — tidak ada kode OTP. Login pertama membutuhkan internet
        sebentar; setelah itu aplikasi bekerja penuh tanpa sinyal.
      </p>
    </main>
  );
}
