'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { getRegisterRecord, type RegisterRecord } from '@/lib/offlineStore';
import { savePncVisit } from '@/lib/saveVisit';
import { syncPendingVisits } from '@/lib/syncClient';
import PncForm, { EMPTY_PNC, toPncInput, type PncFormValues } from '@/components/PncForm';
import { buildReferralLetter, shareReferralLetter } from '@/lib/referralLetter';
import ReferralPanel from '@/components/ReferralPanel';
import { generatePncFlags, shouldReferPnc } from '@sahaibat/anc-engine';

export default function PncVisitPage() {
  const router = useRouter();
  const { memberId } = useParams<{ memberId: string }>();

  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [record, setRecord] = useState<RegisterRecord | null>(null);
  const [values, setValues] = useState<PncFormValues>(EMPTY_PNC);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ refer: boolean; urgency: string } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const id = getIdentity();
    if (!id) { router.replace('/'); return; }
    setIdentity(id);
    getRegisterRecord(memberId).then((r) => {
      if (!r) { setNotFound(true); return; }
      setRecord(r);
    });
  }, [memberId, router]);

  async function handleSave() {
    if (!identity || !record || saving) return;
    setSaving(true);
    try {
      const visit = await savePncVisit({
        identity,
        memberId: record.memberId,
        motherName: record.name,
        values,
      });
      const flags = generatePncFlags(toPncInput(values) as any);
      setSaved({ refer: !!visit.referNow, urgency: shouldReferPnc(flags).urgency });
      syncPendingVisits().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  // Rung 4 of the referral ladder: a letter she can hand over. It needs no
  // network, no provider on the platform and nobody at the other end who has
  // heard of us — which is what actually happens in rural Indonesia.
  function handleLetter() {
    if (!record || !identity) return;
    const flags = generatePncFlags(toPncInput(values) as any);
    shareReferralLetter(buildReferralLetter({
      kind: 'pnc',
      patientName: record.name,
      ageYears: record.ageYears,
      village: record.village,
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
    }));
  }

  if (notFound) {
    return (
      <main style={wrap}>
        <p style={{ color: 'rgba(255,255,255,.6)', lineHeight: 1.6 }}>
          Ibu ini tidak ada di data lokal perangkat. Coba cari lagi, atau daftarkan baru.
        </p>
        <button onClick={() => router.replace('/search')} style={backBtn}>← Kembali ke pencarian</button>
      </main>
    );
  }

  if (!identity || !record) return null;

  if (saved) {
    return (
      <main style={wrap}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>✅</div>
        <h1 style={{ fontSize: 21, margin: '0 0 6px' }}>Kunjungan nifas tersimpan</h1>
        <p style={{ color: 'rgba(255,255,255,.6)', margin: '0 0 4px', lineHeight: 1.6 }}>
          {record.name} · {values.visitType} · hari ke-{values.daysPostpartum || '?'}
        </p>
        <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 13, lineHeight: 1.6 }}>
          Tersimpan di perangkat. Akan terkirim otomatis saat ada sinyal.
        </p>
        {saved.refer && (
          <>
            <p style={{ color: '#FF6B6B', fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
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
        <button onClick={() => router.replace('/search')} style={backBtn}>Selesai</button>
      </main>
    );
  }

  const subtitle = [
    record.ageYears != null ? `${record.ageYears} th` : null,
    record.village,
  ].filter(Boolean).join(' · ');

  return (
    <main style={{ padding: 20, maxWidth: 460, margin: '0 auto' }}>
      <button onClick={() => router.back()} style={{
        background: 'none', border: 'none', color: 'rgba(255,255,255,.5)',
        fontSize: 13, padding: 0, marginBottom: 14, cursor: 'pointer',
      }}>← Kembali</button>

      <PncForm
        motherName={record.name}
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
  marginTop: 20, padding: 14, borderRadius: 11, background: '#02C39A',
  color: '#04241E', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer',
};
