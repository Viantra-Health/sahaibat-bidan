/**
 * Where a record lives, in the form that works with no signal.
 *
 * One builder per flow, so the shape of these URLs is decided in a single place
 * and a screen added later cannot quietly go back to the path form — which is
 * the form that cannot be precached, and therefore the form that fails in a
 * field. See lib/memberId.ts for why.
 */

export type RecordFlow = 'anc' | 'pnc' | 'kn' | 'kb' | 'persalinan';

/** `/anc?m=<id>` — one precached document serves every mother. */
export function recordHref(flow: RecordFlow, memberId: string): string {
  const id = String(memberId ?? '').trim();
  // No id is the register, not a broken record page.
  if (!id) return '/search';
  return `/${flow}?m=${encodeURIComponent(id)}`;
}

/** The five routes that must be precached for the above to work offline. */
export const RECORD_ROUTES: readonly string[] = ['/anc', '/pnc', '/kn', '/kb', '/persalinan'];
