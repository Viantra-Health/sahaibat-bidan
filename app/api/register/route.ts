// app/api/register/route.ts — proxy to the village-scoped person register.
import { NextRequest, NextResponse } from 'next/server';

const MAIN_APP_URL = process.env.NEXT_PUBLIC_MAIN_APP_URL ?? 'https://app.sahaibat.com';
const PWA_SYNC_SECRET = process.env.PWA_SYNC_SECRET ?? '';

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
