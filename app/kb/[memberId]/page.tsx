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
import {
  KbSituationPicker, KbReturnVisit,
  type KbSituation, type KbSpecialNeed, type ReturnOutcome,
} from '@/components/KbSituation';
import KbScreeningList, { useScreening, type ScreeningAnswers } from '@/components/KbScreening';
import {
  kbppWindow, KBPP_DAYS, kbFormulation, formulationsFor, needsFormulation,
  postpartumRestriction, provisionRequirement,
  verdictFor, displayCategory, categoryConditions,
} from '@sahaibat/anc-engine';
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
  /* ── THE ABPK STAGES ───────────────────────────────────────────────────
     'situasi' is the flipchart's welcome tab and comes FIRST, because opening
     on a method assumes the visit is "pick a contraceptive" and most are not.
     'ulang' is the purple tab, asked before anything is recorded. */
  const [stage, setStage] = useState<'situasi' | 'ulang' | 'form'>('situasi');
  const [situation, setSituation] = useState<KbSituation | null>(null);
  const [specialNeed, setSpecialNeed] = useState<KbSpecialNeed | null>(null);
  const [returnOutcome, setReturnOutcome] = useState<ReturnOutcome | null>(null);
  const [expanded, setExpanded] = useState<KbSituation | null>(null);
  const [answers, setAnswers] = useState<ScreeningAnswers>({});
  const [acknowledged, setAcknowledged] = useState(false);

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

  /* A method with a single formulation screens under that one without asking;
     otherwise the screening waits for the choice, because KPK and KPP have
     different lists and that is the whole point of the axis. */
  const only = !needsFormulation(values.methodCode) && values.methodCode
    ? formulationsFor(values.methodCode)[0]?.code
    : undefined;
  const screeningFormulation = values.formulationCode || only || '';
  const screening = useScreening(screeningFormulation, answers);

  const pp = screeningFormulation && deliveryDate
    ? postpartumRestriction(screeningFormulation, deliveryDate,
                            values.isBreastfeeding, values.visitDate || undefined)
    : null;
  const prov = screeningFormulation ? provisionRequirement(screeningFormulation) : null;

  /* The category, once her conditions are known. Only conditions answered YES
     are passed; verdictFor() drops the whole verdict to unknown if any of
     them has no transcribed row, which is almost always, and that is what
     sends the bidan to Roda KLOP rather than to a confident wrong answer. */
  const verdict = screeningFormulation && screening.present.length > 0
    ? verdictFor(screeningFormulation,
                 categoryConditions(screening.present.map((i) => i.condition.code)))
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
        /* Why she came and what the screening found, in the same two
           namespaced blocks DOK writes, so v_kb can carry them without
           translating. Null answers are KEPT — nobody asked is a finding. */
        screening: {
          abpk: {
            situation,
            special_need: specialNeed,
            return_outcome: returnOutcome,
            dual_protection_discussed: situation === 'ganda' ? true : null,
            recorded_at: values.visitDate || todayLocal(),
          },
          ...(screeningFormulation ? {
            medis: {
              formulation: screeningFormulation,
              source_pages: screening.source,
              answers,
              /* The INTENT only. Who and when are written by the sync from
                 the profile this request authenticated as — a device can say
                 anything, and an acknowledgement nobody can attribute is not
                 an acknowledgement. */
              acknowledged,
              unanswered: screening.unanswered.map((i) => i.condition.code),
              present: screening.present.map((i) => i.condition.code),
              /* The verdict AS IT STOOD when she was counselled, with the
                 guideline that produced it. A category recomputed years later
                 against a revised edition is a different fact, and the record
                 should say which one the conversation was based on. */
              ...(verdict ? {
                verdict: verdict.verdict,
                category: verdict.category,
                unscored: verdict.unscored,
                guideline: verdict.source,
              } : {}),
            },
          } : {}),
        },
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

  // ── Stage 1: why she came ───────────────────────────────────────────────
  if (stage === 'situasi') {
    return (
      <>
        <AppHeader />
        <main style={{ padding: 20, maxWidth: 480, margin: '0 auto' }}>
          <button onClick={() => router.back()} style={linkBtn}>
            {t('← Kembali', '← Back')}
          </button>
          <p style={{ fontSize: 13, color: C.dim, margin: '0 0 14px' }}>
            {record.name}{record.village ? ` · ${record.village}` : ''}
          </p>
          {kbppNote && (
            <div style={{
              borderRadius: 11, padding: '12px 14px', marginBottom: 16,
              background: C.card2, border: `1px solid ${C.border}`,
              fontSize: 13.5, lineHeight: 1.55, color: C.white,
            }}>{kbppNote}</div>
          )}
          <KbSituationPicker
            expanded={expanded}
            onExpand={setExpanded}
            onPick={(sit, need) => {
              setSituation(sit);
              setSpecialNeed(need);
              /* The return tab asks about complaints before anything is
                 recorded; every other situation goes straight to the form. */
              setStage(sit === 'ulang' ? 'ulang' : 'form');
            }}
          />
        </main>
      </>
    );
  }

  // ── Stage 2: the return visit ───────────────────────────────────────────
  if (stage === 'ulang') {
    return (
      <>
        <AppHeader />
        <main style={{ padding: 20, maxWidth: 480, margin: '0 auto' }}>
          <button onClick={() => setStage('situasi')} style={linkBtn}>
            {t('← Pilih keperluan lain', '← Choose a different reason')}
          </button>
          <KbReturnVisit
            methodLabel={null}
            onPick={(o) => {
              setReturnOutcome(o);
              /* Wanting to switch ends this method and starts another, so the
                 form opens with the ending ticked and a reason already set —
                 she said it, and asking again would read as not listening. */
              if (o === 'ganti') {
                setValues((v) => ({ ...v, ended: true, endReason: 'ganti_cara' }));
              } else if (o === 'efek_samping') {
                setValues((v) => ({ ...v, ended: false, endReason: '' }));
              }
              setStage('form');
            }}
          />
        </main>
      </>
    );
  }

  // ── Stage 3: the record itself ──────────────────────────────────────────
  return (
    <>
      <AppHeader />
      <main style={{ padding: 20, maxWidth: 480, margin: '0 auto' }}>
        <button onClick={() => setStage(returnOutcome ? 'ulang' : 'situasi')} style={linkBtn}>
          {t('← Kembali', '← Back')}
        </button>

        {returnOutcome === 'efek_samping' && (
          <div style={{
            borderRadius: 11, padding: '12px 14px', marginBottom: 14,
            background: C.card2, border: `1px solid ${C.amber}`,
            fontSize: 13.5, lineHeight: 1.55, color: C.white,
          }}>
            {t('Ada keluhan. Catat keluhannya di catatan bidan, dan putuskan bersama klien: atasi efek sampingnya, atau ganti cara.',
               'There are complaints. Write them in the midwife’s note, and decide together: manage the side effect, or switch method.')}
          </div>
        )}

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

        {pp?.restricted && (
          <div style={{
            borderRadius: 11, padding: '12px 14px', marginTop: 14,
            background: C.card2, border: `1px solid ${C.amber}`,
            fontSize: 13.5, lineHeight: 1.55, color: C.white,
          }}>
            <strong>{t('Batasan pascasalin', 'Postpartum restriction')}</strong>
            {' · '}{t(pp.reason_id ?? '', pp.reason_en ?? '')}
            {pp.source && <span style={{ color: C.dimmer, fontSize: 11.5 }}> {pp.source}</span>}
          </div>
        )}

        {prov && (prov.kind === 'tindakan' || prov.kind === 'khusus') && (
          <div style={{
            borderRadius: 11, padding: '12px 14px', marginTop: 12,
            background: C.card, border: `1px solid ${C.border}`,
            fontSize: 13, lineHeight: 1.55, color: C.dim,
          }}>
            <strong style={{ color: C.white }}>{t('Pemberian', 'Provision')}</strong>
            {' · '}{t(prov.requirement_id, prov.requirement_en)}
            {prov.removalIsAProcedure && (
              <div style={{ color: C.amber, marginTop: 4 }}>
                {t('Pelepasannya juga tindakan — pastikan klien bisa menjangkau tenaga terlatih untuk melepasnya nanti.',
                   'Removal is a procedure too — make sure she can reach trained staff to have it taken out later.')}
              </div>
            )}
            {prov.ifUnavailable_id && (
              <div style={{ marginTop: 4 }}>{t(prov.ifUnavailable_id, prov.ifUnavailable_en ?? '')}</div>
            )}
          </div>
        )}

        {verdict && (
          <div style={{
            borderRadius: 11, padding: '12px 14px', marginTop: 12,
            background: C.card2, fontSize: 13.5, lineHeight: 1.55, color: C.white,
            border: `1px solid ${verdict.verdict === 'recommended' ? C.ok
              : verdict.verdict === 'not_recommended' ? C.red : C.amber}`,
          }}>
            <strong>
              {verdict.verdict === 'recommended'
                ? t('Direkomendasikan menurut pedoman', 'Recommended by the guideline')
                : verdict.verdict === 'not_recommended'
                  ? t('Tidak direkomendasikan menurut pedoman', 'Not recommended by the guideline')
                  : t('Belum bisa dinilai dari pedoman', 'The guideline cannot judge this yet')}
            </strong>
            {verdict.category !== null && (() => {
              /* 'lengkap' for every clinic, decided 24 Oct 2026. Pedoman p100
                 permits a limited facility to collapse 1-4 into boleh / tidak
                 boleh; we show the fuller scale everywhere rather than hide
                 the category-3 nuance from a bidan who can act on it. */
              const d = displayCategory(verdict.category, 'lengkap');
              return <> · {t(d.text_id, d.text_en)}</>;
            })()}
            {verdict.unscored.length > 0 && (
              <div style={{ color: C.dim, marginTop: 4, fontSize: 12.5 }}>
                {t(`${verdict.unscored.length} kondisi tidak punya baris di pedoman ini. Nilai dengan Roda KLOP.`,
                   `${verdict.unscored.length} condition(s) have no row here. Judge them with Roda KLOP.`)}
              </div>
            )}
          </div>
        )}

        {screeningFormulation && screening.source && (
          <label style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12,
            padding: '12px 14px', borderRadius: 11, cursor: 'pointer',
            background: C.card, border: `1px solid ${acknowledged ? C.ok : C.border}`,
          }}>
            <input type="checkbox" checked={acknowledged}
                   onChange={(e) => setAcknowledged(e.target.checked)}
                   style={{ marginTop: 3, width: 18, height: 18 }} />
            <span style={{ fontSize: 13.5, lineHeight: 1.55, color: C.white }}>
              {t('Saya sudah membaca hasil penapisan ini dan membahasnya dengan klien.',
                 'I have read this screening result and discussed it with the client.')}
              <span style={{ display: 'block', color: C.dim, fontSize: 12.5, marginTop: 3 }}>
                {t('Nama dan waktunya dicatat otomatis saat terkirim.',
                   'Your name and the time are recorded automatically when it uploads.')}
              </span>
            </span>
          </label>
        )}

        {screeningFormulation && (
          <KbScreeningList
            screening={screening}
            answers={answers}
            onAnswer={(code, v) => setAnswers((a) => ({ ...a, [code]: v }))}
          />
        )}

        <div style={{ height: 120 }} />
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
