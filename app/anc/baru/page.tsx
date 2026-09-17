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
import { normalisePhone, parseNik, isNikShapeValid, nikDisagreements } from '@sahaibat/identity';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { saveAncVisit } from '@/lib/saveVisit';
import { syncPendingVisits } from '@/lib/syncClient';
import AncForm, { EMPTY_FORM, toEngineInputs, type AncFormValues } from '@/components/AncForm';
import { buildReferralLetter, shareReferralLetter } from '@/lib/referralLetter';
import ReferralPanel from '@/components/ReferralPanel';
import { generateClinicalFlags, shouldRefer } from '@sahaibat/anc-engine';
import { useLang } from '@/lib/lang';
import AppHeader from '@/components/AppHeader';
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

export default function NewMotherPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [step, setStep] = useState<'who' | 'visit'>('who');

  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [kasihOptIn, setKasihOptIn] = useState(false);
  const [nik, setNik] = useState('');
  const [error, setError] = useState('');

  const [values, setValues] = useState<AncFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { t } = useLang();
  const [saved, setSaved] = useState<{ score: number; refer: boolean; urgency: string } | null>(null);

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
    if (!name.trim()) { setError(t('Nama ibu wajib diisi.', 'The mother’s name is required.')); return; }
    if (nikBad) {
      setError(t('NIK harus 16 angka.', 'NIK must be 16 digits.'));
      return;
    }
    if (phone.trim() && !normalisePhone(phone)) {
      setError(t('Nomor HP tidak valid. Contoh: 081234567890', 'Invalid phone number. Example: 081234567890'));
      return;
    }
    setError('');
    setStep('visit');
  }

  async function handleSave(skipReasons?: Record<string, string>) {
    if (!identity || saving) return;
    setSaving(true);
    try {
      const visit = await saveAncVisit({
        identity,
        memberId: null,             // unresolved — the server matches at sync
        motherName: name.trim(),
        motherAge: age,
        values,
        skipReasons,
      });
      // Registration details ride along in the payload; the server uses them
      // for the match ladder (NIK → phone → name-in-village) it runs on arrival.
      visit.data = { ...visit.data, _register: {
          name: name.trim(), dob: effectiveDob || null, phone: normalisePhone(phone),
          nik: isNikShapeValid(nik) ? nik.replace(/\D/g, '') : null,
          // Only ever true when she actually ticked it. The server treats
          // anything else as no consent.
          kasihOptIn: kasihOptIn && !!normalisePhone(phone),
        } };
      const { saveVisit } = await import('@/lib/offlineStore');
      await saveVisit(visit);

      const { clinical } = toEngineInputs(values, age);
      const urgency = shouldRefer(generateClinicalFlags(clinical as any)).urgency;
      setSaved({ score: visit.qualityScore ?? 0, refer: !!visit.referNow, urgency });
      syncPendingVisits().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  // Rung 4: needs no network, no provider, nobody at the other end.
  function handleLetter() {
    if (!identity) return;
    const { clinical } = toEngineInputs(values, age);
    const flags = generateClinicalFlags(clinical as any);
    shareReferralLetter(buildReferralLetter({
      kind: 'anc',
      patientName: name.trim(),
      ageYears: age,
      village: identity.village,
      bidanName: identity.name,
      facility: identity.village,
      visitType: values.visitType,
      context: values.gestationalWeeks ? `Usia kehamilan ${values.gestationalWeeks} minggu` : null,
      findings: [
        values.bpSystolic && values.bpDiastolic ? `TD ${values.bpSystolic}/${values.bpDiastolic} mmHg` : null,
        values.labHb ? `Hb ${values.labHb} g/dL` : null,
        values.labProtein ? `Protein urin ${values.labProtein}` : null,
        values.lilaCm ? `LILA ${values.lilaCm} cm` : null,
        values.djjBpm ? `DJJ ${values.djjBpm} x/menit` : null,
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
        <h1 style={{ fontSize: 21, margin: '0 0 6px' }}>{t('Kunjungan tersimpan', 'Visit saved')}</h1>
        <p style={{ color: C.dim, margin: '0 0 4px', lineHeight: 1.6 }}>
          {name} · {values.visitType} · skor 10T {saved.score}/10
        </p>
        <p style={{ color: C.dimmer, fontSize: 13, lineHeight: 1.6 }}>
          {t('Ibu baru akan dicocokkan dengan data pusat saat sinkronisasi.',
              'A new mother is matched against central records at sync.')}
        </p>
        {saved.refer && (
          <>
            <p style={{ color: C.red, fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
              Rujukan dibuat — pastikan ibu dirujuk hari ini.
            </p>
            <ReferralPanel
              profileId={identity.profileId}
              urgency={saved.urgency as any}
              onLetter={handleLetter}
            />
          </>
        )}
        <button onClick={() => router.replace('/search')} style={primaryBtn}>{t('Selesai', 'Done')}</button>
      </main>
    );
  }

  if (step === 'who') {
    return (
      <main style={{ padding: 20, maxWidth: 460, margin: '0 auto' }}>
      <AppHeader name={identity.name} village={identity.village} />
        <button onClick={() => router.back()} style={linkBtn}>{t('← Kembali', '← Back')}</button>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>{t('Daftarkan ibu baru', 'Register a new mother')}</h1>
        <p style={{ fontSize: 13, color: C.dim, margin: '0 0 20px', lineHeight: 1.55 }}>
          {t('Isi seperlunya. Hanya nama yang wajib — sisanya membantu mencocokkan ibu ini dengan data yang mungkin sudah ada.',
              'Fill in what you can. Only the name is required — the rest helps match her to records that may already exist.')}
        </p>

        <Input label={t('Nama ibu', 'Mother’s name')} value={name} onChange={setName} placeholder="Siti Aminah" required />
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
          {t('Nomor membantu menghubungkan ibu dengan catatan Kader dan layanan Kasih. Boleh dikosongkan.',
              'The number links her to Kader records and the Kasih service. It may be left blank.')}
        </p>

        {/* Only once a number exists — an opt-in with nothing to send to is a
            checkbox that does nothing. Unticked by default and it must stay
            that way: enrolling a mother into a messaging service she did not
            choose is a consent problem before it is a growth problem, and her
            number plus her pregnancy is sensitive personal data under the PDP
            law. */}
        {!!normalisePhone(phone) && (
          <button
            type="button"
            role="checkbox"
            aria-checked={kasihOptIn}
            onClick={() => setKasihOptIn((v) => !v)}
            style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%',
              textAlign: 'left', padding: '12px 13px', borderRadius: 10, marginBottom: 18,
              background: kasihOptIn ? C.accentSoft : C.card2,
              border: `1px solid ${kasihOptIn ? C.teal : C.border}`, cursor: 'pointer',
            }}
          >
            <span style={{
              width: 17, height: 17, borderRadius: 4, flex: '0 0 auto', marginTop: 1,
              border: `1.5px solid ${kasihOptIn ? C.teal : C.dimmer}`,
              background: kasihOptIn ? C.teal : 'transparent',
              color: C.onAccent, fontSize: 12, fontWeight: 800, lineHeight: '15px', textAlign: 'center',
            }}>{kasihOptIn ? '✓' : ''}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.5, color: C.white }}>
              {t('Daftarkan ibu ke Kasih — pengingat kehamilan dan info kesehatan lewat WhatsApp, gratis.',
                  'Enrol her in Kasih — pregnancy reminders and health information over WhatsApp, free.')}
            </span>
          </button>
        )}

        {error && <p style={{ color: C.red, fontSize: 13.5, marginBottom: 14 }}>{error}</p>}

        <button onClick={next} style={primaryBtn}>{t('Lanjut ke pemeriksaan →', 'Continue to the examination →')}</button>
      </main>
    );
  }

  return (
    <main style={{ padding: 20, maxWidth: 460, margin: '0 auto' }}>
      <AppHeader name={identity.name} village={identity.village} />
      <button onClick={() => setStep('who')} style={linkBtn}>{t('← Ubah data ibu', '← Edit her details')}</button>
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
          background: C.field, color: C.white,
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
  color: C.onAccent, fontWeight: 700, fontSize: 15.5, border: 'none', cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: C.dim,
  fontSize: 13, padding: 0, marginBottom: 14, cursor: 'pointer',
};
