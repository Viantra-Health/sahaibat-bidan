/** @type {import('next').NextConfig} */

// Revision for the manually-precached HTML routes. MUST change every deploy,
// or Workbox treats the precached shell as unchanged and keeps serving an old
// one that references purged JS chunks — the "reinstall the PWA to get updates"
// bug the Kader app already hit once.
const BUILD_REV =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
  `dev-${Date.now()}`;

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: true,
  skipWaiting: true,
  /* ── NEVER RELOAD WHEN THE SIGNAL COMES BACK ─────────────────────────────
     This was true, and it is the single most expensive line in this file. In
     the field signal comes and goes constantly; every time it returned,
     next-pwa reloaded the page and whatever she was typing was gone. Testing
     caught it three times: a half-filled visit replaced by an empty form, with
     nothing queued.

     It also explains the duplicate upload seen in the same runs. The reload
     restarted the app mid-sync, so a POST already in flight lost its response
     and the fresh instance re-sent the same visit.

     Nothing is lost by turning it off. SyncDaemon already listens for `online`
     and uploads without touching the page, which is the behaviour this option
     was presumably meant to provide. */
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  fallbackRoutes: { document: "/offline" },
  workboxOptions: {
    navigationPreload: true,
    additionalManifestEntries: [
      { url: "/", revision: BUILD_REV },
      { url: "/search", revision: BUILD_REV },
      { url: "/pnc/baru", revision: BUILD_REV },
      { url: "/offline", revision: BUILD_REV },
    ],
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      // Never cache API routes: a stale register or a replayed sync is worse
      // than no answer.
      { urlPattern: /^\/api\/.*/, handler: "NetworkOnly" },
      {
        /* ── NETWORK FIRST, WITH THE CACHE AS THE FALLBACK ──────────────────
           This was StaleWhileRevalidate, which serves the cached page and
           fetches a new one for NEXT time. The consequence found in testing:
           the first open after a release still ran the old build, and the new
           one appeared only on the following load, with no prompt. A midwife
           who opens the app once a day runs a fixed clinical rule a day late.

           NetworkFirst inverts that — online she gets the deployed build,
           offline she gets the cache, which is the behaviour this app actually
           wants. The three-second timeout is what keeps it honest on a weak
           signal: it is not "online or nothing", it is "try, briefly, then use
           what we have". Offline is still the normal case and still costs
           nothing. */
        urlPattern: /^\/$|^\/search(\/.*)?$|^\/anc(\/.*)?$|^\/offline$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "bidan-pages-v1",
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\.(?:js|css|woff2?|png|jpg|svg|ico)$/,
        handler: "CacheFirst",
        options: {
          cacheName: "bidan-assets-v1",
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\/_next\/static\/.*/,
        handler: "CacheFirst",
        options: {
          cacheName: "bidan-next-static-v1",
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      { urlPattern: /^https:\/\/.*\.supabase\.co\/.*/, handler: "NetworkOnly" },
    ],
  },
});

module.exports = withPWA({
  reactStrictMode: true,
  transpilePackages: ["@sahaibat/identity", "@sahaibat/anc-engine"],
});
