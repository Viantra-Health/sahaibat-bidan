'use client';

// components/ReferralPanel.tsx
// The referral ladder, after a visit that raised one.
//
// Rung 4 — the letter — is rendered unconditionally and first-class, not as a
// fallback tucked under an error state. It is the only rung that works when
// nobody at the receiving end is on the platform, which is the normal case
// today and will stay the normal case in most villages.
//
// Rungs 1-3 appear when we have them. When we do not, the panel says WHY in
// one sentence rather than showing an empty list: a midwife who opens a
// chooser and finds nothing in it concludes the app is broken, and she is not
// wrong to.

import { useEffect, useState } from 'react';
import { getCachedTargets, refreshTargets, explainEmpty, type ReferralTarget } from '@/lib/referralTargets';
import { C } from './ui';

const RUNG_LABEL: Record<number, string> = {
  1: 'Puskesmas',
  2: 'Faskes terdaftar',
  3: 'Dokter DOK',
};

export default function ReferralPanel({ profileId, urgency, onLetter }: {
  profileId: string;
  urgency: 'emergency' | 'urgent' | 'routine' | 'none';
  onLetter: () => void;
}) {
  const [targets, setTargets] = useState<ReferralTarget[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const cached = getCachedTargets(profileId);
    if (cached) { setTargets(cached.targets); setNotes(cached.notes); }
    setLoaded(true);
    // Best-effort refresh. The cache is already on screen, so a slow or failed
    // network changes nothing the midwife can see.
    refreshTargets(profileId).then((next) => {
      if (next) { setTargets(next.targets); setNotes(next.notes); }
    });
  }, [profileId]);

  const byRung = [1, 2, 3].map((r) => ({ rung: r, items: targets.filter((t) => t.rung === r) }))
    .filter((g) => g.items.length > 0);

  return (
    <div style={{ marginTop: 18, textAlign: 'left' }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase',
        color: C.dimmer, marginBottom: 10,
      }}>
        {urgency === 'emergency' ? 'Rujuk sekarang' : 'Tujuan rujukan'}
      </div>

      {byRung.map(({ rung, items }) => (
        <div key={rung} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 6 }}>{RUNG_LABEL[rung]}</div>
          {items.map((t) => {
            const active = chosen === t.ref;
            return (
              <button
                key={t.ref}
                onClick={() => setChosen(active ? null : t.ref)}
                aria-pressed={active}
                style={{
                  width: '100%', textAlign: 'left', marginBottom: 7, padding: '11px 13px',
                  borderRadius: 10, cursor: 'pointer', color: C.white,
                  background: active ? 'rgba(2,195,154,0.14)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${active ? C.teal : C.border}`,
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</span>
                {t.subtitle && <span style={{ fontSize: 11.5, color: C.dim }}>{t.subtitle}</span>}
                {/* An inferred Puskesmas must never look like a confirmed one.
                    She is the one who knows which is actually hers. */}
                {!t.confirmed && (
                  <span style={{ fontSize: 10.5, color: C.amber, letterSpacing: '.05em' }}>
                    perlu dipastikan
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}

      {loaded && byRung.length === 0 && (
        <p style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6, margin: '0 0 12px' }}>
          {explainEmpty(notes)}
        </p>
      )}

      {/* Rung 4. Always here, always works. */}
      <button onClick={onLetter} style={{
        width: '100%', marginTop: 4, padding: 13, borderRadius: 11, background: 'transparent',
        color: C.white, fontWeight: 600, fontSize: 14.5,
        border: `1px solid ${byRung.length === 0 ? C.teal : 'rgba(255,255,255,0.3)'}`,
        cursor: 'pointer',
      }}>
        📄 Buat surat rujukan
      </button>
      <p style={{ fontSize: 11.5, color: C.dimmer, lineHeight: 1.55, marginTop: 8 }}>
        Surat bisa dibuat tanpa sinyal dan diberikan langsung kepada ibu.
      </p>
    </div>
  );
}
