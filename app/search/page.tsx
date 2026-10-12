'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { getRegister, type RegisterRecord } from '@/lib/offlineStore';
import { syncRegister } from '@/lib/syncClient';
import { searchRegister, describeRecord, describeLastSeen, dueState, knDueState,
         newbornDayOfLife, careFlow, type CareFlow, type SearchFilters } from '@/lib/search';
import PasscodePrompt from '@/components/PasscodePrompt';
import AppHeader from '@/components/AppHeader';
import QueueBanner from '@/components/QueueBanner';
import { getRejectedVisits } from '@/lib/offlineStore';
import { refreshTargets } from '@/lib/referralTargets';
import { useLang } from '@/lib/lang';
import { onRegisterChanged } from '@/lib/registerBus';
import { C } from '@/components/ui';


export default function SearchPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [register, setRegister] = useState<RegisterRecord[]>([]);
  const [query, setQuery] = useState('');
  /* ── THE FOUR FLOWS, NOT JUST "HAMIL" ────────────────────────────────────
     One flow chip existed, so a midwife looking for the babies she owes a KN
     visit read all 38 rows looking for them. Failed the same test three rounds
     running. One at a time rather than a multi-select: these are the four
     reasons she opens this screen, and they are not combined in practice. */
  const [flow, setFlow] = useState<CareFlow | null>(null);
  const [onlyHome, setOnlyHome] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const { t, lang } = useLang();

  useEffect(() => {
    const id = getIdentity();
    if (!id) { router.replace('/'); return; }
    setIdentity(id);

    getRegister().then(setRegister);

    // Refresh in the background. The cached copy stays on screen throughout —
    // a failed refresh must never empty the register mid-visit.
    syncRegister(id.profileId).then(async (r) => {
      if (r.source === 'server') setRegister(await getRegister());
      if (r.reason) setStatus(r.reason);
      else if (r.count === 0) setStatus(t('Daftar warga kosong untuk desa Anda.', 'The register is empty for your village.'));
    });

    // Referral targets, cached before the first referral rather than during
    // one. Independent of the register sync: if that fails she should still
    // have somewhere to send a mother.
    refreshTargets(id.profileId).catch(() => {});
  }, [router]);

  const filters: SearchFilters = useMemo(() => ({
    homeRegionId: identity?.regionId ?? null,
    preferPregnant: true,               // this app is about pregnancy
    onlyFlow: flow,
    onlyRegionId: onlyHome ? identity?.regionId ?? null : null,
    seenWithinDays: recentOnly ? 90 : null,
  }), [identity, flow, onlyHome, recentOnly]);

  const outcome = useMemo(
    () => searchRegister(query, register, filters, t),
    // t is in the deps because it changes identity with the language, and the
    // `why` chips it produces are part of the memoised result.
    [query, register, filters, t]
  );

  /* ── WHICH MOTHERS HAVE A VISIT THAT NEVER LANDED ────────────────────────
     Identity is resolved before the visit is written, so a mother whose only
     visit the server then refused still exists in the register — correctly, so
     that re-recording it attaches to HER rather than making a second record.
     What was missing is any sign on her row that the visit is gone. The banner
     at the top names her; this marks the row she is on, which is where a
     midwife actually looks for her. */
  /* ── RE-READ WHEN THE STORE CHANGES ──────────────────────────────────────
     The mount effect above reads the register once. The upload that refreshes
     it runs unawaited, so it usually lands AFTER she has already arrived back
     here -- and a register that is one delivery out of date offers a "Lahir"
     button for a mother who has given birth, which invites the same birth
     being recorded twice. This listens instead of polling. */
  useEffect(() => onRegisterChanged(() => {
    getRegister().then(setRegister).catch(() => {});
  }), []);

  const [rejectedFor, setRejectedFor] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    const read = () => getRejectedVisits().then((rows) => {
      if (!live) return;
      const keys = new Set<string>();
      for (const r of rows as any[]) {
        if (r?.memberId) keys.add(String(r.memberId));
        if (r?.motherName) keys.add(String(r.motherName).trim().toLowerCase());
      }
      setRejectedFor(keys);
    }).catch(() => {});
    read();
    const timer = setInterval(read, 15000);
    return () => { live = false; clearInterval(timer); };
  }, []);

  if (!identity) return null;

  return (
    <main style={{ padding: 20, maxWidth: 460, margin: '0 auto', minHeight: '100dvh' }}>
      <AppHeader name={identity.name} village={identity.village} />

      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.025em', margin: '0 0 2px' }}>
          {flow === 'anc' ? t('Ibu Hamil', 'Pregnant mothers')
            : flow === 'persalinan' ? t('Mendekati Persalinan', 'Near term')
            : flow === 'nifas' ? t('Ibu Nifas', 'Postnatal mothers')
            : flow === 'kn' ? t('Bayi Baru Lahir', 'Newborns')
            : t('Warga Desa', 'Village register')}
        </h1>
        <div style={{ fontSize: 12.5, color: C.dim }}>
          {t(`${outcome.total || register.length} tersimpan di perangkat`,
             `${outcome.total || register.length} stored on this device`)}
        </div>
      </div>

      {/* What has not reached the record yet, and what never will without
          somebody doing something. See components/QueueBanner.tsx. */}
      <QueueBanner />

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('Ketik nama ibu…', 'Type a mother’s name…')}
        autoFocus
        style={{
          width: '100%', minHeight: 48, padding: '13px 15px', fontSize: 16, borderRadius: 12,
          background: C.field, color: C.white, fontWeight: 600,
          border: `1.5px solid ${C.fieldLine}`, outline: 'none', marginBottom: 11,
        }}
      />

      {/* Tapped, not typed. On a cheap phone in the field the second dimension
          of a search has to cost one thumb press. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
        <Chip on={onlyHome} onClick={() => setOnlyHome((v) => !v)}
          label={identity.village ? `${t('Desa', 'Village')} ${identity.village}` : t('Desa saya', 'My village')} />
        {/* Tapping the active one clears it, so there is always a way back to
            the whole register without hunting for an "all" chip. */}
        {(['anc', 'persalinan', 'nifas', 'kn'] as const).map((f) => (
          <Chip
            key={f}
            on={flow === f}
            onClick={() => setFlow((v) => (v === f ? null : f))}
            label={
              f === 'anc' ? t('Hamil', 'Pregnant')
              : f === 'persalinan' ? t('Mau lahir', 'Near term')
              : f === 'nifas' ? t('Nifas', 'Postnatal')
              : t('Bayi', 'Newborn')
            }
          />
        ))}
        <Chip on={recentOnly} onClick={() => setRecentOnly((v) => !v)} label={t('3 bln terakhir', 'Last 3 months')} />
      </div>

      <PasscodePrompt />

      {/* Always visible, not only on the empty state. In week one of a pilot
          almost every visit is a new mother, and a midwife who has typed a
          name should not have to clear the box to find registration. */}
      <button
        onClick={() => router.push('/anc/baru')}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 11, marginBottom: 14,
          background: C.accentSoft, color: C.teal, fontWeight: 700, fontSize: 14,
          border: `1px solid rgba(2,195,154,0.45)`, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}
      >
        <span style={{ fontSize: 17, lineHeight: 1 }}>+</span>
        {t('Daftarkan ibu baru', 'Register a new mother')}
      </button>

      {status && (
        <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.5, marginBottom: 16 }}>{status}</p>
      )}

      {query.trim() && (
        <>
          {/* Two destinations per person, both one tap. Which visit she is
              doing is something she knows and the register does not — a
              woman who delivered last week is no longer flagged pregnant,
              and guessing from that would send half the postnatal visits to
              the wrong form. The wider target stays antenatal because that
              is the commoner case. */}
          {outcome.hits.map(({ record, why }) => {
            // A newborn is a different patient with a different form, and
            // until now tapping her row opened an ANTENATAL assessment for a
            // three-day-old. The delivery record put her in this list; this
            // is what she is for.
            const newbornDays = newbornDayOfLife(record);
            const isNewborn = newbornDays != null;
            const due = isNewborn ? knDueState(record, t) : dueState(record, t);
            // The rail is the hierarchy: a mother who is overdue reads as
            // different in kind from one who is simply on the list, without
            // needing a second colour or a badge.
            const rail = due?.urgency === 'overdue' ? C.red
                       : due?.urgency === 'due' ? C.amber
                       : C.border;

            /* The second action is contextual rather than a third button: a row
               is not wide enough for three targets a thumb can hit.

               IT USED TO FALL THROUGH TO NIFAS FOR A PREGNANT WOMAN, which
               contradicts the sentence that justified it — a woman who has not
               delivered cannot have a postnatal visit at all. The gate was
               `pregnant AND an EDD AND 12 weeks or fewer to go`, so a mother at
               16 weeks, and every mother with no EDD recorded, was offered a
               postnatal visit and had NO route to the delivery form. Preterm
               birth is precisely the case that most needs recording, and
               testing found Ratna Dewi Uji — two visits at 28 weeks, no EDD —
               with no way in.

               Pregnancy decides it now, not proximity to term. The EDD still
               decides the EMPHASIS: near term it leads, earlier it is quieter,
               so a mis-tap at 16 weeks is still unlikely. */
            /* The same function the chips filter by -- see careFlow(). This was
               an inline copy of the rule, which is how a "Nifas" chip comes to
               list a woman whose own row offers her an antenatal visit. */
            const nearTerm = careFlow(record) === 'persalinan';
            // A baby has no antenatal or postnatal visit of her own, so both
            // targets on her row are the same one rather than offering a
            // second action that cannot apply to her.
            const primaryHref = isNewborn ? `/kn/${record.memberId}` : `/anc/${record.memberId}`;
            const second = isNewborn
              ? { href: `/kn/${record.memberId}`,         label: t('Neonatal', 'Newborn') }
              : record.isPregnant
              ? { href: `/persalinan/${record.memberId}`, label: t('Lahir', 'Birth') }
              : { href: `/pnc/${record.memberId}`,        label: t('Nifas', 'Postnatal') };
            return (
              <div
              key={record.memberId}
              style={{
                marginBottom: 9, borderRadius: 12, background: C.card,
                border: `1px solid ${C.border}`, borderLeft: `5px solid ${rail}`,
                display: 'flex', alignItems: 'stretch', overflow: 'hidden',
              }}
            >
              <button
                onClick={() => router.push(primaryHref)}
                style={{
                  flex: 1, textAlign: 'left', padding: '12px 14px', background: 'none',
                  border: 'none', cursor: 'pointer', color: C.white,
                  display: 'flex', flexDirection: 'column', gap: 3,
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-.01em' }}>{record.name}</span>
                <span style={{ fontSize: 12.5, color: C.dim }}>{describeRecord(record, t)}</span>
                {/* The reason to tap this row. */}
                {due && (
                  <span style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: '.05em', marginTop: 3,
                    textTransform: 'uppercase',
                    color: due.urgency === 'overdue' ? C.red
                         : due.urgency === 'due' ? C.amber : C.ok,
                  }}>
                    {due.label}
                  </span>
                )}
                {/* Her visit was refused and is not in the record. Shown on the
                    row because that is where a midwife looks for her, not only
                    in the banner at the top of the page. */}
                {(rejectedFor.has(record.memberId)
                  || rejectedFor.has(String(record.name ?? '').trim().toLowerCase())) && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#B3261E', background: '#FDEAE8',
                    border: '1px solid #B3261E', borderRadius: 5, padding: '2px 7px',
                    alignSelf: 'flex-start',
                  }}>
                    {t('Kunjungan ditolak — belum masuk catatan', 'Visit refused — not in the record')}
                  </span>
                )}
                {describeLastSeen(record, t, lang === 'en' ? 'en-GB' : 'id-ID') && (
                  <span style={{ fontSize: 11.5, color: C.dimmer }}>{describeLastSeen(record, t, lang === 'en' ? 'en-GB' : 'id-ID')}</span>
                )}
                {why.length > 0 && (
                  <span style={{ fontSize: 10, color: C.teal, letterSpacing: '.07em',
                    textTransform: 'uppercase', fontWeight: 700, marginTop: 1 }}>
                    {why.join(' · ')}
                  </span>
                )}
              </button>
              <button
                onClick={() => router.push(second.href)}
                aria-label={`${second.label} — ${record.name}`}
                style={{
                  width: 82, border: 'none',
                  /* Near term the delivery route leads; earlier it is present
                     but quiet, so reaching it at 16 weeks is deliberate rather
                     than a mis-tap. The route exists either way — that is the
                     part that was wrong. */
                  background: nearTerm ? C.amberSoft : C.card2,
                  borderLeft: `1px solid ${nearTerm ? C.amber : C.border}`,
                  color: nearTerm ? C.white : C.dim,
                  fontSize: 11.5, fontWeight: 700, cursor: 'pointer', letterSpacing: '.04em',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 3, padding: '10px 6px',
                }}
              >
                <span style={{ fontSize: 15, lineHeight: 1 }}>→</span>
                {second.label}
              </button>
              </div>
            );
          })}

          {/* Never truncate silently: a midwife who cannot see that more exist
              concludes the woman is not registered, and creates a duplicate. */}
          {outcome.more > 0 && (
            <p style={{ fontSize: 12.5, color: C.dim, textAlign: 'center', margin: '10px 0 16px' }}>
              + {outcome.more} hasil lain — ketik nama lebih lengkap atau pilih desa
            </p>
          )}

          {outcome.total === 0 && (
            <p style={{ fontSize: 14, color: C.dim, margin: '14px 0', lineHeight: 1.55 }}>
              {t('Tidak ditemukan di data lokal.', 'Not found in local data.')}
            </p>
          )}

          {/* A first-class path, not a punishment. Some cases genuinely cannot
              be resolved in the field; the server re-matches at sync and flags
              a collision for review rather than merging or duplicating blindly. */}
          <button
            onClick={() => router.push('/anc/baru')}
            style={{
              width: '100%', padding: 14, borderRadius: 11, marginTop: 4,
              background: 'transparent', color: C.white, fontWeight: 700, fontSize: 14,
              border: `1.5px dashed ${C.dimmer}`, cursor: 'pointer',
            }}
          >
            {t('Bukan salah satu di atas → Daftarkan baru', 'None of these → Register new')}
          </button>
        </>
      )}

      {/* Empty state. Registration used to live ONLY inside the results block,
          so with an empty box there was no way to register anyone at all —
          and week one of a pilot is almost entirely new mothers. The blank
          screen under the search box was also the app's first impression and
          did nothing with it. */}
      {!query.trim() && (
        <div style={{ marginTop: 6 }}>
          {/* The antenatal register button is permanent now and sits above the
              search box, so the empty state offers only the postnatal path. */}
          <button
            onClick={() => router.push('/pnc/baru')}
            style={{
              width: '100%', padding: 13, borderRadius: 11,
              background: 'transparent', color: C.dim, fontWeight: 600, fontSize: 13.5,
              border: `1px solid ${C.border}`, cursor: 'pointer',
            }}
          >
            {t('Kunjungan nifas — ibu baru', 'Postnatal visit — new mother')}
          </button>

          <p style={{ fontSize: 12.5, color: C.dimmer, lineHeight: 1.6, marginTop: 16 }}>
            {register.length > 0
              ? t(`Ketik nama untuk mencari di antara ${register.length} warga desa ini.`,
                    `Type a name to search among ${register.length} people in this village.`)
              : t('Belum ada data warga di perangkat ini. Daftarkan ibu baru untuk mulai.',
                    'No people stored on this device yet. Register a new mother to begin.')}
          </p>
        </div>
      )}
    </main>
  );
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 14,
        cursor: 'pointer',
        background: on ? C.teal : 'transparent',
        color: on ? C.onAccent : C.dim,
        border: `1px solid ${on ? C.teal : C.border}`,
      }}
    >
      {label}
    </button>
  );
}
