'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { getRegister, type RegisterRecord } from '@/lib/offlineStore';
import { syncRegister } from '@/lib/syncClient';
import { searchRegister, describeRecord, describeLastSeen, type SearchFilters } from '@/lib/search';
import PasscodePrompt from '@/components/PasscodePrompt';
import AppHeader from '@/components/AppHeader';
import { refreshTargets } from '@/lib/referralTargets';
import { useLang } from '@/lib/lang';

const C = {
  teal: '#02C39A',
  white: '#FFFFFF',
  dim: 'rgba(255,255,255,0.55)',
  dimmer: 'rgba(255,255,255,0.3)',
  border: 'rgba(2,195,154,0.28)',
  card: 'rgba(255,255,255,0.05)',
};

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

      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 21, margin: '0 0 2px' }}>{t('Cari Ibu', 'Find a mother')}</h1>
        <div style={{ fontSize: 13, color: C.dim }}>
          {t(`${register.length} warga tersimpan di perangkat ini`, `${register.length} people stored on this device`)}
        </div>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('Ketik nama ibu…', 'Type a mother’s name…')}
        autoFocus
        style={{
          width: '100%', padding: '13px 15px', fontSize: 16, borderRadius: 12,
          background: 'rgba(255,255,255,0.06)', color: C.white,
          border: `1.5px solid ${C.border}`, outline: 'none', marginBottom: 12,
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
          background: 'rgba(2,195,154,0.10)', color: C.teal, fontWeight: 700, fontSize: 14,
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
          {outcome.hits.map(({ record, why }) => (
            <div
              key={record.memberId}
              style={{
                marginBottom: 9, borderRadius: 11, background: C.card,
                border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.teal}`,
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
                <span style={{ fontWeight: 700, fontSize: 15 }}>{record.name}</span>
                <span style={{ fontSize: 12.5, color: C.dim }}>{describeRecord(record, t)}</span>
                {record.isPregnant && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', color: C.teal,
                    textTransform: 'uppercase', marginTop: 1,
                  }}>
                    {t('Hamil', 'Pregnant')}
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
                onClick={() => router.push(`/pnc/${record.memberId}`)}
                aria-label={t(`Kunjungan nifas untuk ${record.name}`, `Postnatal visit for ${record.name}`)}
                style={{
                  width: 82, background: 'rgba(255,255,255,0.04)', border: 'none',
                  borderLeft: `1px solid ${C.border}`, color: C.dim,
                  fontSize: 11.5, fontWeight: 700, cursor: 'pointer', letterSpacing: '.04em',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 3, padding: '10px 6px',
                }}
              >
                <span style={{ fontSize: 15, lineHeight: 1 }}>→</span>
                {t('Nifas', 'Postnatal')}
              </button>
            </div>
          ))}

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
        color: on ? '#04241E' : C.dim,
        border: `1px solid ${on ? C.teal : 'rgba(255,255,255,0.22)'}`,
      }}
    >
      {label}
    </button>
  );
}
