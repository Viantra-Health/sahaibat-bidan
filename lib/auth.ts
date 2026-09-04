// lib/auth.ts
// Phone-only identity, matching the Kader app exactly.
//
// She types her registered number and she is in. No OTP, no password, no
// second step, ever — a verification step that can fail on a dead network is a
// midwife who cannot record a visit. The one moment of connectivity is the
// first lookup; after that the app works indefinitely offline.
//
// The passcode (a Bidan-only addition) is a DEVICE lock, not a login: it gates
// opening the app and is verified locally. It lives in lib/passcode.ts.

export interface BidanIdentity {
  profileId: string;
  name: string;
  ngoId: string;
  phone: string;
  facilityId: number | null;
  regionId: number | null;
  village: string | null;
  savedAt: string;
}

const STORAGE_KEY = 'sahaibat_bidan_identity';

export function getIdentity(): BidanIdentity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BidanIdentity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: BidanIdentity): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function clearIdentity(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function isLoggedIn(): boolean {
  return getIdentity() !== null;
}
