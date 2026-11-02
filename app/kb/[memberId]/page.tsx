'use client';

// app/kb/[memberId]/page.tsx
// Family planning for a woman the register knows.
//
// This page is the LOOKUP and nothing else. The screen itself —  the ABPK
// situation tabs, the screening, the verdict, the form — is components/
// KbRecord.tsx, shared with /kb/baru, so a client met for the first time and
// one already on the register are recorded on the same screen rather than on
// two that drift.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMemberId } from '@/lib/memberId';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { getRegisterRecord, getLocalDeliveryDate, type RegisterRecord } from '@/lib/offlineStore';
import KbRecord from '@/components/KbRecord';
import { useLang } from '@/lib/lang';
import { C } from '@/components/ui';

export default function KbPage() {
  const router = useRouter();
  // From the path here, or from ?m= on the static route — see lib/memberId.ts.
  const memberId = useMemberId();
  const { t } = useLang();

  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [record, setRecord] = useState<RegisterRecord | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const id = getIdentity();
    if (!id) { router.replace('/'); return; }
    setIdentity(id);
    getRegisterRecord(memberId).then((r) => {
      if (!r) { setNotFound(true); return; }
      setRecord(r);
      /* Her delivery, where this device recorded one. The register record
         carries no delivery date, so the queue is the source — and it is the
         honest one: a birth this midwife wrote down. */
      getLocalDeliveryDate(memberId)
        .then((d) => setDeliveryDate(d ?? null))
        .catch(() => {});
    });
  }, [memberId, router]);

  if (notFound) {
    return (
      <main style={wrap}>
        <p style={{ color: C.dim, lineHeight: 1.6 }}>
          {t('Orang ini tidak ada di data lokal perangkat. Coba cari lagi.',
             'This person is not in this device’s local data. Search again.')}
        </p>
        <button onClick={() => router.replace('/search')} style={primaryBtn}>
          {t('← Kembali ke pencarian', '← Back to search')}
        </button>
      </main>
    );
  }

  if (!identity || !record) return null;

  return (
    <KbRecord
      identity={identity}
      subject={{
        memberId: record.memberId,
        name: record.name,
        village: record.village,
        deliveryDate,
        record,
      }}
    />
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
