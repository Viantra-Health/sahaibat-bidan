'use client';

// The newborn visit page.
//
// The one page in this app whose patient is a baby. Two consequences run
// through it: the register record IS the baby (her mother is context, carried
// on the record as motherName), and the day of life is computed from her date
// of birth rather than typed — a midwife should not have to count days on a
// doorstep, and the whole rule set turns on that number.

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { getRegisterRecord, type RegisterRecord } from '@/lib/offlineStore';
import { saveKnVisit } from '@/lib/saveVisit';
import { syncPendingVisits } from '@/lib/syncClient';
import KnForm, { EMPTY_KN, toKnInput, type KnFormValues } from '@/components/KnForm';
import { buildReferralLetter, shareReferralLetter } from '@/lib/referralLetter';
import ReferralPanel from '@/components/ReferralPanel';
import { generateKnFlags, shouldReferKn, knForDay } from '@sahaibat/anc-engine';
import { useLang } from '@/lib/lang';
import AppHeader from '@/components/AppHeader';
import { C } from '@/components/ui';

export default function KnVisitPage() {
  const router = useRouter();
  const { memberId } = useParams<{ memberId: string }>();

  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [record, setRecord] = useState<RegisterRecord | null>(null);
  const [values, setValues] = useState<KnFormValues>(EMPTY_KN);
  const [saving, setSaving] = useState(false);
  const { t } = useLang();
  const [saved, setSaved] = useState<{ refer: boolean; urgency: string } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const id = getIdentity();
    if (!id) { router.replace('/'); return; }
    setIdentity(id);
    getRegisterRecord(memberId).then((r) => {
      if (!r) { setNotFound(true); return; }
      setRecord(r);

      // Prefill the day and the visit type from her date of birth. She can
      // change both: the record may have the wrong birth date, and the visit
      // being recorded may have happened days ago.
      const today = new Date().toISOString().split('T')[0];
      if (r.dob) {
        const days = Math.floor((Date.now() - new Date(r.dob).getTime()) / 86_400_000);
        if (Number.isFinite(days) && days >= 0) {
          setValues((v) => ({
            ...v,
            dayOfLife: String(days),
            visitType: knForDay(days) ?? 'KN3',
            birthDate: r.dob!,
            visitDate: today,
          }));
          return;
        }
      }
      setValues((v) => ({ ...v, visitDate: today }));
    });
  }, [memberId, router]);

  const babyName = record?.name ?? '';

  async function handleSave() {
    if (!identity || !record || saving) return;
    setSaving(true);
    try {
      const visit = await saveKnVisit({
        identity,
        memberId: record.memberId,
        babyName: record.name,
        motherName: record.motherName ?? record.name,
        values,
      });
      const flags = generateKnFlags(toKnInput(values) as any);
      setSaved({ refer: !!visit.referNow, urgency: shouldReferKn(flags).urgency });
      syncPendingVisits().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  function handleLetter() {
    if (!record || !identity) return;
    const flags = generateKnFlags(toKnInput(values) as any);
    const day = parseInt(values.dayOfLife, 10);
    shareReferralLetter(buildReferralLetter({
      kind: 'kn',
      patientName: record.name,
      ageDays: Number.isFinite(day) ? day : null,
      motherName: record.motherName,
      village: record.village,
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

  if (notFound) {
    return (
      <main style={wrap}>
        <p style={{ color: C.dim, lineHeight: 1.6 }}>
          {t('Bayi ini tidak ada di data lokal perangkat. Coba cari lagi.',
              'This baby is not in this device’s local data. Search again.')}
        </p>
        <button onClick={() => router.replace('/search')} style={backBtn}>
          {t('← Kembali ke pencarian', '← Back to search')}
        </button>
      </main>
    );
  }

  if (!identity || !record) return null;

  if (saved) {
    return (
      <main style={wrap}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>✅</div>
        <h1 style={{ fontSize: 21, margin: '0 0 6px' }}>
          {t('Kunjungan neonatal tersimpan', 'Newborn visit saved')}
        </h1>
        <p style={{ color: C.dim, margin: '0 0 4px', lineHeight: 1.6 }}>
          {babyName} · {values.visitType} · {t('usia', 'day')} {values.dayOfLife || '?'} {t('hari', '')}
        </p>
        <p style={{ color: C.dimmer, fontSize: 13, lineHeight: 1.6 }}>
          {t('Tersimpan di perangkat. Akan terkirim otomatis saat ada sinyal.',
              'Saved on the device. It will upload automatically when there is signal.')}
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
        <button onClick={() => router.replace('/search')} style={backBtn}>{t('Selesai', 'Done')}</button>
      </main>
    );
  }

  const subtitle = [
    record.motherName ? `${t('anak dari', 'child of')} ${record.motherName}` : null,
    record.village,
  ].filter(Boolean).join(' · ');

  return (
    <main style={{ padding: 20, maxWidth: 460, margin: '0 auto' }}>
      <AppHeader name={identity.name} village={identity.village} />
      <button onClick={() => router.back()} style={{
        background: 'none', border: 'none', color: C.dim,
        fontSize: 13, padding: 0, marginBottom: 14, cursor: 'pointer',
      }}>{t('← Kembali', '← Back')}</button>

      <KnForm
        babyName={babyName}
        subtitle={subtitle || null}
        values={values}
        onChange={setValues}
        onSave={handleSave}
        saving={saving}
      />
    </main>
  );
}

const wrap: React.CSSProperties = {
  padding: 24, maxWidth: 420, margin: '0 auto', minHeight: '100dvh',
  display: 'flex', flexDirection: 'column', justifyContent: 'center',
};
const backBtn: React.CSSProperties = {
  marginTop: 20, padding: 14, borderRadius: 11, background: C.teal,
  color: C.onAccent, fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer',
};
