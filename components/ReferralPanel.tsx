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
import { useLang } from '@/lib/lang';

/* ── GROUPED BY WHAT A PLACE IS, NOT BY ITS RUNG NUMBER ──────────────────────
   Hospitals and onboarded providers both sit at rung 2 -- both are "a facility
   near her that is not her Puskesmas" -- but they are not the same thing and
   must not share a heading. One is reference data nobody has agreed to; the
   other is a partner who has. */
const KIND_LABEL: Record<string, [string, string]> = {
  puskesmas: ['Puskesmas', 'Puskesmas'],
  hospital:  ['Rumah sakit', 'Hospital'],
  provider:  ['Faskes terdaftar', 'Registered facility'],
  dok:       ['Dokter DOK', 'DOK doctor'],
};

/* An emergency inverts the ladder. A Puskesmas is the right first stop for a
   routine referral and the wrong one for a postpartum haemorrhage, which needs
   an operating theatre -- so when the engine has called it an emergency, the
   hospital is listed first. She is reading this while someone is bleeding. */
const ORDER_EMERGENCY = ['hospital', 'puskesmas', 'provider', 'dok'];
const ORDER_ROUTINE = ['puskesmas', 'hospital', 'provider', 'dok'];

export default function ReferralPanel({ profileId, urgency, onLetter }: {
  profileId: string;
  urgency: 'emergency' | 'urgent' | 'routine' | 'none';
  onLetter: () => void;
}) {
  const [targets, setTargets] = useState<ReferralTarget[]>([]);
  const { t, lang } = useLang();
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

  const order = urgency === 'emergency' ? ORDER_EMERGENCY : ORDER_ROUTINE;
  const groups = order
    .map((kind) => ({ kind, items: targets.filter((t) => t.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <div style={{ marginTop: 18, textAlign: 'left' }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase',
        color: C.dimmer, marginBottom: 10,
      }}>
        {urgency === 'emergency' ? t('Rujuk sekarang', 'Refer now') : t('Tujuan rujukan', 'Referral destination')}
      </div>

      {groups.map(({ kind, items }) => (
        <div key={kind} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 6 }}>{KIND_LABEL[kind]?.[lang === 'en' ? 1 : 0] ?? kind}</div>
          {items.map((target) => {
            const active = chosen === target.ref;
            return (
              <button
                key={target.ref}
                onClick={() => setChosen(active ? null : target.ref)}
                aria-pressed={active}
                style={{
                  width: '100%', textAlign: 'left', marginBottom: 7, padding: '11px 13px',
                  borderRadius: 10, cursor: 'pointer', color: C.white,
                  background: active ? C.accentSoft : C.card,
                  border: `1px solid ${active ? C.teal : C.border}`,
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>{target.name}</span>
                {target.subtitle && <span style={{ fontSize: 11.5, color: C.dim }}>{target.subtitle}</span>}
                {/* What is actually known, in words. Deliberately NOT a badge
                    reading "PONEK": class and the specialist register are facts
                    about a register, and PONEK would be a claim about tonight
                    that nobody published. */}
                {target.detail && (
                  <span style={{ fontSize: 11.5, color: C.dim }}>{target.detail}</span>
                )}
                {/* An inferred Puskesmas must never look like a confirmed one.
                    She is the one who knows which is actually hers. */}
                {!target.confirmed && (
                  <span style={{ fontSize: 10.5, color: C.amber, letterSpacing: '.05em' }}>
                    {t('perlu dipastikan', 'needs confirming')}
                  </span>
                )}
              </button>
            );
          })}
          {/* Ringing ahead is the single most useful thing she can do before
              setting off, and she has never had a number. Outside the button
              above so a tap to dial is not also a tap to select, and an <a>
              rather than a handler so the phone's own dialler takes it. */}
          {items.map((target) => target.phone ? (
            <a
              key={`${target.ref}-tel`}
              href={`tel:${target.phone.replace(/[^0-9+]/g, '')}`}
              style={{
                display: 'block', marginTop: -3, marginBottom: 9, padding: '9px 13px',
                borderRadius: 10, background: 'transparent', color: C.teal,
                border: `1px solid rgba(2,195,154,.45)`, fontSize: 13, fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {t(`Telepon ${target.name} · ${target.phone}`, `Call ${target.name} · ${target.phone}`)}
            </a>
          ) : null)}
        </div>
      ))}

      {loaded && (groups.length === 0 || notes.includes('no_hospital_in_kabupaten')) && (
        <p style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6, margin: '0 0 12px' }}>
          {explainEmpty(notes, t)}
        </p>
      )}

      {/* Rung 4. Always here, always works. */}
      <button onClick={onLetter} style={{
        width: '100%', marginTop: 4, padding: 13, borderRadius: 11, background: 'transparent',
        color: C.white, fontWeight: 600, fontSize: 14.5,
        border: `1px solid ${groups.length === 0 ? C.teal : C.dimmer}`,
        cursor: 'pointer',
      }}>
        {t('📄 Buat surat rujukan', '📄 Create referral letter')}
      </button>
      <p style={{ fontSize: 11.5, color: C.dimmer, lineHeight: 1.55, marginTop: 8 }}>
        {t('Surat bisa dibuat tanpa sinyal dan diberikan langsung kepada ibu.',
            'The letter works with no signal and is handed straight to her.')}
      </p>
    </div>
  );
}
