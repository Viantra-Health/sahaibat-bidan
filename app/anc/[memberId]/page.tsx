'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { getRegisterRecord, type RegisterRecord } from '@/lib/offlineStore';
import { saveAncVisit } from '@/lib/saveVisit';
import { syncPendingVisits } from '@/lib/syncClient';
import AncForm, { EMPTY_FORM, type AncFormValues } from '@/components/AncForm';

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
  const [saved, setSaved] = useState<{ score: number; refer: boolean } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const id = getIdentity();
    if (!id) { router.replace('/'); return; }
    setIdentity(id);

    getRegisterRecord(memberId).then((r) => {
      if (!r) { setNotFound(true); return; }
      setRecord(r);
      setValues((v) => ({ ...v, gestationalWeeks: weeksFromEdd(r.edd) }));
    });
  }, [memberId, router]);

  async function handleSave() {
    if (!identity || !record || saving) return;
    setSaving(true);
    try {
      const visit = await saveAncVisit({
        identity,
        memberId: record.memberId,   // a confirmed identity stays confirmed
        motherName: record.name,
        motherAge: record.ageYears,
        values,
      });
      setSaved({ score: visit.qualityScore ?? 0, refer: !!visit.referNow });
      // Best-effort. The visit is already durable in IndexedDB, so a failure
      // here changes nothing except when it reaches the dashboard.
      syncPendingVisits().catch(() => {});
    } finally {
      setSaving(false);
    }
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
        <h1 style={{ fontSize: 21, margin: '0 0 6px' }}>Kunjungan tersimpan</h1>
        <p style={{ color: 'rgba(255,255,255,.6)', margin: '0 0 4px', lineHeight: 1.6 }}>
          {record.name} · {values.visitType} · skor 10T {saved.score}/10
        </p>
        <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 13, lineHeight: 1.6 }}>
          Tersimpan di perangkat. Akan terkirim otomatis saat ada sinyal.
        </p>
        {saved.refer && (
          <p style={{ color: '#FF6B6B', fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
            Rujukan dibuat — pastikan ibu dirujuk hari ini.
          </p>
        )}
        <button onClick={() => router.replace('/search')} style={backBtn}>Selesai</button>
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
      <button onClick={() => router.back()} style={{
        background: 'none', border: 'none', color: 'rgba(255,255,255,.5)',
        fontSize: 13, padding: 0, marginBottom: 14, cursor: 'pointer',
      }}>← Kembali</button>

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
  marginTop: 20, padding: 14, borderRadius: 11, background: '#02C39A',
  color: '#04241E', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer',
};
