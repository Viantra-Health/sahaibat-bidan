'use client';

/**
 * Which mother this screen is about — from the path, or from the query.
 *
 * ── WHY THERE ARE TWO ANSWERS ────────────────────────────────────────────
 *
 * A record page used to live only at /anc/<memberId>. That is a dynamic route,
 * so Next renders it on the server, so there is no HTML for it on the device —
 * and a midwife in a field with no signal tapping a mother got the browser's
 * own error page. Everything she needed was already on the phone: the register,
 * the visit history, the engine. The only missing thing was the document.
 *
 * A QUERY IS NOT PART OF THE PATH, so /anc?m=<id> is served by ONE statically
 * rendered page that the service worker can precache. Every mother then opens
 * from that single document, with the id and the data read out of IndexedDB
 * client-side — which is how this app was always meant to work offline.
 *
 * The path form still works and still resolves, because links live in people's
 * histories, in WhatsApp messages and on paper, and a URL that has been handed
 * out does not get to stop working. It is simply not the one the app builds any
 * more. See lib/offline-links.ts for the builders.
 */

import { useParams, useSearchParams } from 'next/navigation';

export function useMemberId(): string {
  const params = useParams<{ memberId?: string }>();
  const search = useSearchParams();
  /* The path wins when both are present: it is the more specific statement, and
     a stale ?m= left on a path URL must not redirect a visit to another
     mother. Decoded, because a member id can arrive percent-encoded from a
     shared link. */
  const fromPath = String(params?.memberId ?? '').trim();
  if (fromPath) {
    try { return decodeURIComponent(fromPath); } catch { return fromPath; }
  }
  return String(search?.get('m') ?? '').trim();
}
