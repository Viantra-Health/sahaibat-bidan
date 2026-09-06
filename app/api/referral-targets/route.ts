// app/api/referral-targets/route.ts — proxy for the referral ladder's rungs 1-3.
//
// Rung 4 (the letter) deliberately does not come through here: it must work
// when this route is unreachable, which is most of the time in the field.
import { NextRequest, NextResponse } from 'next/server';

const MAIN_APP_URL = process.env.NEXT_PUBLIC_MAIN_APP_URL ?? 'https://app.sahaibat.com';
const PWA_SYNC_SECRET = process.env.PWA_SYNC_SECRET ?? '';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get('profileId') ?? '';
  if (!profileId) return NextResponse.json({ targets: [], notes: ['no_profile'] });

  try {
    const res = await fetch(
      `${MAIN_APP_URL}/api/pwa/referral-targets?profileId=${encodeURIComponent(profileId)}`,
      { headers: { 'x-pwa-sync-secret': PWA_SYNC_SECRET }, cache: 'no-store' },
    );
    if (!res.ok) return NextResponse.json({ targets: [], notes: [`upstream_${res.status}`] });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ targets: [], notes: ['unreachable'] });
  }
}
