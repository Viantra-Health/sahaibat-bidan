'use client';

// components/UpdateBanner.tsx
//
// "There is a newer version of this app than the one you are looking at."
//
// WHY THE FIRST OPEN AFTER A RELEASE RUNS THE OLD BUILD
//
// `/` and `/search` are in additionalManifestEntries, so Workbox precaches
// them, and the precache route it registers is matched BEFORE anything in
// runtimeCaching. The NetworkFirst rule next to them never gets a say for
// those two addresses. That precaching is deliberate and worth keeping: it is
// what makes the register open for a midwife who installed the app and walked
// straight out of signal.
//
// But it means the document on screen was handed over by the OLD service
// worker, before the new one could take control. The new build is downloaded,
// activated, and sitting there unused until something reloads. Testing saw it
// twice in one round -- including once where it served the crashing release
// one more time after the hot-fix had already shipped.
//
// WHY THIS DOES NOT RELOAD BY ITSELF
//
// Because reloading underneath her is the more expensive bug. `reloadOnOnline`
// did exactly that and threw away half-filled visits three times in one round
// of testing; the note in next.config.js is about that. A midwife mid-visit
// must be the one who decides when the screen is allowed to go blank. So this
// asks, it can be dismissed, and it never acts on its own.

import { useEffect, useState } from 'react';

export default function UpdateBanner() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    let live = true;

    /* controllerchange fires when a new worker takes over, which with
       skipWaiting happens shortly after the page loads on a release. That is
       precisely the moment the running page became out of date. */
    const onChange = () => { if (live) setReady(true); };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || !live) return;
      // Already downloaded and waiting from a previous visit.
      if (reg.waiting && navigator.serviceWorker.controller) setReady(true);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          // "installed" with a controller present means an UPDATE, not a
          // first install -- a first install has nothing to be newer than.
          if (w.state === 'installed' && navigator.serviceWorker.controller && live) setReady(true);
        });
      });
      // A midwife may keep the app open for a whole shift.
      reg.update().catch(() => {});
    }).catch(() => {});

    return () => {
      live = false;
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
    };
  }, []);

  if (!ready || dismissed) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
        background: '#8C2F4A', color: '#FFF',
        fontSize: 13, lineHeight: 1.45,
        boxShadow: '0 -2px 12px rgba(0,0,0,.18)',
      }}
    >
      <span style={{ flex: 1 }}>Versi baru sudah siap · A new version is ready</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          flex: '0 0 auto', padding: '7px 12px', borderRadius: 9, cursor: 'pointer',
          background: '#FFF', color: '#8C2F4A', border: 'none', fontSize: 13, fontWeight: 700,
        }}
      >
        Muat ulang
      </button>
      {/* Dismissible, because "later" is a legitimate answer when she is
          holding a bleeding woman. It comes back on the next launch. */}
      <button
        onClick={() => setDismissed(true)}
        aria-label="Nanti / Later"
        style={{
          flex: '0 0 auto', padding: '7px 9px', borderRadius: 9, cursor: 'pointer',
          background: 'transparent', color: '#FFF',
          border: '1px solid rgba(255,255,255,.5)', fontSize: 13,
        }}
      >
        ✕
      </button>
    </div>
  );
}
