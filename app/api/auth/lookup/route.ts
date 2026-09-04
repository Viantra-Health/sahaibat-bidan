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
    if (!res.ok) return NextResponse.json({ found: false }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch (e) {
    console.error('[BIDAN_LOOKUP_PROXY]', e);
    return NextResponse.json({ found: false, error: 'Server error' }, { status: 500 });
  }
}
