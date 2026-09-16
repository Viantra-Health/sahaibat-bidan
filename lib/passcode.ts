// lib/passcode.ts
// A device lock, not a login.
//
// WHAT THIS IS FOR
// ----------------
// Login stays phone-only with no OTP — that is settled, and it is a network
// decision: a verification step that can fail on a dead network is a midwife
// who cannot record a visit. This does not change that.
//
// It exists because of what the device holds. A kader's caseload is a list of
// households. A midwife's register is a list of who in the village is
// pregnant, which is identifying, sensitive, and occasionally dangerous to the
// woman if it is seen by the wrong person. Handsets are shared, lent and lost.
//
// So: the passcode gates OPENING the app and is verified entirely on-device,
// so it works with no signal.
//
// HOW IT RESETS, AND WHY THAT IS ENOUGH
// -------------------------------------
// She clears it herself and signs in again. No code, no SMS, no supervisor.
//
// That sounds weak until you notice a passcode cannot be stronger than the
// door it sits behind: login is a phone number with no OTP, so anyone who
// knows her number can already install the app fresh and sign in as her.
// Requiring a sign-in after a reset is therefore exactly as strong as the
// system already is, and it costs nothing to operate.
//
// What makes it safe is SyncDaemon, which uploads the queue even while the
// app is locked or signed out. The cost of a forgotten PIN is access, never
// data — and that is the sentence to put in training.
//
// WHAT IT IS NOT
// --------------
// It is not encryption. A determined person with the handset and a debugger
// can read IndexedDB regardless, and pretending otherwise would be worse than
// not having it. It stops the casual case — a relative scrolling through a
// borrowed phone — which is the case that actually happens.
//
// THE RULE THAT OUTRANKS IT
// -------------------------
// A forgotten passcode must NEVER destroy the queue. Queued visits are the
// only copy of something that happened to a real person, and no lock-out
// policy is worth a day of a village's antenatal records. Reset clears the
// passcode and nothing else.

const KEY = 'sahaibat_bidan_passcode';       // { salt, hash, createdAt }
const UNLOCKED = 'sahaibat_bidan_unlocked';  // session-scoped, cleared on close
const ATTEMPTS = 'sahaibat_bidan_attempts';

export const PASSCODE_LENGTH = 4;
// No hard lock-out, deliberately. Attempts are counted only to soften the
// screen after a few misses; nothing is ever wiped. See the rule above.

interface Stored { salt: string; hash: string; createdAt: string }

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch { return null; }
}

/**
 * SHA-256 over salt + code.
 *
 * Not a password KDF, and a four-digit space is brute-forceable in about no
 * time by anyone who can read localStorage. That is accepted: this is a
 * screen-door lock. Hashing at all is so a passcode she has reused elsewhere
 * is not sitting in plain text on a shared handset.
 */
async function hash(code: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newSalt(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isPasscodeSet(): boolean {
  return read() !== null;
}

export async function setPasscode(code: string): Promise<void> {
  if (!/^\d+$/.test(code) || code.length !== PASSCODE_LENGTH) {
    throw new Error(`Passcode harus ${PASSCODE_LENGTH} angka.`);
  }
  const salt = newSalt();
  const h = await hash(code, salt);
  localStorage.setItem(KEY, JSON.stringify({ salt, hash: h, createdAt: new Date().toISOString() }));
  markUnlocked();
  resetAttempts();
}

export async function verifyPasscode(code: string): Promise<boolean> {
  const stored = read();
  if (!stored) return true;              // nothing set — nothing to verify
  const ok = (await hash(code, stored.salt)) === stored.hash;
  if (ok) { markUnlocked(); resetAttempts(); }
  else { bumpAttempts(); }
  return ok;
}

/**
 * Clear the passcode. Deliberately does NOT touch IndexedDB.
 *
 * Called after a WhatsApp reset, and it is the reason this file holds no
 * "wipe on N failures" logic: the recovery path for a forgotten code is a
 * message, never data loss.
 */
export function clearPasscode(): void {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(UNLOCKED);
    resetAttempts();
  } catch { /* storage unavailable — nothing to clear */ }
}

// ── session state ────────────────────────────────────────────────────────────
// sessionStorage, so closing the app re-locks it but switching between the
// register and a form does not.

export function markUnlocked(): void {
  try { sessionStorage.setItem(UNLOCKED, '1'); } catch { /* ignore */ }
}

export function isUnlocked(): boolean {
  if (!isPasscodeSet()) return true;
  try { return sessionStorage.getItem(UNLOCKED) === '1'; } catch { return true; }
}

export function lock(): void {
  try { sessionStorage.removeItem(UNLOCKED); } catch { /* ignore */ }
}

// ── attempt counting, for the hint only ──────────────────────────────────────
export function attempts(): number {
  try { return parseInt(localStorage.getItem(ATTEMPTS) ?? '0', 10) || 0; } catch { return 0; }
}
function bumpAttempts(): void {
  try { localStorage.setItem(ATTEMPTS, String(attempts() + 1)); } catch { /* ignore */ }
}
function resetAttempts(): void {
  try { localStorage.removeItem(ATTEMPTS); } catch { /* ignore */ }
}

// resetInstructions() was removed. It told her to send "RESET PIN" over
// WhatsApp to a handler that was never built, which is worse than offering
// nothing: it sends a midwife who is already locked out to wait for a reply
// that cannot come. If a server-side reset is added later, this is where the
// wording goes back.
