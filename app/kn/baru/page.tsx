'use client';

// app/kn/baru/page.tsx
// A newborn visit for a baby the register does not know.
//
// WHY THIS PAGE HAD TO EXIST
//
// Every creation route in this app made a MOTHER: anc/baru and pnc/baru. The
// only way a baby ever entered the register was a delivery recorded here —
// bidan-sync registers each living baby off the delivery form. So a baby born
// at home, at a puskesmas or in a hospital, who then arrives for her first
// neonatal visit, could not be recorded as a person at all. The KN visit saved
// with a null member id and the server recorded it UNATTACHED: the visit
// existed and the child did not.
//
// That is most newborns a practice sees, and KN1 is due within 48 hours of
// birth — the visit where a sick newborn is still savable.
//
// WHY THE MOTHER IS PICKED AND NOT TYPED
//
// A newborn has no NIK and no phone, so none of the identity ladder applies to
// her, and matching her by name would merge two babies called "Bayi" in one
// village into one child. Her only safe anchor is her mother, who IS in the
// register — so this page picks the mother and attaches the baby to her
// household, rather than asking for a new family. That is also what makes the
// baby reach the clinic: the roster view publishes every active member of the
// family, and the clinic materialiser turns her into a patient from there.
//
// THREE STEPS, IN THE ORDER THE DOORSTEP RUNS
//
//   who   pick the mother from the register
//   baby  her name if she has one, sex, date of birth, birth weight
//   visit the ordinary KN form, with the day of life already counted

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { referAfterSave } from '@/lib/referDecision';
import { getRegister, getLocalDeliveryDate, type RegisterRecord } from '@/lib/offlineStore';
import { saveKnVisit } from '@/lib/saveVisit';
import { syncPendingVisits } from '@/lib/syncClient';
import KnForm, { EMPTY_KN, toKnInput, type KnFormValues } from '@/components/KnForm';
import { buildReferralLetter } from '@/lib/referralLetter';
import ReferralPanel from '@/components/ReferralPanel';
import { generateKnFlags, shouldReferKn, knForDay } from '@sahaibat/anc-engine';
import { C } from '@/components/ui';
import { useLang } from '@/lib/lang';
import AppHeader from '@/components/AppHeader';
import LetterSheet from '@/components/LetterSheet';
import { todayLocal, daysBetween } from '@/lib/plausibility';

/** Who can be a mother here: an adult woman in this midwife's own register. */
function mothersOf(register: RegisterRecord[]): RegisterRecord[] {
  return register.filter((r) => {
    // A baby is never her own mother. The register carries newborns too now,
    // and offering them in this list is how a child gets attached to a child.
    const months = r.ageMonths ?? null;
    if (months != null && months < 120) return false;
    const years = r.ageYears ?? null;
    if (years != null && years < 10) return false;
    return true;
  });
}

