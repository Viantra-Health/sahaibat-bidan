// app/api/sync/route.ts — proxy for uploading queued ANC/PNC visits.
//
// NOTE: the target endpoint does not exist yet. /api/pwa/sync on the main app
// handles the four Kader modules only; ANC and PNC need their own, writing to
// sahai_anc_visits / sahai_pnc_visits through the same clinical engine the
// WhatsApp path uses. That is the next server-side piece.
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
