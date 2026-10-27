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
    /* EVERY STATIC ROUTE THE APP HAS. /anc/baru and /kn/baru were missing, so
       "Register a new mother" and "Newborn visit — new baby" — two of the three
       buttons on the register screen — had no document to serve offline on a
       phone that had just installed the app. The dynamic routes
       (/anc/[memberId] and friends) cannot be precached; they rely on the
       runtime rule below, which is why that rule has to actually work. */
    additionalManifestEntries: [
      { url: "/", revision: BUILD_REV },
      { url: "/search", revision: BUILD_REV },
      { url: "/anc/baru", revision: BUILD_REV },
      { url: "/pnc/baru", revision: BUILD_REV },
      { url: "/kn/baru", revision: BUILD_REV },
      { url: "/offline", revision: BUILD_REV },
    ],
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      /* ── MATCHED ON THE PATH, BECAUSE WORKBOX MATCHES ON THE WHOLE URL ──
         Every rule in this array used to be a RegExp anchored with ^\/ — and
         Workbox execs a RegExp against url.href, which is
         "https://bidan.sahaibat.com/search". A pattern anchored to a leading
         slash cannot match a string that starts with "https:", so NONE of these
         page rules had ever matched a single request since the day they were
         written. Online that is invisible: an unmatched request just goes to
         the network, which is what it would have done anyway. Offline it is the
         whole bug — nothing but the four precached documents existed, so the
         app opened and then went nowhere.

         A function matcher takes url.pathname, which is what these patterns
         were always describing. */
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
      },
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
        // Every route the app actually has. This listed only /, /search, /anc
        // and /offline, so the postnatal, newborn and delivery screens were
        // never covered by it -- they had no fresh-first rule at all.
        /* Navigations AND the React payloads a client-side navigation fetches
           (/search?_rsc=…). Those carry a query string, so even a corrected
           path regex would have missed them, and missing them means the router
           cannot move between screens offline — which is what "the app will not
           open" looks like from the outside. */
        urlPattern: ({ url, request, sameOrigin }) => {
          if (!sameOrigin) return false;
          if (url.pathname.startsWith("/api/")) return false;
          const isPage = request.mode === "navigate" || url.searchParams.has("_rsc");
          if (!isPage) return false;
          return /^\/$|^\/search(\/.*)?$|^\/anc(\/.*)?$|^\/pnc(\/.*)?$|^\/kn(\/.*)?$|^\/kb(\/.*)?$|^\/persalinan(\/.*)?$|^\/offline$/.test(url.pathname);
        },
        handler: "NetworkFirst",
        options: {
          cacheName: "bidan-pages-v1",
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      {
        /* This one and the /_next/static rule below are the only two that ever
           worked, because neither is anchored at the start — a RegExp with no
           ^ matches anywhere in the href. They are why the app is fine online. */
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
