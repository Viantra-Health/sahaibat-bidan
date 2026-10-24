'use client';

// app/kb/[memberId]/page.tsx
// Family planning for a woman the register knows.
//
// There is no `kb/baru`, deliberately. Family planning follows a pregnancy or
// a birth in all but the rarest case, so she is already in the register — and
// a creation route here would be a fourth way to make a mother, with a fourth
// chance of making a duplicate. If she genuinely is not known, she is
// registered through the antenatal or postnatal route first and this page is
// reached from her record.
//
// WHAT THIS PAGE ADDS OVER THE FORM
//
// The KBPP window. Forty-two days after delivery is the window that matters
// most — a woman who goes home without a method is the one who returns
// pregnant — and the midwife should not be counting days on a doorstep. The
// engine computes it from the delivery date, so a corrected delivery date
// corrects the window.

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { getRegisterRecord, getLocalDeliveryDate, type RegisterRecord } from '@/lib/offlineStore';
import { saveKbVisit } from '@/lib/saveVisit';
import { syncPendingVisits } from '@/lib/syncClient';
import KbForm, { EMPTY_KB, type KbFormValues } from '@/components/KbForm';
import { kbppWindow, KBPP_DAYS } from '@sahaibat/anc-engine';
import { C } from '@/components/ui';
import { useLang } from '@/lib/lang';
import AppHeader from '@/components/AppHeader';
import { todayLocal } from '@/lib/plausibility';

export default function KbPage() {
  const router = useRouter();
  const { memberId } = useParams<{ memberId: string }>();
  const { t } = useLang();

  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [record, setRecord] = useState<RegisterRecord | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const [values, setValues] = useState<KbFormValues>(EMPTY_KB);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const id = getIdentity();
    if (!id) { router.replace('/'); return; }
    setIdentity(id);
    setValues((v) => ({ ...v, visitDate: todayLocal() }));
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

  const win = deliveryDate ? kbppWindow(deliveryDate, todayLocal()) : null;
  const kbppNote = win
    ? win.state === 'closed'
      ? t(`Masa KBPP sudah lewat — hari ke-${win.day} setelah bersalin (batas ${KBPP_DAYS} hari, ${win.closes_on}). Tetap dilayani; catat saja apa adanya.`,
          `The KBPP window has closed — day ${win.day} after delivery (the ${KBPP_DAYS}-day limit fell on ${win.closes_on}). Still serve her; just record it as it is.`)
      : win.state === 'closing'
        ? t(`Masa KBPP hampir tutup — hari ke-${win.day}, tutup ${win.closes_on}. Konseling perlu diatur sekarang.`,
            `The KBPP window is closing — day ${win.day}, closes ${win.closes_on}. Counselling needs arranging now.`)
        : t(`Masa KBPP terbuka — hari ke-${win.day} setelah bersalin, tutup ${win.closes_on}.`,
            `The KBPP window is open — day ${win.day} after delivery, closes ${win.closes_on}.`)
    : null;

  async function handleSave() {
    if (!identity || !record || saving) return;
    setSaving(true);
    try {
      await saveKbVisit({
        identity,
        memberId: record.memberId,
        motherName: record.name,
        deliveryDate,
        values,
      });
      setSaved(true);
      syncPendingVisits().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

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

  if (saved) {
    return (
      <main style={wrap}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>✅</div>
        <h1 style={{ fontSize: 21, margin: '0 0 6px' }}>
          {t('Catatan KB tersimpan', 'Family planning record saved')}
        </h1>
        <p style={{ color: C.dim, margin: '0 0 4px', lineHeight: 1.6 }}>{record.name}</p>
        <p style={{ color: C.dimmer, fontSize: 13, lineHeight: 1.6 }}>
          {t('Tersimpan di perangkat. Akan terkirim otomatis saat ada sinyal, dan dokter di klinik yang sama bisa melihatnya.',
             'Saved on the device. It uploads when there is signal, and the doctor at the same clinic can see it.')}
        </p>
        <button onClick={() => router.replace('/search')} style={primaryBtn}>
          {t('Selesai', 'Done')}
        </button>
      </main>
    );
  }

  return (
    <>
      <AppHeader />
      <main style={{ padding: 20, maxWidth: 480, margin: '0 auto' }}>
        <button onClick={() => router.back()} style={linkBtn}>
          {t('← Kembali', '← Back')}
        </button>
        <KbForm
          motherName={record.name}
          subtitle={[record.village, t('Keluarga Berencana', 'Family planning')]
            .filter(Boolean).join(' · ')}
          kbppNote={kbppNote}
          values={values}
          onChange={setValues}
          onSave={handleSave}
          saving={saving}
        />
      </main>
    </>
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
