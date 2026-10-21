'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { referAfterSave } from '@/lib/referDecision';
import { getRegisterRecord, getLocalDeliveryDate, type RegisterRecord } from '@/lib/offlineStore';
import { savePncVisit } from '@/lib/saveVisit';
import { syncPendingVisits } from '@/lib/syncClient';
import PncForm, { EMPTY_PNC, toPncInput, type PncFormValues } from '@/components/PncForm';
import { buildReferralLetter } from '@/lib/referralLetter';
import ReferralPanel from '@/components/ReferralPanel';
import LetterSheet from '@/components/LetterSheet';
import { generatePncFlags, shouldReferPnc, kfForDay } from '@sahaibat/anc-engine';
import { useLang } from '@/lib/lang';
import { daysBetween } from '@/lib/plausibility';
import AppHeader from '@/components/AppHeader';
import VisitHistory from '@/components/VisitHistory';
import { C } from '@/components/ui';

export default function PncVisitPage() {
  const router = useRouter();
  const { memberId } = useParams<{ memberId: string }>();

  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [record, setRecord] = useState<RegisterRecord | null>(null);
  const [values, setValues] = useState<PncFormValues>(EMPTY_PNC);
  const [saving, setSaving] = useState(false);
  const { t } = useLang();
  const [saved, setSaved] = useState<{ refer: boolean; urgency: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  /* The letter is shown on screen, not just handed to the share sheet. The
     share sheet does not exist on every handset, and the popup fallback is
     blocked when it is not a direct user gesture -- so the one rung of the
     ladder that is meant to always work sometimes did nothing at all. */
  const [letter, setLetter] = useState<string | null>(null);

  useEffect(() => {
    const id = getIdentity();
    if (!id) { router.replace('/'); return; }
    setIdentity(id);
    getRegisterRecord(memberId).then((r) => {
      if (!r) { setNotFound(true); return; }
      setRecord(r);
      /* ── DAY OF THE PUERPERIUM, FROM THE BIRTH SHE ALREADY RECORDED ───────
         "Hari ke-" was blank on every postnatal visit, so she counted the days
         herself from a delivery that is sitting in the record two lines above.
         It decides which KF is suggested and which findings the engine treats
         as late, so an arithmetic slip at the end of a long day is a clinical
         one.

         Counted in the DEVICE's calendar, not from an instant -- see
         daysBetween. Left blank when there is no recorded birth: a guessed day
         is worse than an empty field she will fill in. Editable either way; a
         mother may well arrive on a day the register cannot predict. */
      /* The queue first, then the register. A birth recorded minutes ago has
         not been back from the server yet, and recording the delivery and then
         the postnatal visit is the ordinary order of her afternoon -- asking
         only the register got the answer from before the birth. */
      const fromRegister = (r.history ?? []).find((h) => h.kind === 'delivery' && h.date)?.date ?? null;
      getLocalDeliveryDate(r.memberId)
        .catch(() => null)
        .then((fromQueue) => {
          const birthDate = fromQueue ?? fromRegister;
          const day = birthDate ? daysBetween(birthDate) : null;

          /* ── WHICH POSTNATAL CONTACT THIS IS ──────────────────────────────
             The day alone is not enough. Ratna Dewi Uji already had KF1 on the
             day she delivered, and the form opened as KF1 again, because day 0
             says KF1 and nothing looked at what had already been done.

             So: the later of what the DAY suggests and what the RECORD leaves
             outstanding. A second visit on the day of delivery is KF2 only
             because KF1 was done -- the day cannot tell you that, and the
             record cannot tell you she is late. Still only a suggestion; the
             field stays editable and a late contact is never questioned. */
          const ORDER = ['KF1', 'KF2', 'KF3', 'KF4'];
          const done = new Set(
            (r.history ?? [])
              .filter((h) => h.kind === 'pnc' && h.visitType)
              .map((h) => String(h.visitType).toUpperCase()),
          );
          const byDay = day != null && day >= 0 ? kfForDay(day) : null;
          const nextUndone = ORDER.find((k) => !done.has(k)) ?? null;
          const pick = [byDay, nextUndone]
            .filter((k): k is string => !!k && ORDER.includes(k))
            .sort((a, b) => ORDER.indexOf(b) - ORDER.indexOf(a))[0] ?? null;

          setValues((v) => ({
            ...v,
            ...(day != null && day >= 0 ? { daysPostpartum: String(day) } : {}),
            ...(pick ? { visitType: pick as typeof v.visitType } : {}),
          }));
        });
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
      setSaved({ refer: referAfterSave(visit), urgency: shouldReferPnc(flags).urgency });
      syncPendingVisits().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  // Rung 4 of the referral ladder: a letter she can hand over. It needs no
  // network, no provider on the platform and nobody at the other end who has
  // heard of us — which is what actually happens in rural Indonesia.
  function handleLetter(destination?: string | null) {
    if (!record || !identity) return;
    const flags = generatePncFlags(toPncInput(values) as any);
    setLetter(buildReferralLetter({
      kind: 'pnc',
      destination,
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
        <p style={{ color: C.dim, lineHeight: 1.6 }}>
          {t('Ibu ini tidak ada di data lokal perangkat. Coba cari lagi, atau daftarkan baru.',
              'She is not in this device’s local data. Search again, or register her as new.')}
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
        <h1 style={{ fontSize: 21, margin: '0 0 6px' }}>{t('Kunjungan nifas tersimpan', 'Postnatal visit saved')}</h1>
        <p style={{ color: C.dim, margin: '0 0 4px', lineHeight: 1.6 }}>
          {record.name} · {values.visitType} · hari ke-{values.daysPostpartum || '?'}
        </p>
        <p style={{ color: C.dimmer, fontSize: 13, lineHeight: 1.6 }}>
          {t('Tersimpan di perangkat. Akan terkirim otomatis saat ada sinyal.',
              'Saved on the device. It will upload automatically when there is signal.')}
        </p>
        {saved.refer && (
          <>
            <p style={{ color: C.red, fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
              {saved.urgency === 'emergency'
                ? t('RUJUKAN DARURAT — dampingi ibu sekarang.', 'EMERGENCY REFERRAL — stay with her now.')
                : t('Rujukan dibuat — pastikan ibu dirujuk hari ini.', 'A referral was created — make sure she is referred today.')}
            </p>
            <ReferralPanel
              profileId={identity.profileId}
              urgency={saved.urgency as any}
              onLetter={handleLetter}
            />
          </>
        )}
        <button onClick={() => router.replace('/search')} style={backBtn}>{t('Selesai', 'Done')}</button>
        {/* Rung 4 of the referral ladder. This MUST sit in the same returned
            branch as the ReferralPanel above it. handleLetter only sets state;
            if the sheet is mounted in some other branch the button is silently
            dead, which is how it shipped -- the letter was built every time and
            had nowhere to appear. */}
        {letter && <LetterSheet text={letter} patientName={record.name} onClose={() => setLetter(null)} />}
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

      <PncForm
        motherName={record.name}
        subtitle={subtitle}
        values={values}
        onChange={setValues}
        onSave={handleSave}
        saving={saving}
        /* From the cached register, so the question works with no
           signal — the state she is usually in when it matters. */
        openReferral={record.openReferral}
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
