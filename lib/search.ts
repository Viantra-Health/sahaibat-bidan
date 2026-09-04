// lib/search.ts
// Offline search over the cached register.
//
// Search is by NAME ONLY — midwives do not carry NIKs, and asking for one is
// how you get "register new" and a duplicate. So the query carries no
// identifying signal beyond a name, and everything that orders the results has
// to come from context the app already holds: her village, how recently the
// person was seen, and whether the flow she opened is about pregnancy.
//
// Ranking rather than truncating is the point. Showing five arbitrary Sitis
// with no hint that a sixth exists is precisely what makes a midwife conclude
// the woman is not registered.

import { nameSimilarity, normaliseName } from '@sahaibat/identity';
import type { RegisterRecord } from './offlineStore';

export interface SearchFilters {
  /** Her own village. Not a hard filter — a boost, so a neighbouring-village
   *  record still appears rather than vanishing. */
  homeRegionId?: number | null;
  /** Set by the flow she opened: ANC ranks pregnant women first. */
  preferPregnant?: boolean;
  /** Tapped chips. These ARE hard filters — she asked for them explicitly. */
  onlyPregnant?: boolean;
  onlyRegionId?: number | null;
  seenWithinDays?: number | null;
}

export interface SearchHit {
  record: RegisterRecord;
  score: number;
  /** Short reasons shown under the row, so a ranking decision is legible
   *  rather than mysterious. */
  why: string[];
}

export interface SearchOutcome {
  hits: SearchHit[];
  /** How many matched but are not shown. Surfaced as "+N lainnya" — silent
   *  truncation is what creates duplicates. */
  more: number;
  total: number;
}

const DEFAULT_LIMIT = 10;
const MIN_SCORE = 0.25;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

export function searchRegister(
  query: string,
  register: RegisterRecord[],
  filters: SearchFilters = {},
  limit = DEFAULT_LIMIT
): SearchOutcome {
  const q = normaliseName(query);
  if (!q) return { hits: [], more: 0, total: 0 };

  const scored: SearchHit[] = [];

  for (const r of register) {
    // ── Hard filters: chips she tapped ──
    if (filters.onlyPregnant && !r.isPregnant) continue;
    if (filters.onlyRegionId != null && r.regionId !== filters.onlyRegionId) continue;
    if (filters.seenWithinDays != null) {
      const d = daysSince(r.lastSeenAt);
      if (d == null || d > filters.seenWithinDays) continue;
    }

    const nameScore = nameSimilarity(q, r.name);
    if (nameScore < MIN_SCORE) continue;

    const why: string[] = [];
    let score = nameScore;

    // ── Proximity. The strongest signal she never has to type: she is
    //    standing in her own village, and so is the woman in front of her.
    if (filters.homeRegionId != null && r.regionId === filters.homeRegionId) {
      score += 0.30;
      why.push('Desa Anda');
    } else if (r.village) {
      why.push(`Luar desa — ${r.village}`);
    }

    // ── Recency. Someone seen last month is likelier than someone seen once
    //    a year ago, and it decays rather than cutting off.
    const d = daysSince(r.lastSeenAt);
    if (d != null) {
      if (d <= 30) { score += 0.15; why.push('terakhir < 1 bulan'); }
      else if (d <= 90) score += 0.08;
      else if (d > 365) score -= 0.05;
    }

    // ── Flow context. She opened ANC; a pregnant woman is the likelier hit.
    if (filters.preferPregnant && r.isPregnant) {
      score += 0.12;
      why.push('sedang hamil');
    }

    // ── An exact normalised name is worth saying out loud.
    if (normaliseName(r.name) === q) why.unshift('nama persis');

    scored.push({ record: r, score, why });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable, and puts the recently-seen first among equals.
    const da = daysSince(a.record.lastSeenAt) ?? Number.MAX_SAFE_INTEGER;
    const db = daysSince(b.record.lastSeenAt) ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  });

  return {
    hits: scored.slice(0, limit),
    more: Math.max(0, scored.length - limit),
    total: scored.length,
  };
}

/** One line of context under a name — the fields that actually separate two
 *  women called Siti, in the order a midwife reads them. */
export function describeRecord(r: RegisterRecord): string {
  const bits: string[] = [];
  if (r.ageYears != null) bits.push(`${r.ageYears} th`);
  else if (r.ageMonths != null) bits.push(`${r.ageMonths} bln`);
  if (r.village) bits.push(r.village);
  if (r.motherName) bits.push(`anaknya ${r.motherName}`);
  if (r.isPregnant && r.edd) bits.push(`HPL ${r.edd}`);
  if (r.nikLast4) bits.push(`NIK …${r.nikLast4}`);
  return bits.join(' · ');
}

export function describeLastSeen(r: RegisterRecord): string | null {
  if (!r.lastSeenAt) return null;
  const when = new Date(r.lastSeenAt).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  return r.lastSeenBy ? `Terakhir ${when} — ${r.lastSeenBy}` : `Terakhir ${when}`;
}
