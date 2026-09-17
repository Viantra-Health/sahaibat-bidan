'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { getRegister, type RegisterRecord } from '@/lib/offlineStore';
import { syncRegister } from '@/lib/syncClient';
import { searchRegister, describeRecord, describeLastSeen, dueState, type SearchFilters } from '@/lib/search';
import PasscodePrompt from '@/components/PasscodePrompt';
import AppHeader from '@/components/AppHeader';
import { refreshTargets } from '@/lib/referralTargets';
import { useLang } from '@/lib/lang';
import { C } from '@/components/ui';


export default function SearchPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<BidanIdentity | null>(null);
  const [register, setRegister] = useState<RegisterRecord[]>([]);
  const [query, setQuery] = useState('');
  const [onlyPregnant, setOnlyPregnant] = useState(false);
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
    onlyPregnant,
    onlyRegionId: onlyHome ? identity?.regionId ?? null : null,
    seenWithinDays: recentOnly ? 90 : null,
  }), [identity, onlyPregnant, onlyHome, recentOnly]);

  const outcome = useMemo(
    () => searchRegister(query, register, filters, t),
    // t is in the deps because it changes identity with the language, and the
    // `why` chips it produces are part of the memoised result.
    [query, register, filters, t]
  );

  if (!identity) return null;

  return (
    <main style={{ padding: 20, maxWidth: 460, margin: '0 auto', minHeight: '100dvh' }}>
      <AppHeader name={identity.name} village={identity.village} />

      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.025em', margin: '0 0 2px' }}>
          {onlyPregnant ? t('Ibu Hamil', 'Pregnant mothers') : t('Warga Desa', 'Village register')}
        </h1>
        <div style={{ fontSize: 12.5, color: C.dim }}>
          {t(`${outcome.total || register.length} tersimpan di perangkat`,
             `${outcome.total || register.length} stored on this device`)}
        </div>
      </div>

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
        <Chip on={onlyPregnant} onClick={() => setOnlyPregnant((v) => !v)} label={t('Hamil', 'Pregnant')} />
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
            const due = dueState(record, t);
            // The rail is the hierarchy: a mother who is overdue reads as
            // different in kind from one who is simply on the list, without
            // needing a second colour or a badge.
            const rail = due?.urgency === 'overdue' ? C.red
                       : due?.urgency === 'due' ? C.amber
                       : C.border;

            // The second action is contextual rather than a third button. A
            // row is not wide enough for three targets a thumb can hit, and
            // the choice is not arbitrary: a woman at 28 weeks or more is far
            // likelier to be delivering than to need a postnatal visit, and a
            // woman who has not delivered cannot have one at all.
            const weeksLeft = record.edd
              ? (new Date(record.edd).getTime() - Date.now()) / (7 * 86_400_000)
              : null;
            const nearTerm = record.isPregnant && weeksLeft != null && weeksLeft <= 12;
            const second = nearTerm
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
                onClick={() => router.push(`/anc/${record.memberId}`)}
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
                  width: 82, background: C.card2, border: 'none',
                  borderLeft: `1px solid ${C.border}`, color: C.dim,
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
