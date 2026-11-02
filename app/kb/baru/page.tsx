'use client';

// app/kb/baru/page.tsx
// A family-planning client the register does not know.
//
// ── THE DOOR THAT WAS MISSING ────────────────────────────────────────────
//
// Until now the only ways into the register were antenatal, postnatal and
// neonatal. A woman who comes to the bidan for contraception is often none of
// the three — not pregnant, not recently delivered — and there was nothing to
// do but file her as one of them to get her recorded at all. That is a false
// clinical record written to work around a missing route, and it is what the
// field reported: family planning showing up under Nifas.
//
// ── IT DOES NOT MAKE A MOTHER ────────────────────────────────────────────
//
// The objection to a route like this was always duplicates — a fourth door
// into the register is a fourth chance of a second row for one woman. The
// answer is the same one /anc/baru relies on and not a new one: the device
// sends what it was told in `_register`, and the SERVER runs the tiered match
// ladder on arrival (NIK → phone → name-in-village) and decides whether she
// is somebody it already has. Nothing here decides she is new.
//
// ── AND IT ASSERTS NOTHING ABOUT A PREGNANCY ─────────────────────────────
//
// An antenatal registration says she is pregnant; a postnatal one says she
// has delivered. A family-planning contact says neither — it makes a
// pregnancy less likely and establishes nothing — so the sync registers her
// with `pregnant: null`, which leaves the flag exactly as it found it. A
// woman the register already knows to be pregnant does not stop being
// pregnant because somebody counselled her.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalisePhone, parseNik, isNikShapeValid, nikDisagreements } from '@sahaibat/identity';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import KbRecord from '@/components/KbRecord';
import AppHeader from '@/components/AppHeader';
import { useLang } from '@/lib/lang';
import { C } from '@/components/ui';

