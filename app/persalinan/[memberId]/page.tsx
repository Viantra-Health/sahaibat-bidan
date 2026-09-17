'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { getRegisterRecord, type RegisterRecord } from '@/lib/offlineStore';
import { saveDeliveryVisit } from '@/lib/saveVisit';
import { syncPendingVisits } from '@/lib/syncClient';
import DeliveryForm, { EMPTY_DELIVERY, toDeliveryInput, type DeliveryFormValues } from '@/components/DeliveryForm';
import VisitHistory from '@/components/VisitHistory';
import AppHeader from '@/components/AppHeader';
import { buildReferralLetter, shareReferralLetter } from '@/lib/referralLetter';
import { generateDeliveryFlags, shouldReferDelivery } from '@sahaibat/anc-engine';
import { useLang } from '@/lib/lang';
import { C } from '@/components/ui';

/** Weeks of a 40-week pregnancy at a given date, from EDD. */
function weeksAt(edd: string | null, on: string): string {
  if (!edd) return '';
  const left = (new Date(edd).getTime() - new Date(on).getTime()) / (7 * 86_400_000);
  if (!Number.isFinite(left)) return '';
  const gw = Math.round(40 - left);
  return gw > 15 && gw <= 45 ? String(gw) : '';
}

export default function DeliveryPage() {
  const router = useRouter();
  const { memberId } = useParams<{ memberId: string }>();
  const { t } = useLang();

  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [record, setRecord] = useState<RegisterRecord | null>(null);
  const [values, setValues] = useState<DeliveryFormValues>(EMPTY_DELIVERY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ refer: boolean; urgency: string; babies: number } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const id = getIdentity();
    if (!id) { router.replace('/'); return; }
    setIdentity(id);
    getRegisterRecord(memberId).then((r) => {
      if (!r) { setNotFound(true); return; }
      setRecord(r);
      // Her EDD already implies the gestational age at this birth, so she
      // does not retype a number the register can work out — and a wrong one
      // silently decides whether this was preterm.
      setValues((v) => ({ ...v, gestationalWeeks: weeksAt(r.edd, v.deliveryDate) }));
    });
  }, [memberId, router]);

  async function handleSave() {
    if (!identity || !record || saving) return;
    setSaving(true);
    try {
      const visit = await saveDeliveryVisit({
        identity, memberId: record.memberId, motherName: record.name, values,
      });
      const flags = generateDeliveryFlags(toDeliveryInput(values) as any);
      setSaved({
        refer: !!visit.referNow,
        urgency: shouldReferDelivery(flags).urgency,
        babies: values.babies.filter((b) => b.outcome !== 'mati').length,
      });
      syncPendingVisits().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  function handleLetter() {
    if (!record || !identity) return;
    const flags = generateDeliveryFlags(toDeliveryInput(values) as any);
    shareReferralLetter(buildReferralLetter({
      kind: 'pnc',
      patientName: record.name,
      ageYears: record.ageYears,
      village: record.village,
      bidanName: identity.name,
      facility: identity.village,
      visitType: 'Persalinan',
      context: values.gestationalWeeks ? `Usia kehamilan ${values.gestationalWeeks} minggu` : null,
      findings: [
        values.bloodLossMl ? `Perdarahan ${values.bloodLossMl} ml` : null,
        values.mode ? `Cara persalinan ${values.mode}` : null,
        values.complications || null,
        ...values.babies.map((b, i) =>
          b.weightGrams ? `Bayi ${i + 1}: ${b.weightGrams} g${b.outcome === 'mati' ? ', lahir mati' : ''}` : null),
      ].filter(Boolean) as string[],
      reasons: flags.filter((f) => f.referral).map((f) => f.message_id),
    }), record.name);
  }

  if (notFound) {
    return (
      <main style={wrap}>
        <p style={{ color: C.dim, lineHeight: 1.6 }}>
          {t('Ibu ini tidak ada di data lokal perangkat.', 'She is not in this device’s local data.')}
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
        <h1 style={{ fontSize: 21, fontWeight: 800, margin: '0 0 6px' }}>
          {t('Persalinan tersimpan', 'Birth recorded')}
        </h1>
        <p style={{ color: C.dim, margin: '0 0 4px', lineHeight: 1.6 }}>
          {record.name} · {values.deliveryDate}
        </p>
        {saved.babies > 0 && (
          <p style={{ color: C.ok, fontSize: 14, lineHeight: 1.6 }}>
            {t(`${saved.babies} bayi akan terdaftar dan muncul di daftar Kader desa ini.`,
               `${saved.babies} baby/babies will be registered and appear in this village's Kader list.`)}
          </p>
        )}
        <p style={{ color: C.dimmer, fontSize: 13, lineHeight: 1.6 }}>
          {t('Tersimpan di perangkat. Akan terkirim otomatis saat ada sinyal.',
             'Saved on the device. It will upload automatically when there is signal.')}
        </p>
        {saved.refer && (
          <>
            <p style={{ color: C.red, fontSize: 14, lineHeight: 1.6, marginTop: 12, fontWeight: 600 }}>
              {saved.urgency === 'emergency'
                ? t('RUJUKAN DARURAT — dampingi ibu sekarang.', 'EMERGENCY REFERRAL — stay with her now.')
                : t('Rujukan dibuat.', 'A referral was created.')}
            </p>
            <button onClick={handleLetter} style={letterBtn}>
              {t('📄 Buat surat rujukan', '📄 Create referral letter')}
            </button>
          </>
        )}
        <button onClick={() => router.replace('/search')} style={backBtn}>
          {t('Selesai', 'Done')}
        </button>
      </main>
    );
  }

  const subtitle = [
    record.ageYears != null ? `${record.ageYears} th` : null,
    record.village,
  ].filter(Boolean).join(' · ');

  return (
    <main style={{ padding: 20, maxWidth: 460, margin: '0 auto' }}>
      <AppHeader name={identity.name} village={identity.village} />
      <button onClick={() => router.back()} style={{
        background: 'none', border: 'none', color: C.dim,
        fontSize: 13, padding: 0, marginBottom: 14, cursor: 'pointer',
      }}>{t('← Kembali', '← Back')}</button>

      <VisitHistory history={record.history} />

      <DeliveryForm
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
  marginTop: 20, minHeight: 48, padding: 14, borderRadius: 11, background: C.teal,
  color: C.onAccent, fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer',
};
const letterBtn: React.CSSProperties = {
  marginTop: 14, minHeight: 48, padding: 13, borderRadius: 11, background: 'transparent',
  color: C.white, fontWeight: 600, fontSize: 14.5,
  border: `1px solid ${C.red}`, cursor: 'pointer',
};