export default function NewKnPage() {
  const router = useRouter();
  const { t } = useLang();

  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [register, setRegister] = useState<RegisterRecord[]>([]);
  const [step, setStep] = useState<'who' | 'baby' | 'visit'>('who');

  const [query, setQuery] = useState('');
  const [mother, setMother] = useState<RegisterRecord | null>(null);

  const [babyName, setBabyName] = useState('');
  const [sex, setSex] = useState<'L' | 'P' | ''>('');
  const [birthDate, setBirthDate] = useState('');
  const [birthWeight, setBirthWeight] = useState('');
  const [error, setError] = useState('');

  const [values, setValues] = useState<KnFormValues>(EMPTY_KN);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ refer: boolean; urgency: string } | null>(null);
  const [letter, setLetter] = useState<string | null>(null);

  useEffect(() => {
    const id = getIdentity();
    if (!id) { router.replace('/'); return; }
    setIdentity(id);
    getRegister().then(setRegister).catch(() => {});
  }, [router]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = mothersOf(register);
    if (!q) return all.slice(0, 12);
    return all.filter((r) => (r.name ?? '').toLowerCase().includes(q)).slice(0, 12);
  }, [register, query]);

  /* The name as the SERVER will spell it when she has none.
     Byte for byte with mintNewbornForKn and registerNewborns in bidan-sync:
     the two origins converge on one register, and a baby who appeared under
     one spelling here and another there would be searched for once and found
     never. Shown to the midwife so she knows what she will be searching for. */
  const placeholderName = mother ? `Bayi Ny. ${mother.name ?? ''}`.trim() : '';
  const effectiveName = babyName.trim() || placeholderName;

  function chooseMother(r: RegisterRecord) {
    setMother(r);
    setError('');
    setStep('baby');
    /* A delivery THIS DEVICE recorded for her is the baby's birth date far
       more often than not, and it saves the one field a midwife on a doorstep
       is most likely to get wrong. The register record carries no delivery
       date, so it comes from the queue — which is also the honest source: it
       is a birth this midwife wrote down, not one inferred for her.
       Non-blocking; she can always type it. */
    getLocalDeliveryDate(r.memberId)
      .then((d) => { if (d) setBirthDate((prev) => prev || d); })
      .catch(() => {});
  }

  function toVisit() {
    if (!sex) {
      setError(t('Jenis kelamin bayi wajib diisi.', 'The baby’s sex is required.'));
      return;
    }
    if (!birthDate) {
      setError(t('Tanggal lahir wajib diisi — seluruh aturan neonatal bergantung pada usia hari.',
                 'The date of birth is required — every newborn rule turns on the day of life.'));
      return;
    }
    const today = todayLocal();
    const days = daysBetween(birthDate, today);
    if (days == null || !Number.isFinite(days) || days < 0) {
      setError(t('Tanggal lahir tidak masuk akal. Periksa kembali.',
                 'That date of birth cannot be right. Check it.'));
      return;
    }
    setError('');
    setValues((v) => ({
      ...v,
      birthDate,
      visitDate: today,
      dayOfLife: String(days),
      visitType: knForDay(days) ?? 'KN3',
      // Her birth weight is the baseline every later weight is read against,
      // and on this path it is the one number only the mother can supply.
      birthWeightGrams: birthWeight || v.birthWeightGrams,
    }));
    setStep('visit');
  }

  async function handleSave() {
    if (!identity || !mother || saving) return;
    setSaving(true);
    try {
      const visit = await saveKnVisit({
        identity,
        // Null on purpose: she has no member id yet. The server mints her,
        // in her mother's family, because of the flag below.
        memberId: null,
        motherMemberId: mother.memberId,
        babyName: effectiveName,
        motherName: mother.name ?? '',
        values,
        registerNewborn: { sex: sex || null },
      });
      const flags = generateKnFlags(toKnInput(values) as any);
      setSaved({ refer: referAfterSave(visit), urgency: shouldReferKn(flags).urgency });
      syncPendingVisits().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  function handleLetter(destination?: string | null) {
    if (!identity || !mother) return;
    const flags = generateKnFlags(toKnInput(values) as any);
    const day = parseInt(values.dayOfLife, 10);
    setLetter(buildReferralLetter({
      kind: 'kn',
      destination,
      patientName: effectiveName,
      ageDays: Number.isFinite(day) ? day : null,
      motherName: mother.name,
      village: mother.village,
      bidanName: identity.name,
      facility: identity.village,
      visitType: values.visitType,
      context: Number.isFinite(day) ? `Usia ${day} hari` : null,
      findings: [
        values.weightGrams ? `Berat ${values.weightGrams} g` : null,
        values.birthWeightGrams ? `Berat lahir ${values.birthWeightGrams} g` : null,
        values.temperatureC ? `Suhu ${values.temperatureC} °C` : null,
        values.feedingWell === false ? 'Tidak mau menyusu' : null,
        values.cordInfected ? 'Tali pusat terinfeksi' : null,
        values.jaundice ? 'Ikterus' : null,
        values.jaundicePalmsSoles ? 'Ikterus sampai telapak' : null,
        values.convulsions ? 'Kejang' : null,
        values.fastBreathing ? 'Napas cepat' : null,
        values.chestIndrawing ? 'Tarikan dinding dada' : null,
        values.lethargic ? 'Letargi' : null,
        values.note || null,
      ].filter(Boolean) as string[],
      reasons: flags.filter((f) => f.referral).map((f) => f.message_id),
    }));
  }

  if (!identity) return null;

  // ── Saved ─────────────────────────────────────────────────────────────────
  if (saved) {
    return (
      <main style={wrap}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>✅</div>
        <h1 style={{ fontSize: 21, margin: '0 0 6px' }}>
          {t('Bayi terdaftar dan kunjungan tersimpan', 'Baby registered and visit saved')}
        </h1>
        <p style={{ color: C.dim, margin: '0 0 4px', lineHeight: 1.6 }}>
          {effectiveName} · {values.visitType} · {t('usia', 'day')} {values.dayOfLife || '?'} {t('hari', '')}
        </p>
        <p style={{ color: C.dimmer, fontSize: 13, lineHeight: 1.6 }}>
          {t('Tersimpan di perangkat. Bayi akan masuk daftar setelah terkirim.',
             'Saved on the device. She joins the register once it uploads.')}
        </p>
        {saved.refer && (
          <>
            <p style={{ color: C.red, fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
              {saved.urgency === 'emergency'
                ? t('RUJUKAN DARURAT — bayi baru lahir memburuk dalam hitungan jam. Dampingi sekarang.',
                    'EMERGENCY REFERRAL — a newborn deteriorates within hours. Go with her now.')
                : t('Rujukan dibuat — pastikan bayi dirujuk hari ini.',
                    'A referral was created — make sure she is referred today.')}
            </p>
            <ReferralPanel
              profileId={identity.profileId}
              urgency={saved.urgency as any}
              onLetter={handleLetter}
            />
          </>
        )}
        <button onClick={() => router.replace('/search')} style={primaryBtn}>
          {t('Selesai', 'Done')}
        </button>
        {letter && <LetterSheet text={letter} onClose={() => setLetter(null)} />}
      </main>
    );
  }

  // ── Step 3: the visit ─────────────────────────────────────────────────────
  if (step === 'visit') {
    return (
      <>
        <AppHeader />
        <main style={{ padding: 20, maxWidth: 480, margin: '0 auto' }}>
          <button onClick={() => setStep('baby')} style={linkBtn}>
            {t('← Ubah data bayi', '← Change the baby’s details')}
          </button>
          <KnForm
            babyName={effectiveName}
            subtitle={mother ? `${t('Ibu', 'Mother')}: ${mother.name ?? ''}` : undefined}
            values={values}
            onChange={setValues}
            onSave={handleSave}
            saving={saving}
          />
        </main>
      </>
    );
  }

  // ── Step 2: the baby ──────────────────────────────────────────────────────
  if (step === 'baby') {
    return (
      <>
        <AppHeader />
        <main style={{ padding: 20, maxWidth: 480, margin: '0 auto' }}>
          <button onClick={() => { setMother(null); setStep('who'); }} style={linkBtn}>
            {t('← Pilih ibu lain', '← Pick a different mother')}
          </button>
          <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>
            {t('Bayi baru', 'A new baby')}
          </h1>
          <p style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.6, margin: '0 0 18px' }}>
            {t('Ibu', 'Mother')}: <strong style={{ color: C.white }}>{mother?.name}</strong>
            {mother?.village ? ` · ${mother.village}` : ''}
          </p>

          <Input
            label={t('Nama bayi', 'Baby’s name')}
            value={babyName}
            onChange={setBabyName}
            placeholder={placeholderName}
          />
          <p style={{ color: C.dimmer, fontSize: 12, lineHeight: 1.6, margin: '-8px 0 16px' }}>
            {t(`Boleh dikosongkan — bayi sering belum diberi nama. Akan tercatat sebagai “${placeholderName}”.`,
               `Can be left empty — babies are often unnamed for days. She will be recorded as “${placeholderName}”.`)}
          </p>

          <div style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 12.5, color: C.dim, display: 'block', marginBottom: 6 }}>
              {t('Jenis kelamin', 'Sex')} *
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['P', t('Perempuan', 'Female')], ['L', t('Laki-laki', 'Male')]] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSex(v)}
                  style={{
                    flex: 1, padding: 13, borderRadius: 10, fontSize: 15, cursor: 'pointer',
                    background: sex === v ? C.teal : C.field,
                    color: sex === v ? C.onAccent : C.white,
                    border: `1px solid ${sex === v ? C.teal : C.border}`,
                    fontWeight: sex === v ? 700 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Input
            label={t('Tanggal lahir', 'Date of birth')}
            value={birthDate}
            onChange={setBirthDate}
            type="date"
            required
          />
          <Input
            label={t('Berat lahir (gram)', 'Birth weight (grams)')}
            value={birthWeight}
            onChange={setBirthWeight}
            placeholder="3000"
            numeric
          />
          <p style={{ color: C.dimmer, fontSize: 12, lineHeight: 1.6, margin: '-8px 0 16px' }}>
            {t('Tanyakan ibu. Berat lahir adalah pembanding semua penimbangan berikutnya.',
               'Ask the mother. The birth weight is what every later weighing is read against.')}
          </p>

          {error && (
            <p style={{ color: C.red, fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>{error}</p>
          )}
          <button onClick={toVisit} style={primaryBtn}>
            {t('Lanjut ke pemeriksaan', 'Continue to the examination')}
          </button>
        </main>
      </>
    );
  }

  // ── Step 1: the mother ────────────────────────────────────────────────────
  return (
    <>
      <AppHeader />
      <main style={{ padding: 20, maxWidth: 480, margin: '0 auto' }}>
        <button onClick={() => router.replace('/search')} style={linkBtn}>
          {t('← Kembali', '← Back')}
        </button>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>
          {t('Kunjungan neonatal — bayi baru', 'Newborn visit — a new baby')}
        </h1>
        <p style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.6, margin: '0 0 18px' }}>
          {t('Pilih ibunya dulu. Bayi dicatat dalam keluarga ibunya, bukan keluarga baru.',
             'Pick her mother first. The baby is recorded in her mother’s household, not a new one.')}
        </p>

        <Input
          label={t('Cari nama ibu', 'Search the mother’s name')}
          value={query}
          onChange={setQuery}
          placeholder={t('Mis. Sari', 'e.g. Sari')}
        />

        {register.length === 0 && (
          <p style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.6 }}>
            {t('Data lokal masih kosong. Buka pencarian sekali saat ada sinyal agar daftar terunduh.',
               'This device has no local register yet. Open search once with signal so it downloads.')}
          </p>
        )}

        {register.length > 0 && candidates.length === 0 && (
          <p style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.6 }}>
            {t('Tidak ada ibu dengan nama itu. Jika ibunya belum terdaftar, daftarkan dia dulu lewat kunjungan nifas.',
               'No mother by that name. If she is not registered yet, register her first through a postnatal visit.')}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {candidates.map((r) => (
            <button
              key={r.memberId}
              type="button"
              onClick={() => chooseMother(r)}
              style={{
                textAlign: 'left', padding: '13px 14px', borderRadius: 11,
                background: C.card, border: `1px solid ${C.border}`,
                color: C.white, cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>
                {[r.village, r.edd ? `${t('HPL', 'EDD')} ${r.edd}` : null]
                  .filter(Boolean).join(' · ')}
              </div>
            </button>
          ))}
        </div>

        {register.length > 0 && (
          <p style={{ color: C.dimmer, fontSize: 12, lineHeight: 1.6, marginTop: 16 }}>
            {t('Jika persalinan dicatat di aplikasi ini, bayinya sudah ada di daftar — cari namanya langsung.',
               'If the birth was recorded in this app, the baby is already in the register — search for her directly.')}
          </p>
        )}
      </main>
    </>
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
