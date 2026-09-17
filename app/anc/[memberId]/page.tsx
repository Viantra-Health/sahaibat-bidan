'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { getRegisterRecord, type RegisterRecord } from '@/lib/offlineStore';
import { saveAncVisit } from '@/lib/saveVisit';
import { syncPendingVisits } from '@/lib/syncClient';
import AncForm, { EMPTY_FORM, toEngineInputs, type AncFormValues } from '@/components/AncForm';
import { buildReferralLetter, shareReferralLetter } from '@/lib/referralLetter';
import ReferralPanel from '@/components/ReferralPanel';
import { generateClinicalFlags, shouldRefer } from '@sahaibat/anc-engine';
import { ancPlausible, ancImplausibleReason } from '@/lib/search';
import { useLang } from '@/lib/lang';
import AppHeader from '@/components/AppHeader';
import VisitHistory from '@/components/VisitHistory';
import DuePanel from '@/components/DuePanel';
import { C } from '@/components/ui';

/** Weeks elapsed of a 40-week pregnancy, derived from EDD. Saves her retyping
 *  a number the register already knows — and a wrong gestational age silently
 *  changes which 10T items are expected and whether malpresentation flags. */
function weeksFromEdd(edd: string | null): string {
  if (!edd) return '';
  const due = new Date(edd).getTime();
  if (!Number.isFinite(due)) return '';
  const weeksRemaining = (due - Date.now()) / (7 * 86_400_000);
  const gw = Math.round(40 - weeksRemaining);
  return gw > 0 && gw <= 45 ? String(gw) : '';
}

