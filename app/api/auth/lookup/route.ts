// app/api/auth/lookup/route.ts — proxy to the main app.
// Mirrors the Kader pattern: the browser never holds the shared secret.
import { NextRequest, NextResponse } from 'next/server';

const MAIN_APP_URL = process.env.NEXT_PUBLIC_MAIN_APP_URL ?? 'https://app.sahaibat.com';
const PWA_SYNC_SECRET = process.env.PWA_SYNC_SECRET ?? '';

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ found: false, error: 'No phone provided' }, { status: 400 });
    }
    const res = await fetch(`${MAIN_APP_URL}/api/pwa/bidan-lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pwa-sync-secret': PWA_SYNC_SECRET },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) {
      // 401 here means PWA_SYNC_SECRET differs between this app and the main
      // one — a deployment fault, not a login fault. Logged distinctly because
      // it is invisible from the client and looks like a bad phone number.
      if (res.status === 401) {
        console.error('[BIDAN_LOOKUP_PROXY] 401 from main app — PWA_SYNC_SECRET mismatch or unset');
      }
      return NextResponse.json({ found: false, reason: res.status === 401 ? 'config' : 'upstream' },
                               { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error('[BIDAN_LOOKUP_PROXY]', e);
    return NextResponse.json({ found: false, error: 'Server error' }, { status: 500 });
  }
}
