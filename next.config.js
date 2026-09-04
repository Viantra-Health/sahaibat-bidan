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
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  fallbackRoutes: { document: "/offline" },
  workboxOptions: {
    navigationPreload: true,
    additionalManifestEntries: [
      { url: "/", revision: BUILD_REV },
      { url: "/search", revision: BUILD_REV },
      { url: "/offline", revision: BUILD_REV },
    ],
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      // Never cache API routes: a stale register or a replayed sync is worse
      // than no answer.
      { urlPattern: /^\/api\/.*/, handler: "NetworkOnly" },
      {
        urlPattern: /^\/$|^\/search(\/.*)?$|^\/anc(\/.*)?$|^\/offline$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "bidan-pages-v1",
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
  transpilePackages: ["@sahaibat/identity"],
});
