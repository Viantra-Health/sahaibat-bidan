// app/api/register/route.ts — proxy to the village-scoped person register.
import { NextRequest, NextResponse } from 'next/server';

const MAIN_APP_URL = process.env.NEXT_PUBLIC_MAIN_APP_URL ?? 'https://app.sahaibat.com';
const PWA_SYNC_SECRET = process.env.PWA_SYNC_SECRET ?? '';

// Next caches fetch() by default in the App Router, and a proxy route with no
// directive is itself eligible for static optimisation. Between them, this
// endpoint served a register snapshot taken before a mother existed and kept
// serving it: she was registered, the visit synced, the row was in the
// database with the right village and is_active true — and she never appeared
// in the midwife's list, because the list was cached.
//
// A register is the one thing in this app that must never be stale. It IS the
// working copy the device downloads for use with no signal, so a cached one
// silently hands her yesterday's village.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const profileId = searchParams.get('profile_id');
    if (!profileId) {
      return NextResponse.json({ error: 'profile_id required', records: [] }, { status: 400 });
    }
    const params = new URLSearchParams({ profile_id: profileId });
    const since = searchParams.get('since');
    if (since) params.set('since', since);

    const res = await fetch(`${MAIN_APP_URL}/api/pwa/register?${params}`, {
      headers: { 'Content-Type': 'application/json', 'x-pwa-sync-secret': PWA_SYNC_SECRET },
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Main app returned ${res.status}`, records: [] }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error('[BIDAN_REGISTER_PROXY]', e);
    return NextResponse.json({ error: 'Proxy failed', records: [] }, { status: 500 });
  }
}
