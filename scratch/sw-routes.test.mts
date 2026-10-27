/**
 * The service worker, checked against what the build actually produced.
 *
 * Run AFTER `npm run build`:  npx tsx scratch/sw-routes.test.mts
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * Reported from the field, 27 Oct 2026: the app would not open offline, and
 * worked perfectly online. Every runtimeCaching rule in next.config.js was a
 * RegExp anchored with ^\/ — and Workbox execs a RegExp against url.href,
 * which is "https://bidan.sahaibat.com/search". A pattern anchored to a leading
 * slash cannot match a string beginning "https:", so not one of the page rules
 * had ever matched a request since the day it was written.
 *
 * Online that is invisible — an unmatched request goes to the network, which is
 * where it was going anyway. Offline it is the entire bug.
 *
 * Nothing in a build catches this. The config is valid, the regex is valid, the
 * service worker generates, the app works in every online test. So the check is
 * here, against the generated worker rather than the source, because the
 * generated worker is what ships.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0, fail = 0;
const ok = (l: string, c: boolean, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${l}`); } else { fail++; console.log(`  FAIL  ${l}${d ? '\n        ' + d : ''}`); }
};

const SW = 'public/sw.js';
if (!existsSync(SW) || !existsSync('.next/server/app')) {
  console.error('Build first: npm run build — this checks the generated worker, not the source.');
  process.exit(1);
}
const sw = readFileSync(SW, 'utf8');

/* ── 1. no rule may be anchored to a leading slash ──────────────────────── */
const regexRoutes = [...sw.matchAll(/registerRoute\((\/(?:\\.|[^/\\])+\/[gimsuy]*)\s*,/g)].map((m) => m[1]);
ok('the worker registers some RegExp routes', regexRoutes.length > 0, String(regexRoutes.length));
const anchored = regexRoutes.filter((r) => r.includes('^\\/') || r.includes('^/'));
ok('NO REGEXP ROUTE IS ANCHORED AT A LEADING SLASH — it would never match an href',
  anchored.length === 0, anchored.join('\n        '));

/* ── 2. the page rule matches what it is supposed to ────────────────────── */
ok('the page rule is a function matcher on the pathname', /sameOrigin/.test(sw));
ok('…and it also covers the React payloads a client-side navigation fetches',
  /_rsc/.test(sw));
ok('…and it distinguishes a navigation from a subresource', /navigate/.test(sw));

/* ── 3. every statically rendered route is precached ────────────────────── */
const precached = new Set(
  [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('/_next/')),
);

/** Every .html Next prerendered, as the route it serves. */
function builtRoutes(dir = '.next/server/app', prefix = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { out.push(...builtRoutes(join(dir, e.name), `${prefix}/${e.name}`)); continue; }
    if (!e.name.endsWith('.html')) continue;
    const base = e.name.replace(/\.html$/, '');
    if (base.startsWith('_')) continue;              // _not-found is not a route she visits
    out.push(base === 'index' ? (prefix || '/') : `${prefix}/${base}`);
  }
  return out;
}
const routes = builtRoutes();
ok('the build produced static routes to check', routes.length > 0, routes.join(', '));
const unprecached = routes.filter((r) => !precached.has(r));
ok('EVERY STATIC ROUTE IS PRECACHED — a fresh install has no runtime cache to fall back on',
  unprecached.length === 0, unprecached.join(', '));

/* ── 4. and each precached page can render from the precache alone ──────── */
const preAll = new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]));
for (const r of routes) {
  const file = r === '/' ? '.next/server/app/index.html' : `.next/server/app${r}.html`;
  if (!existsSync(file)) continue;
  const needs = [...new Set([...readFileSync(file, 'utf8').matchAll(/\/_next\/static\/[^"'\\]+/g)].map((m) => m[0]))];
  const missing = needs.filter((u) => !preAll.has(u));
  ok(`${r} renders from the precache alone`, missing.length === 0, missing.slice(0, 4).join(', '));
}

/* ── THE FALLBACK, WHICH WAS SILENTLY OFF ─────────────────────────────────
 * The config said `fallbackRoutes: { document: "/offline" }`. FallbackRoutes is
 * the TYPE name in @ducanh2912/next-pwa; the option is `fallbacks`. An unknown
 * key in a JS config is ignored without a word, so no fallback was generated at
 * all — and a navigation the worker could not serve fell through to the
 * BROWSER's error page. A midwife tapping a mother offline saw
 * "ERR_FAILED", not the app.
 *
 * Asserted against the generated worker, because the config looked right. */
ok('THE OFFLINE FALLBACK EXISTS AT ALL', /handlerDidError/.test(sw))
ok('...and the page rule carries it, not only the start url',
  (() => {
    const i = sw.indexOf('bidan-pages-v1')
    return i !== -1 && sw.slice(i, i + 400).includes('handlerDidError')
  })())
ok('...and /offline is precached, so the fallback has something to serve',
  precached.has('/offline'))

/* ── 5. the API must never be cached ────────────────────────────────────── */
ok('API requests are excluded from the page rule', /\/api\//.test(sw));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
