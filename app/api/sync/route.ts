// app/api/sync/route.ts — proxy for uploading queued ANC/PNC/delivery/KN visits.
//
// THE TARGET EXISTS AND IS LIVE. This note used to say it did not, and that it
// was "the next server-side piece" — written when /api/pwa/sync handled the
// four Kader modules only. /api/pwa/bidan-sync has since been built on the main
// app and writes sahai_anc_visits, sahai_pnc_visits, sahai_kn_visits,
// sahai_deliveries and sahai_birth_outcomes through the same @sahaibat/anc-engine
// the WhatsApp path uses. It also creates a sahai_family_members row for each
// liveborn baby and fills sahai_birth_outcomes.member_id.
//
// Measured on production 20 Oct 2026: 213 antenatal visits and 13 deliveries
// have arrived through it. Leaving the old note in place would tell the next
// reader the sync is unbuilt while a thousand rows say otherwise — which is
// worse than no comment, because it is specific and wrong.
//
// WHAT IS STILL A PROXY AND WHY. This route holds PWA_SYNC_SECRET so the device
// never does: the queue posts here with a session and this adds the shared
// secret server-side.
import { NextRequest, NextResponse } from 'next/server';

const MAIN_APP_URL = process.env.NEXT_PUBLIC_MAIN_APP_URL ?? 'https://app.sahaibat.com';
const PWA_SYNC_SECRET = process.env.PWA_SYNC_SECRET ?? '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const visits = body?.visits;
    if (!Array.isArray(visits) || visits.length === 0) {
      return NextResponse.json({ results: [] });
    }
    const res = await fetch(`${MAIN_APP_URL}/api/pwa/bidan-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pwa-sync-secret': PWA_SYNC_SECRET },
      body: JSON.stringify({ visits }),
    });
    if (!res.ok) {
      return NextResponse.json({
        results: visits.map((v: { localId: string }) => ({
          localId: v.localId, ok: false, error: `Main app returned ${res.status}`,
        })),
      });
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error('[BIDAN_SYNC_PROXY]', e);
    return NextResponse.json({ error: 'Sync proxy failed' }, { status: 500 });
  }
}
