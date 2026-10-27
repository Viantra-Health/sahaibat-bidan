'use client';

/**
 * /anc?m=<memberId> — the SAME screen as /anc/<memberId>, reached by a URL
 * that can be precached.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
 *
 * /anc/<memberId> is a dynamic route, so Next renders it on the server and
 * there is no document for it on the device. A midwife in a field with no
 * signal tapping a mother got the browser's own error page — while the
 * register, her visit history and the whole engine sat on the phone, ready.
 * The only missing thing was the HTML.
 *
 * A query is not part of the path, so this one statically rendered page serves
 * EVERY mother. The service worker precaches it once; the id and the data are
 * read out of IndexedDB client-side, which is how the app was always meant to
 * work without signal.
 *
 * It renders the record component itself rather than copying it, so the two
 * routes cannot drift into two different screens for one visit.
 *
 * SUSPENSE IS NOT DECORATION. useSearchParams() opts a page out of static
 * rendering unless it sits under a boundary — and a page that is not static is
 * a page with no document to precache, which is the entire bug. Remove it and
 * this route silently goes back to being server-rendered.
 */

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Record from './[memberId]/page';

function Gate() {
  const router = useRouter();
  const m = String(useSearchParams()?.get('m') ?? '').trim();

  /* ── NO MOTHER NAMED IS THE REGISTER, NOT A MISSING RECORD ─────────────
     This URL is reachable bare now that it is a real page, and the record
     screen would answer "she is not in this device's local data" — which is
     a statement about a mother nobody asked for. /search is precached, so
     this works with no signal too. */
  useEffect(() => { if (!m) router.replace('/search'); }, [m, router]);

  if (!m) return null;
  return <Record />;
}

export default function AncVisitPageByQuery() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  );
}
