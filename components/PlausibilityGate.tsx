'use client';

/**
 * Ask once before opening a maternal form on somebody it cannot be about.
 *
 * ── WHY THIS LEFT /anc ───────────────────────────────────────────────────
 *
 * The antenatal page has carried this check since the day somebody noticed
 * that a mis-tap there "does not produce a blank form — it produces a red
 * pregnancy warning about a twelve-year-old boy". The reasoning was right and
 * it was applied to one route.
 *
 * Measured in the field app on 28 Oct 2026, searching the Atambua register for
 * "Agnes": the name matcher also returns three people called Agus, and every
 * one of their rows offered Nifas and KB. Tapping one opened a full postnatal
 * visit — KF1–KF4, bleeding and involution, "Lokia berbau?", "Luka jahitan
 * terinfeksi?", an EPDS depression score — headed "Belum ada kunjungan
 * tercatat untuk ibu ini", for a man of 48. No question was asked. One of the
 * three is twelve years old and recorded as male.
 *
 * The register carries what is needed to prevent that — gender, age_years,
 * role_in_family — and lib/search.ts has read it all along for ranking. Only
 * the antenatal route ever acted on it.
 *
 * ── IT ASKS, IT DOES NOT HIDE ────────────────────────────────────────────
 *
 * The rule stated on ancPlausible: "UNKNOWN IS ALWAYS PLAUSIBLE... This
 * narrows a ranking, it does not gate care." A woman entered by a kader may
 * have neither sex nor age recorded, and she is exactly the mother a midwife
 * most needs to reach. So an unknown passes straight through, and a known
 * mismatch is a question rather than a wall — the midwife is standing in front
 * of the person and is the one who can tell.
 */

import { ancPlausible, ancImplausibleReason } from '@/lib/search';
import type { RegisterRecord } from '@/lib/offlineStore';
import { C } from '@/components/ui';

export interface PlausibilityGateProps {
  record: RegisterRecord;
  /** What is about to open, in both languages — "pemeriksaan kehamilan". */
  what: { id: string; en: string };
  isEN?: boolean;
  onContinue: () => void;
  onBack: () => void;
}

/**
 * Returns the interstitial, or null when there is nothing to ask about.
 *
 * Null rather than a boolean so a caller cannot render the form and the
 * question at the same time: `const gate = plausibilityGate(...); if (gate)
 * return gate;` is the whole contract.
 */
export function PlausibilityGate({
  record, what, isEN = false, onContinue, onBack,
}: PlausibilityGateProps) {
  const t = (id: string, en: string) => (isEN ? en : id);
  const reason = ancImplausibleReason(record);

  const wrap: React.CSSProperties = {
    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', textAlign: 'center',
    padding: 28, background: C.bg, color: C.dim,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  };
  const primary: React.CSSProperties = {
    marginTop: 20, padding: '13px 22px', borderRadius: 11,
    background: C.teal, color: C.bg, border: 'none',
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
  };

  return (
    <main style={wrap}>
      <div style={{ fontSize: 30, marginBottom: 12 }} aria-hidden="true">⚠️</div>
      <h1 style={{ fontSize: 19, margin: '0 0 8px', color: C.white }}>
        {t('Periksa dulu', 'Check first')}
      </h1>
      <p style={{ color: C.white, lineHeight: 1.6, margin: '0 0 6px' }}>
        <strong>{record.name}</strong>{reason ? ` — ${reason}` : ''}
        {record.village ? ` · ${record.village}` : ''}.
      </p>
      <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.6, maxWidth: 420 }}>
        {t(
          `Ini bukan profil yang biasa untuk ${what.id}. Lanjutkan hanya jika Anda yakin ini orang yang benar.`,
          `This is not a usual profile for ${what.en}. Continue only if you are sure this is the right person.`,
        )}
      </p>
      <button onClick={onContinue} style={primary}>
        {t('Ya, lanjutkan', 'Yes, continue')}
      </button>
      <button
        onClick={onBack}
        style={{
          marginTop: 12, padding: 13, borderRadius: 11, background: 'transparent',
          color: C.dim, fontSize: 14,
          border: '1px solid rgba(2,195,154,.28)', cursor: 'pointer',
        }}
      >
        {t('Bukan dia — cari lagi', 'Not them — search again')}
      </button>
    </main>
  );
}

/** True when this record should be asked about before a maternal form opens. */
export function needsPlausibilityCheck(record: RegisterRecord | null | undefined): boolean {
  return !!record && !ancPlausible(record);
}
