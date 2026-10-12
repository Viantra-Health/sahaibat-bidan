// lib/registerBus.ts
//
// "The register changed underneath you."
//
// WHAT THIS FIXES
//
// The register screen read IndexedDB once, on mount, and never again. That was
// fine while the refresh finished before she left the form -- and it does not.
// The upload runs unawaited so that a dead network can never hold up a visit,
// which means the sequence in the field is:
//
//   she saves a delivery       the visit goes into IndexedDB
//   she taps Selesai           /search mounts, reads the register -- STALE
//   syncRegister says cached   the timestamp is seconds old, so no re-read
//   the upload lands           IndexedDB is refreshed, and nobody is looking
//
// Testing saw exactly that: two mothers who had just delivered still showed
// SEDANG HAMIL with a "Lahir" button, the newborn missing, twenty seconds
// later -- and all of it correct the moment the page was reloaded. The data was
// there the whole time. The screen had no reason to look again, so a midwife
// could record the same birth twice.
//
// WHY A BUS AND NOT A POLL
//
// A 2-second poll on a village register is a battery cost paid all day for an
// event that happens four times a shift. This fires when a write actually
// happens, from the one function every register write goes through.
//
// BroadcastChannel reaches the app's other tabs; the window event reaches this
// one, because BroadcastChannel deliberately does not deliver to the sender.

const CHANNEL = 'sahaibat_bidan_register';

/** Called by offlineStore.saveRegister. Nothing else should need to call it. */
export function notifyRegisterChanged(): void {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new Event(CHANNEL)); } catch { /* ignore */ }
  try { new BroadcastChannel(CHANNEL).postMessage(Date.now()); } catch { /* unsupported */ }
}

/**
 * Re-read the register whenever it changes, and whenever the screen comes back.
 *
 * The visibility and focus hooks are not redundant: a phone that slept through
 * the upload delivers no event to a backgrounded page in some browsers, and
 * coming back to a stale register is the whole bug. Returns an unsubscribe.
 */
export function onRegisterChanged(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onVisible = () => { if (document.visibilityState === 'visible') cb(); };
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = () => cb();
  } catch { /* unsupported; the window event still covers this tab */ }

  window.addEventListener(CHANNEL, cb);
  window.addEventListener('focus', cb);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    window.removeEventListener(CHANNEL, cb);
    window.removeEventListener('focus', cb);
    document.removeEventListener('visibilitychange', onVisible);
    try { bc?.close(); } catch { /* ignore */ }
  };
}
