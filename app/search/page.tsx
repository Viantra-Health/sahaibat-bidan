'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getIdentity, type BidanIdentity } from '@/lib/auth';
import { getRegister, type RegisterRecord } from '@/lib/offlineStore';
import { syncRegister } from '@/lib/syncClient';
import { searchRegister, describeRecord, describeLastSeen, type SearchFilters } from '@/lib/search';

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
      else if (r.count === 0) setStatus('Daftar warga kosong untuk desa Anda.');
    });
  }, [router]);

  const filters: SearchFilters = useMemo(() => ({
    homeRegionId: identity?.regionId ?? null,
    preferPregnant: true,               // this app is about pregnancy
    onlyPregnant,
    onlyRegionId: onlyHome ? identity?.regionId ?? null : null,
    seenWithinDays: recentOnly ? 90 : null,
  }), [identity, onlyPregnant, onlyHome, recentOnly]);

  const outcome = useMemo(
    () => searchRegister(query, register, filters),
    [query, register, filters]
  );

  if (!identity) return null;

  return (
    <main style={{ padding: 20, maxWidth: 460, margin: '0 auto', minHeight: '100dvh' }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: C.dimmer, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          Bidan {identity.name}
        </div>
        <h1 style={{ fontSize: 21, margin: '4px 0 2px' }}>Cari Ibu</h1>
        <div style={{ fontSize: 13, color: C.dim }}>
          {identity.village ? `${identity.village} · ` : ''}{register.length} warga tersimpan
        </div>
      </header>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ketik nama ibu…"
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
          label={identity.village ? `Desa ${identity.village}` : 'Desa saya'} />
        <Chip on={onlyPregnant} onClick={() => setOnlyPregnant((v) => !v)} label="Hamil" />
        <Chip on={recentOnly} onClick={() => setRecentOnly((v) => !v)} label="3 bln terakhir" />
      </div>

      {status && (
        <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.5, marginBottom: 16 }}>{status}</p>
      )}

      {query.trim() && (
        <>
          {outcome.hits.map(({ record, why }) => (
            <button
              key={record.memberId}
              onClick={() => router.push(`/anc/${record.memberId}`)}
              style={{
                width: '100%', textAlign: 'left', marginBottom: 9, padding: '12px 14px',
                borderRadius: 11, background: C.card, cursor: 'pointer',
                border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.teal}`,
                display: 'flex', flexDirection: 'column', gap: 3, color: C.white,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 15 }}>{record.name}</span>
              <span style={{ fontSize: 12.5, color: C.dim }}>{describeRecord(record)}</span>
              {describeLastSeen(record) && (
                <span style={{ fontSize: 11.5, color: C.dimmer }}>{describeLastSeen(record)}</span>
              )}
              {why.length > 0 && (
                <span style={{ fontSize: 10, color: C.teal, letterSpacing: '.07em',
                  textTransform: 'uppercase', fontWeight: 700, marginTop: 1 }}>
                  {why.join(' · ')}
                </span>
              )}
            </button>
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
              Tidak ditemukan di data lokal.
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
            Bukan salah satu di atas → Daftarkan baru
          </button>
        </>
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
