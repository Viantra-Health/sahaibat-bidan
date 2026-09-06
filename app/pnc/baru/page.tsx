'use client';

// app/pnc/baru/page.tsx
// A postnatal visit for a mother the register does not know.
//
// Rarer than the antenatal equivalent — she was usually pregnant here first —
// but it happens: a woman who delivered elsewhere and came home, or one whose
// antenatal care was on paper. Turning her away because the register has not
// caught up would lose the visit that matters most, since postnatal is where
// deaths concentrate.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { normalisePhone } from '@sahaibat/identity';
import { savePncVisit } from '@/lib/saveVisit';
import { syncPendingVisits } from '@/lib/syncClient';
import PncForm, { EMPTY_PNC, toPncInput, type PncFormValues } from '@/components/PncForm';
import { buildReferralLetter, shareReferralLetter } from '@/lib/referralLetter';
import ReferralPanel from '@/components/ReferralPanel';
import { generatePncFlags, shouldReferPnc } from '@sahaibat/anc-engine';
import { C } from '@/components/ui';

function ageFromDob(dob: string): number | null {
  const d = new Date(dob);
  if (!Number.isFinite(d.getTime())) return null;
  const years = (Date.now() - d.getTime()) / (365.25 * 86_400_000);
  return years > 0 && years < 120 ? Math.floor(years) : null;
}

export default function NewPncPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [step, setStep] = useState<'who' | 'visit'>('who');

  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const [values, setValues] = useState<PncFormValues>(EMPTY_PNC);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ refer: boolean; urgency: string } | null>(null);

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
      const visit = await savePncVisit({
        identity,
        memberId: null,             // unresolved — the server matches at sync
        motherName: name.trim(),
        values,
      });
      visit.data = {
        ...visit.data,
        _register: { name: name.trim(), dob: dob || null, phone: normalisePhone(phone) },
      };
      const { saveVisit } = await import('@/lib/offlineStore');
      await saveVisit(visit);

      const flags = generatePncFlags(toPncInput(values) as any);
      setSaved({ refer: !!visit.referNow, urgency: shouldReferPnc(flags).urgency });
      syncPendingVisits().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  function handleLetter() {
    if (!identity) return;
    const flags = generatePncFlags(toPncInput(values) as any);
    shareReferralLetter(buildReferralLetter({
      kind: 'pnc',
      patientName: name.trim(),
      ageYears: age,
      village: identity.village,
      bidanName: identity.name,
      facility: identity.village,
      visitType: values.visitType,
      context: values.daysPostpartum ? `Hari ke-${values.daysPostpartum} pascasalin` : null,
      findings: [
        values.bpSystolic && values.bpDiastolic ? `TD ${values.bpSystolic}/${values.bpDiastolic} mmHg` : null,
        values.temperatureC ? `Suhu ${values.temperatureC} °C` : null,
        values.bleeding === 'high' ? 'Perdarahan banyak' : null,
        values.lochiaFoul ? 'Lokia berbau' : null,
        values.woundInfected ? 'Luka terinfeksi' : null,
        values.babyWeightKg ? `Berat bayi ${values.babyWeightKg} kg` : null,
        values.epdsScore ? `EPDS ${values.epdsScore}/30` : null,
        values.complaints || null,
      ].filter(Boolean) as string[],
      reasons: flags.filter((f) => f.referral).map((f) => f.message_id),
    }), name.trim());
  }

  if (!identity) return null;

  if (saved) {
    return (
      <main style={wrap}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>✅</div>
        <h1 style={{ fontSize: 21, margin: '0 0 6px' }}>Kunjungan nifas tersimpan</h1>
        <p style={{ color: C.dim, margin: '0 0 4px', lineHeight: 1.6 }}>
          {name} · {values.visitType} · hari ke-{values.daysPostpartum || '?'}
        </p>
        <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 13, lineHeight: 1.6 }}>
          Ibu baru akan dicocokkan dengan data pusat saat sinkronisasi.
        </p>
        {saved.refer && (
          <>
            <p style={{ color: C.red, fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
              {saved.urgency === 'emergency'
                ? 'RUJUKAN DARURAT — dampingi ibu sekarang.'
                : 'Rujukan dibuat — pastikan ibu dirujuk hari ini.'}
            </p>
            <ReferralPanel
              profileId={identity.profileId}
              urgency={saved.urgency as any}
              onLetter={handleLetter}
            />
          </>
        )}
        <button onClick={() => router.replace('/search')} style={primaryBtn}>Selesai</button>
      </main>
    );
  }

  if (step === 'who') {
    return (
      <main style={{ padding: 20, maxWidth: 460, margin: '0 auto' }}>
        <button onClick={() => router.back()} style={linkBtn}>← Kembali</button>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>Kunjungan nifas — ibu baru</h1>
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
      <PncForm
        motherName={name}
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
