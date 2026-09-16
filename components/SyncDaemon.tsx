'use client';

// components/SyncDaemon.tsx
// Uploads queued visits regardless of what the screen is showing.
//
// WHY IT LIVES OUTSIDE THE PASSCODE GATE
// --------------------------------------
// Every sync call used to sit inside a page component, so a locked phone
// uploaded nothing — the lock silently stopped the one thing that must never
// stop. A midwife who forgets her PIN on Monday and reaches a supervisor on
// Friday would have had four days of visits sitting on a device, unsynced,
// while she had signal the whole time.
//
// It also runs when she is SIGNED OUT, which is the property that makes the
// forgotten-PIN path safe: syncPendingVisits reads the queue straight from
// IndexedDB and every record carries its own profileId and ngoId, so an upload
// needs no session at all. Queued visits reach the server even from a device
// nobody can get into.
//
// That is the whole reason the reset can afford to be simple. The worst case —
// she clears the PIN, cannot sign back in for a week — costs her access, never
// data. Worth saying in training exactly that way.

import { useEffect } from 'react';
import { syncPendingVisits } from '@/lib/syncClient';

/** Five minutes. Frequent enough that a passing bar of signal is caught,
 *  rare enough to be invisible on a metered connection and a small battery. */
const INTERVAL_MS = 5 * 60 * 1000;

export default function SyncDaemon() {
  useEffect(() => {
    let stopped = false;

    const run = () => {
      if (stopped) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      // Always best-effort. A failed sync marks the visit and leaves it
      // queued; it must never surface as an error over a form.
      syncPendingVisits().catch(() => {});
    };

    run();

    // The moment connectivity returns is the highest-value time to try.
    window.addEventListener('online', run);
    // Coming back to the app usually means she has just moved, and moving is
    // how signal appears.
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);

    const timer = setInterval(run, INTERVAL_MS);

    return () => {
      stopped = true;
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);

  return null;
}