export default function AncVisitPage() {
  const router = useRouter();
  const { memberId } = useParams<{ memberId: string }>();

  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [record, setRecord] = useState<RegisterRecord | null>(null);
  const [values, setValues] = useState<AncFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { t } = useLang();
  const [saved, setSaved] = useState<{ score: number; refer: boolean; urgency: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const id = getIdentity();
    if (!id) { router.replace('/'); return; }
    setIdentity(id);

    getRegisterRecord(memberId).then((r) => {
      if (!r) { setNotFound(true); return; }
      setRecord(r);
      // Carry P4K forward. What was arranged at K3 is still arranged at K4,
      // and re-asking every visit is how a checklist stops being filled.
      const bp = r.birthPlan;
      setValues((v) => ({
        ...v,
        gestationalWeeks: weeksFromEdd(r.edd),
        p4kFasilitas: bp?.fasilitas ?? '',
        p4kTransportasi: bp?.transportasi ?? '',
        p4kDonorDarah: bp?.donorDarah ?? '',
        p4kPendanaan: bp?.pendanaan ?? '',
        p4kPendamping: bp?.pendamping ?? '',
      }));
    });
  }, [memberId, router]);

  async function handleSave(skipReasons?: Record<string, string>) {
    if (!identity || !record || saving) return;
    setSaving(true);
    try {
      const visit = await saveAncVisit({
        identity,
        memberId: record.memberId,   // a confirmed identity stays confirmed
        motherName: record.name,
        motherAge: record.ageYears,
        values,
        skipReasons,
      });
      const { clinical } = toEngineInputs(values, record.ageYears);
      const urgency = shouldRefer(generateClinicalFlags(clinical as any)).urgency;
      setSaved({ score: visit.qualityScore ?? 0, refer: !!visit.referNow, urgency });
      // Best-effort. The visit is already durable in IndexedDB, so a failure
      // here changes nothing except when it reaches the dashboard.
      syncPendingVisits().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  // Rung 4 of the referral ladder: a letter she carries. Needs no network, no
  // provider on the platform, and nobody at the other end who has heard of us.
  function handleLetter() {
    if (!record || !identity) return;
    const { clinical } = toEngineInputs(values, record.ageYears);
    const flags = generateClinicalFlags(clinical as any);
    shareReferralLetter(buildReferralLetter({
      kind: 'anc',
      patientName: record.name,
      ageYears: record.ageYears,
      village: record.village,
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
        values.fundalHeightCm ? `TFU ${values.fundalHeightCm} cm` : null,
        values.presentation ? `Presentasi ${values.presentation}` : null,
        values.complaints || null,
      ].filter(Boolean) as string[],
      reasons: flags.filter((f) => f.referral).map((f) => f.message_id),
    }), record.name);
  }

  if (notFound) {
    return (
      <main style={wrap}>
        <p style={{ color: C.dim, lineHeight: 1.6 }}>
          {t('Ibu ini tidak ada di data lokal perangkat. Coba cari lagi, atau daftarkan baru.',
              'She is not in this device’s local data. Search again, or register her as new.')}
        </p>
        <button onClick={() => router.replace('/search')} style={backBtn}>← Kembali ke pencarian</button>
      </main>
    );
  }

  if (!identity || !record) return null;

  // Ask once before opening an antenatal form on a record that cannot
  // plausibly be pregnant. Without this a mis-tap does not produce a blank
  // form — it produces a red pregnancy warning about a twelve-year-old boy,
  // because the engine flags on age alone and the tap asserted a pregnancy
  // nobody actually claimed.
  if (!confirmed && !ancPlausible(record)) {
    const reason = ancImplausibleReason(record);
    return (
      <main style={wrap}>
        <div style={{ fontSize: 30, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ fontSize: 19, margin: '0 0 8px' }}>{t('Periksa dulu', 'Check first')}</h1>
        <p style={{ color: C.white, lineHeight: 1.6, margin: '0 0 6px' }}>
          <strong>{record.name}</strong>{reason ? ` — ${reason}` : ''}
          {record.village ? ` · ${record.village}` : ''}.
        </p>
        <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.6 }}>
          {t('Ini bukan profil yang biasa untuk pemeriksaan kehamilan. Lanjutkan hanya jika Anda yakin ini orang yang benar.',
              'This is not a usual profile for an antenatal check. Continue only if you are sure this is the right person.')}
        </p>
        <button onClick={() => setConfirmed(true)} style={backBtn}>
          Ya, lanjutkan pemeriksaan
        </button>
        <button onClick={() => router.replace('/search')} style={{
          marginTop: 12, padding: 13, borderRadius: 11, background: 'transparent',
          color: C.dim, fontSize: 14,
          border: '1px solid rgba(2,195,154,.28)', cursor: 'pointer',
        }}>
          Bukan dia — cari lagi
        </button>
      </main>
    );
  }

  if (saved) {
    return (
      <main style={wrap}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>✅</div>
        <h1 style={{ fontSize: 21, margin: '0 0 6px' }}>{t('Kunjungan tersimpan', 'Visit saved')}</h1>
        <p style={{ color: C.dim, margin: '0 0 4px', lineHeight: 1.6 }}>
          {record.name} · {values.visitType} · skor 10T {saved.score}/10
        </p>
        <p style={{ color: C.dimmer, fontSize: 13, lineHeight: 1.6 }}>
          {t('Tersimpan di perangkat. Akan terkirim otomatis saat ada sinyal.',
              'Saved on the device. It will upload automatically when there is signal.')}
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
        <button onClick={() => router.replace('/search')} style={backBtn}>{t('Selesai', 'Done')}</button>
      </main>
    );
  }

  const subtitle = [
    record.ageYears != null ? `${record.ageYears} th` : null,
    record.village,
    record.edd ? `HPL ${record.edd}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <main style={{ padding: 20, maxWidth: 460, margin: '0 auto' }}>
      <AppHeader name={identity.name} village={identity.village} />
      <button onClick={() => router.back()} style={{
        background: 'none', border: 'none', color: C.dim,
        fontSize: 13, padding: 0, marginBottom: 14, cursor: 'pointer',
      }}>{t('← Kembali', '← Back')}</button>

      {/* What is still outstanding comes first: it is the reason she is
          here. What happened last time is the context for it. */}
      <DuePanel record={record} />

      <VisitHistory history={record.history} />

      <AncForm
        motherName={record.name}
        motherAge={record.ageYears}
        subtitle={subtitle}
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