function ageFromDob(dob: string): number | null {
  const d = new Date(dob);
  if (!Number.isFinite(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 10 && age <= 60 ? age : null;
}

export default function NewKbClientPage() {
  const router = useRouter();
  const { t } = useLang();
  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [step, setStep] = useState<'who' | 'kb'>('who');

  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [nik, setNik] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const id = getIdentity();
    if (!id) router.replace('/'); else setIdentity(id);
  }, [router]);

  // A NIK carries the birth date, so entering one fills in the age without
  // her typing it twice. What she typed always wins over what we derived.
  const nikInfo = nik.trim() ? parseNik(nik) : null;
  const effectiveDob = dob || nikInfo?.dob || '';
  const age = effectiveDob ? ageFromDob(effectiveDob) : null;
  const nikBad = nik.trim().length > 0 && !isNikShapeValid(nik);
  const nikConflicts = nikDisagreements(nik, { dob: dob || null });

  function next() {
    if (!name.trim()) { setError(t('Nama klien wajib diisi.', 'The client’s name is required.')); return; }
    if (nikBad) { setError(t('NIK harus 16 angka.', 'NIK must be 16 digits.')); return; }
    if (phone.trim() && !normalisePhone(phone)) {
      setError(t('Nomor HP tidak valid. Contoh: 081234567890', 'Invalid phone number. Example: 081234567890'));
      return;
    }
    setError('');
    setStep('kb');
  }

  if (!identity) return null;

  if (step === 'kb') {
    return (
      /* The back link is handed to KbRecord rather than drawn here. Wrapping
         the component in a div with its own link put that link ABOVE the app
         header, outside the page's own column — caught in the browser, not by
         the build. */
      <KbRecord
        identity={identity}
        onBack={() => setStep('who')}
        backLabel={t('← Ubah data klien', '← Edit her details')}
        subject={{
          /* Unresolved on purpose — the server matches her at sync. */
          memberId: null,
          name: name.trim(),
          village: identity.village ?? null,
          /* No delivery, so no KBPP window and no postpartum restriction. A
             client who HAS delivered recently is reached from her own
             register row, where the date is known. */
          deliveryDate: null,
          record: null,
          registration: {
            name: name.trim(),
            dob: effectiveDob || null,
            phone: normalisePhone(phone),
            nik: isNikShapeValid(nik) ? nik.replace(/\D/g, '') : null,
          },
        }}
      />
    );
  }

  return (
    <main style={{ padding: 20, maxWidth: 460, margin: '0 auto' }}>
      <AppHeader name={identity.name} village={identity.village} />
      <button onClick={() => router.back()} style={linkBtn}>{t('← Kembali', '← Back')}</button>
      <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>
        {t('Klien KB baru', 'New family planning client')}
      </h1>
      <p style={{ fontSize: 13, color: C.dim, margin: '0 0 20px', lineHeight: 1.55 }}>
        {t('Untuk klien yang datang untuk KB dan tidak sedang hamil atau nifas. Isi seperlunya — hanya nama yang wajib; sisanya membantu mencocokkan dengan data yang mungkin sudah ada.',
           'For a client who has come for family planning and is neither pregnant nor postnatal. Fill in what you can — only the name is required; the rest helps match her to records that may already exist.')}
      </p>

      <Input label={t('Nama klien', 'Client’s name')} value={name} onChange={setName} placeholder="Siti Aminah" required />
      <Input label={t('NIK (opsional)', 'NIK (optional)')} value={nik} onChange={setNik}
        placeholder="3271045508920001" numeric />
      {nikBad && (
        <p style={{ fontSize: 12, color: C.red, margin: '-6px 0 12px', lineHeight: 1.5 }}>
          {t('NIK harus 16 angka.', 'NIK must be 16 digits.')}
        </p>
      )}
      {/* Structure only. A NIK has no checksum, so this can say the shape is
          right and the birthday inside it — never that the number is real. */}
      {nikInfo?.dob && !dob && (
        <p style={{ fontSize: 12, color: C.ok, margin: '-6px 0 12px', lineHeight: 1.5 }}>
          {t(`Dari NIK: lahir ${nikInfo.dob}${nikInfo.sex === 'P' ? ', perempuan' : ''}`,
             `From NIK: born ${nikInfo.dob}${nikInfo.sex === 'P' ? ', female' : ''}`)}
        </p>
      )}
      {nikConflicts.includes('dob') && (
        <p style={{ fontSize: 12, color: C.amber, margin: '-6px 0 12px', lineHeight: 1.5 }}>
          {t('Tanggal lahir berbeda dengan NIK — periksa lagi. Tetap bisa disimpan.',
             'Date of birth differs from the NIK — check it. You can still save.')}
        </p>
      )}

      <Input label={t('Tanggal lahir', 'Date of birth')} value={dob} onChange={setDob} type="date" />
      {age != null && <p style={{ fontSize: 12, color: C.dim, margin: '-6px 0 12px' }}>Usia {age} tahun</p>}

      <Input label={t('Nomor HP (opsional)', 'Phone number (optional)')} value={phone} onChange={setPhone}
        placeholder="081234567890" numeric />
      <p style={{ fontSize: 12, color: C.dim, margin: '-6px 0 18px', lineHeight: 1.55 }}>
        {t('Nomor membantu menghubungkan klien dengan catatan yang sudah ada. Boleh dikosongkan.',
           'The number helps link her to records that already exist. It may be left blank.')}
      </p>

      {/* NO KASIH OPT-IN HERE, and that is deliberate rather than forgotten.
          Kasih is pregnancy reminders — "pengingat kehamilan" is what the
          antenatal screen offers — and enrolling a woman who is not pregnant
          into a pregnancy service is an opt-in to the wrong thing. She can be
          offered it at an antenatal visit, where it is true. */}

      {error && <p style={{ color: C.red, fontSize: 13.5, marginBottom: 14 }}>{error}</p>}

      <button onClick={next} style={primaryBtn}>
        {t('Lanjut ke layanan KB →', 'Continue to family planning →')}
      </button>
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
          background: C.field, color: C.white,
          border: `1px solid ${C.border}`, outline: 'none',
        }}
      />
    </label>
  );
}

const primaryBtn: React.CSSProperties = {
  width: '100%', marginTop: 8, padding: 15, borderRadius: 11, background: C.teal,
  color: C.onAccent, fontWeight: 700, fontSize: 15.5, border: 'none', cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: C.dim,
  fontSize: 13, padding: 0, marginBottom: 14, cursor: 'pointer',
};
