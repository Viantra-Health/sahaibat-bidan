'use client';

// app/anc/baru/page.tsx
// "Bukan salah satu di atas" — registering a mother the register does not know.
//
// This is a first-class path, not a punishment. With name-only search in a
// population of mononyms there will be visits a midwife genuinely cannot
// resolve in the field, and blocking her is not an option: the alternative to
// an easy "register new" is not a better match, it is an unrecorded visit.
//
// The safety net is on the server, not here. At sync it re-runs the tiered
// match over the whole register and flags a collision for review rather than
// merging or duplicating silently.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalisePhone } from '@sahaibat/identity';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { saveAncVisit } from '@/lib/saveVisit';
import { syncPendingVisits } from '@/lib/syncClient';
import AncForm, { EMPTY_FORM, type AncFormValues } from '@/components/AncForm';

const C = { teal: '#02C39A', dim: 'rgba(255,255,255,0.55)', border: 'rgba(2,195,154,0.28)', red: '#FF6B6B' };

function ageFromDob(dob: string): number | null {
  const d = new Date(dob);
  if (!Number.isFinite(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 10 && age <= 60 ? age : null;
}

export default function NewMotherPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [step, setStep] = useState<'who' | 'visit'>('who');

  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const [values, setValues] = useState<AncFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ score: number; refer: boolean } | null>(null);

  useEffect(() => {
    const id = getIdentity();
    if (!id) router.replace('/'); else setIdentity(id);
  }, [router]);

  const age = dob ? ageFromDob(dob) : null;

  function next() {
    if (!name.trim()) { setError('Nama ibu wajib diisi.'); return; }
    if (phone.trim() && !normalisePhone(phone)) {
      setError('Nomor HP tidak valid. Contoh: 081234567890');
      return;
    }
    setError('');
    setStep('visit');
  }

  async function handleSave() {
    if (!identity || saving) return;
    setSaving(true);
    try {
      const visit = await saveAncVisit({
        identity,
        memberId: null,             // unresolved — the server matches at sync
        motherName: name.trim(),
        motherAge: age,
        values,
      });
      // Registration details ride along in the payload; the server uses them
      // for the match ladder (NIK → phone → name-in-village) it runs on arrival.
      visit.data = { ...visit.data, _register: { name: name.trim(), dob: dob || null, phone: normalisePhone(phone) } };
      const { saveVisit } = await import('@/lib/offlineStore');
      await saveVisit(visit);

      setSaved({ score: visit.qualityScore ?? 0, refer: !!visit.referNow });
      syncPendingVisits().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  if (!identity) return null;

  if (saved) {
    return (
      <main style={wrap}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>✅</div>
        <h1 style={{ fontSize: 21, margin: '0 0 6px' }}>Kunjungan tersimpan</h1>
        <p style={{ color: C.dim, margin: '0 0 4px', lineHeight: 1.6 }}>
          {name} · {values.visitType} · skor 10T {saved.score}/10
        </p>
        <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 13, lineHeight: 1.6 }}>
          Ibu baru akan dicocokkan dengan data pusat saat sinkronisasi.
        </p>
        {saved.refer && (
          <p style={{ color: C.red, fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
            Rujukan dibuat — pastikan ibu dirujuk hari ini.
          </p>
        )}
        <button onClick={() => router.replace('/search')} style={primaryBtn}>Selesai</button>
      </main>
    );
  }

  if (step === 'who') {
    return (
      <main style={{ padding: 20, maxWidth: 460, margin: '0 auto' }}>
        <button onClick={() => router.back()} style={linkBtn}>← Kembali</button>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>Daftarkan ibu baru</h1>
        <p style={{ fontSize: 13, color: C.dim, margin: '0 0 20px', lineHeight: 1.55 }}>
          Isi seperlunya. Hanya nama yang wajib — sisanya membantu mencocokkan
          ibu ini dengan data yang mungkin sudah ada.
        </p>

        <Input label="Nama ibu" value={name} onChange={setName} placeholder="Siti Aminah" required />
        <Input label="Tanggal lahir" value={dob} onChange={setDob} type="date" />
        {age != null && <p style={{ fontSize: 12, color: C.dim, margin: '-6px 0 12px' }}>Usia {age} tahun</p>}

        <Input label="Nomor HP (opsional)" value={phone} onChange={setPhone}
          placeholder="081234567890" numeric />
        <p style={{ fontSize: 12, color: C.dim, margin: '-6px 0 18px', lineHeight: 1.55 }}>
          Nomor membantu menghubungkan ibu dengan catatan Kader dan layanan Kasih.
          Boleh dikosongkan.
        </p>

        {error && <p style={{ color: C.red, fontSize: 13.5, marginBottom: 14 }}>{error}</p>}

        <button onClick={next} style={primaryBtn}>Lanjut ke pemeriksaan →</button>
      </main>
    );
  }

  return (
    <main style={{ padding: 20, maxWidth: 460, margin: '0 auto' }}>
      <button onClick={() => setStep('who')} style={linkBtn}>← Ubah data ibu</button>
      <AncForm
        motherName={name}
        motherAge={age}
        subtitle={[age != null ? `${age} th` : null, 'ibu baru'].filter(Boolean).join(' · ')}
        values={values}
        onChange={setValues}
        onSave={handleSave}
        saving={saving}
      />
    </main>
  );
}

function Input({ label, value, onChange, placeholder, type, numeric, required }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; numeric?: boolean; required?: boolean;
}) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ fontSize: 12.5, color: C.dim, display: 'block', marginBottom: 5 }}>
        {label}{required ? ' *' : ''}
      </span>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? 'numeric' : undefined}
        style={{
          width: '100%', padding: '12px 14px', fontSize: 16, borderRadius: 10,
          background: 'rgba(255,255,255,0.06)', color: '#fff',
          border: `1px solid ${C.border}`, outline: 'none',
        }}
      />
    </label>
  );
}

const wrap: React.CSSProperties = {
  padding: 24, maxWidth: 420, margin: '0 auto', minHeight: '100dvh',
  display: 'flex', flexDirection: 'column', justifyContent: 'center',
};
const primaryBtn: React.CSSProperties = {
  width: '100%', marginTop: 8, padding: 15, borderRadius: 11, background: C.teal,
  color: '#04241E', fontWeight: 700, fontSize: 15.5, border: 'none', cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'rgba(255,255,255,.5)',
  fontSize: 13, padding: 0, marginBottom: 14, cursor: 'pointer',
};
