# SahAIbat Bidan

The midwife's app. An offline-first PWA for antenatal, delivery, postnatal and
newborn care in Indonesian villages.

This file is the reference for **building on it and supporting it**. It assumes
no prior knowledge of the codebase.

---

## 1 · What it is, and what it is not

A bidan in rural Indonesia runs almost the whole pregnancy herself. She sees a
woman six times before the birth, attends the birth, sees her four times after
it, and sees the baby three times in the first month. Referral to a doctor is
the **exception**, not the destination — in a remote posyandu it is rare, and
often it is a four-hour road.

That shapes everything here. An app that only captures data and flags risk is a
data-entry chore feeding someone else's dashboard. So the centre of gravity is:

> **what did I find last time, what did I do about it, what is still outstanding,
> and what should I do now** — with the midwife deciding, always.

It is **not** a triage bot, it does not diagnose, and **no part of it uses AI**.
Every clinical rule is a transcribed national standard with a line of code you
can point at.

### Offline is the normal case, not the degraded one

She works where there is no signal. Everything is written to IndexedDB first and
uploaded when a network appears. A visit is never lost because the sync failed,
and the app never blocks on the network.

---

## 2 · The pieces, and where they live

| Repo | Role |
|---|---|
| **`sahaibat-bidan`** (this one) | The PWA. Forms, offline queue, device passcode, referral letter. |
| **`sahaibat-healthcare`** | The server. Owns the database; every write and read passes through its `/api/pwa/*` routes. |
| **`@sahaibat/anc-engine`** | The clinical rules. Pure functions, no I/O: 10T scoring, flags for all four flows, the suggested care plan. |
| **`@sahaibat/identity`** | Name / phone / NIK normalisation and match tiering. |

```
   Bidan PWA  ──►  /api/sync      ──►  healthcare /api/pwa/bidan-sync  ──►  Postgres
   (IndexedDB)     /api/register  ──►  healthcare /api/pwa/register    ──►  Postgres
                   /api/auth/lookup ►  healthcare /api/pwa/bidan-lookup
```

The Bidan app **holds no database credentials**. Its three API routes are thin
proxies that add `PWA_SYNC_SECRET` and forward to `NEXT_PUBLIC_MAIN_APP_URL`.
If that secret differs between the two deployments, every request 401s and the
user sees "an error occurred" — indistinguishable from an unregistered number.
That is logged distinctly in `app/api/auth/lookup/route.ts` for exactly that
reason.

### Why the engine is a separate package

The same rules run in three places: on her device as she types, on the server at
sync, and in the WhatsApp fallback path. If they drifted, a visit would score
differently depending on how it arrived. The server recomputes and **logs any
disagreement** with the client's score — that is the only way a stale app version
becomes visible, because the numbers otherwise look perfectly plausible.

---

## 3 · The four clinical flows

| Flow | Covers | Table | Engine |
|---|---|---|---|
| **ANC** | Pregnancy, K1–K6 | `sahai_anc_visits` | `score10T`, `generateClinicalFlags` |
| **Delivery** | The birth | `sahai_deliveries` + `sahai_birth_outcomes` | `generateDeliveryFlags` |
| **PNC** | Mother after birth, KF1–KF4 | `sahai_pnc_visits` | `generatePncFlags` |
| **KN** | Baby, 0–28 days, KN1–KN3 | `sahai_kn_visits` | `generateKnFlags` |

They chain: a delivery clears `is_pregnant` and `edd`, registers each **living**
baby as a person in her mother's family, and that baby's register row then offers
KN instead of ANC.

### KN is the only flow keyed on a child

Every other table hangs off the mother. KN hangs off the **baby's** `member_id`,
because her KN visits, her growth chart in Kader and her immunisations are one
child's record and only her own id can join them.

Its rules are deliberately stricter than the mother's: **hypothermia below 36.5 °C
is an emergency**, not a warning — a newborn cannot rewarm herself, and cold is
the commonest presenting sign of sepsis. Fever starts at 37.5, not 38. Jaundice is
read by the **day it appears**: day one is always pathological, days 2–14 are
monitored, past 14 is prolonged, and palms-and-soles outranks and *suppresses* all
three so one instruction reaches her.

---

## 4 · Five rules that explain most of the code

### 4.1 Silence is never a "no"

Every clinical question is **three-state**: yes / no / not asked. `null` means she
did not answer, and no rule may read it as a negative finding. If "not recorded"
collapsed into "no danger signs", an unfinished examination would read as a clean
bill of health for a baby who might be septic.

This is why `tri()` in the sync route refuses to coerce, and why the newborn
tables are full of nullable booleans.

### 4.2 Nothing is pre-accepted

The suggested care plan opens with **nothing ticked**. Pre-accepting would look
efficient and would be a fabrication: the record would claim she gave iron and
counselled and booked a follow-up when she may have done none of it. Only what
she taps is recorded as care given.

### 4.3 Declining is a different answer from ignoring

A line she crosses out says she considered it and said no — often correctly (the
road is washed out, there is no iron). That is stored structurally in
`care_plan.declineReasons`, because a declined line is *absent* from the composed
T9/T10 text and absent cannot be told apart from never-suggested.

Two of the decline reasons are her **clinical judgement** — *"not right for this
woman"*, *"I do not agree with this"* — offered as first-class answers, not buried
under "other". `sahai_anc_plan_decisions.reason_class` splits them from
`system_gap` (no stock, too far), because those need completely different action:
one is a procurement finding, the other is the guidance being wrong for her
district.

### 4.4 Nothing ever blocks

The skip-reason prompt, the plan panel and the what's-due panel all **name** an
omission rather than preventing a save. A midwife holding a bleeding woman must be
able to record and leave. A prompt that can trap her is abandoned in the field
within a week, and then nothing is recorded at all.

### 4.5 A wrong identity match is worse than a duplicate

A duplicate is an afternoon of merging. A wrong match is two women sharing one
medical record, with one woman's blood pressure and another's haemoglobin in the
same history. So matching refuses when uncertain — see §6.

---

## 5 · How a visit travels

1. She fills a form. The engine runs **on every keystroke**; a fever raises
   `RUJUK SEGERA` while the thermometer is still in her hand.
2. On save, `lib/saveVisit.ts` computes the score and flags **on the device** and
   writes a `QueuedVisit` to IndexedDB. The assessment stored is the one she
   actually saw — if the rules change next month, the old visit keeps its own.
3. `components/SyncDaemon.tsx` uploads when there is a network. It sits **above
   the passcode gate**, so sync runs while the device is locked and while she is
   signed out — no data is lost because she forgot her PIN.
4. The server resolves identity, recomputes, writes the visit, and creates a
   referral if the rules call for one.

### Identity at sync

- **`memberId` present** — she picked the woman from the register. A confirmed
  identity stays confirmed; re-running the match could land on someone else.
- **`memberId` null** — new registration. The ladder runs: **NIK → phone → name →
  create**.
- **KN never runs the ladder.** A newborn has no NIK and no phone, and matching a
  baby by name would merge two babies called "Bayi" in one village. She is picked
  from the register or the visit is recorded unattached — recoverable, where a
  wrong merge is not.

---

## 6 · Name matching (read this before touching it)

`findMemberByName` in `sahaibat-healthcare/lib/family/familyRegistry.ts`.

The database query is only a **candidate generator**. The decision belongs to
`nameSimilarity` from `@sahaibat/identity`, which understands that Indonesian
names are token sets rather than ordered first/last pairs.

| | |
|---|---|
| Threshold | **0.85** (`NAME_MATCH_THRESHOLD`) |
| Ambiguity margin | **0.08** (`AMBIGUITY_MARGIN`) — two candidates this close, refuse |
| Probe token | the **longest**, never the first |

The longest token matters: the first word of an Indonesian name is very often an
honorific or a near-universal given name (`Ibu`, `Siti`, `Ny`), which selects half
the village.

> **What this replaced:** first-word substring `LIKE`, first row wins, no score.
> In production it resolved `Siti Nurhaliza` → `Ibu Siti Rahayu`. Two real women,
> one record.

`scripts/check-name-matching.ts` in the healthcare repo pins the cases. Run it
after any change here.

---

## 7 · The referral ladder

Four rungs, and the app works at rung 4 with nothing else present:

1. A provider on the platform (`sahai_referral_providers` — currently empty)
2. The mapped Puskesmas
3. DOK, if the receiving doctor uses it — **never mandatory**
4. **A plain-text letter she can hand over** (`lib/referralLetter.ts`)

Rung 4 is the floor and everything above is an upgrade. A referral network that
only works when the receiving doctor is a customer is a network with a sales
prerequisite. The letter needs no network, no provider on the platform, and nobody
at the other end who has heard of us — which is what actually happens.

It is **plain text on purpose**: it has to survive being pasted into WhatsApp,
read off a screen in sunlight, copied by hand onto a paper form, and printed by
whatever the clinic has. Every one of those is likelier than a PDF opening
correctly on a shared handset.

**The alert and the letter are produced on the device** from the engine's flags.
They do **not** depend on the `sahai_referrals` row. When referral creation was
broken for months (§9.2), nothing reached a midwife wrongly — what was lost was the
referral as a *tracked object*.

---

## 8 · Support runbook

### 8.1 "I registered a mother and she is not in my list"

1. Is she in the database? `sahai_family_members` by name.
2. Is her family's `region_id` set, and does it match the bidan's scope?
   Scope = profile `region_id`, else the facility's.
3. **Is the API's data stale?** Fetch `/api/register?profile_id=…` and look at the
   newest `updatedAt` across the response. If it is old and does not move, it is a
   caching problem, not a missing row — see §9.1.

### 8.2 "It says an error occurred when I log in"

Almost always `PWA_SYNC_SECRET` differing between the Bidan and healthcare
deployments. It looks exactly like an unregistered number. Check the healthcare
logs for a 401 on `/api/pwa/bidan-lookup`.

### 8.3 "The alert said refer but there is no referral"

Look for `REFERRAL INSERT FAILED` in the healthcare runtime logs. All four insert
sites log it now. Historically they discarded the error and the record said
`referral_generated = true` pointing at nothing (§9.2).

### 8.4 Visits are queued and not uploading

`SyncDaemon` runs above the passcode gate, so locked ≠ stuck. Check the device is
actually online, then the healthcare logs for the sync route. A queued visit is
never deleted until the server confirms it.

### 8.5 Deploying an engine change

`@sahaibat/anc-engine` is pinned to an exact commit in both consumers'
`package.json`. See `BUMPING.md` in the engine repo. The short version:

```bash
# after pushing the engine, in BOTH sahaibat-healthcare and sahaibat-bidan
npm i github:Viantra-Health/sahaibat-anc-engine#<new-sha>
grep -o 'anc-engine.git#[0-9a-f]\{40\}' package-lock.json | head -1   # verify
rm -rf .next && npm run build                                          # cold cache
```

Never trust a local build alone: a stale `node_modules` satisfies `tsc` while
Vercel fails with *"has no exported member"*.

---

## 9 · Traps that have actually bitten

### 9.1 Next caches Supabase reads

`supabase-js` talks to PostgREST over `fetch()`, and in the App Router `fetch()`
results land in Next's Data Cache. A GET from a route handler can be answered from
a cached response instead of the database, **indefinitely**.

It presents as a missing row, not an error. `/api/pwa/register` once returned the
same 22 members for half an hour while the database held 23; the newest
`updated_at` in the response was two weeks stale and a mother created three
seconds earlier by the same app was absent. **Writes are unaffected** — POST is
never cached — so every sync succeeded and only reads were frozen.

`export const dynamic = 'force-dynamic'` is **not** sufficient; it governs
rendering, not a fetch issued inside a library. The fix lives in
`lib/supabaseAdmin.ts`, so no route can forget:

```ts
global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) }
```

**Diagnostic:** ask the API what it thinks the newest row is. If that timestamp is
old and static, it is the cache.

### 9.2 CHECK constraints silently rejecting enum values

Twice. `source_type` lacked `'delivery'` and `'kn'`; `urgency` allowed only
`'segera'`/`'rujuk'` while the engine emits `'emergency'`/`'urgent'` — so **every
referral the app ever attempted was rejected**, for months, with the error
discarded at all four call sites.

Before adding any new value to an enum-ish column, read it:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.sahai_referrals'::regclass;
```

### 9.3 Client and server disagreeing about a field name

A field sent as `weightGrams` and read as `weight` vanishes in total silence.
Four PNC columns were null for every app-recorded visit this way.

```bash
python3 scripts/check-sync-contract.py    # in sahaibat-healthcare
```

Exceptions are allowed but must carry a reason.

### 9.4 Supabase's console runs a script as one transaction

One error rolls back everything before it. A `max(uuid)` failure in a view once
took a `create table` down with it and left no trace. Lead migrations with a
STEP 0 probe, and drop a CHECK **before** rewriting rows to values it forbids.

---

## 10 · Local development

```bash
npm install
npm run dev
```

Requires `NEXT_PUBLIC_MAIN_APP_URL` and `PWA_SYNC_SECRET`. Without them, login
and sync both fail in ways that look like data problems rather than config.

```bash
npm run build          # always before pushing — tsc misses route-export errors
npx tsc --noEmit
```

In `sahaibat-anc-engine`: `npm test` — 245 tests, no framework, no dependencies.
Every number asserted there is a clinical threshold somebody signed off. A failure
means either extraction broke something or a threshold moved, and both need a
human rather than a green tick.

---

## 11 · Map of the code

```
app/
  page.tsx                  login (phone only) + passcode gate
  search/page.tsx           the register; routes a baby to KN, a mother to ANC
  anc/[memberId]            antenatal visit for a known mother
  anc/baru                  antenatal visit + new registration
  pnc/[memberId], pnc/baru  postnatal
  persalinan/[memberId]     delivery
  kn/[memberId]             newborn visit
  api/{register,sync,auth/lookup,referral-targets}   thin proxies

components/
  AncForm  PncForm  DeliveryForm  KnForm     the four flows
  DuePanel        what is still outstanding this pregnancy
  PlanPanel       suggested care plan, accept / edit / decline
  SkipReasons     why an expected 10T standard was not done
  VisitHistory    what was found last time and what was planned
  ReferralPanel   the four rungs
  PasscodeGate    device lock; reset never touches the queue
  SyncDaemon      sits ABOVE the gate, runs locked and signed out

lib/
  offlineStore.ts   IndexedDB: queued visits + the downloaded register
  saveVisit.ts      form -> scored, flagged, queued
  syncClient.ts     upload
  due.ts            what is outstanding across the whole pregnancy
  search.ts         register search, K-schedule due state, newborn routing
  referralLetter.ts rung 4
  lang.ts theme.ts  ID/EN (Indonesian default) and light/dark
```

---

## 12 · Known and deliberate

- **Referral rungs 1–3 have no data.** `sahai_referral_providers` is empty. Rung 4
  works regardless, which is the point of the ladder.
- **USG is not prompted for.** The 2024 standard expects two, and no column records
  whether one happened. Nagging every mother about something probably already done
  is how a checklist stops being read. It belongs in `DuePanel` the day the field
  exists.
- **`sahai_newborn_continuity` is only meaningful for babies born through Bidan.**
  1,068 of 1,152 existing children have no NIK and cannot be linked automatically,
  so a null `first_growth_record` means "not linked" at least as often as "not seen".
- **Historical `sahai_children` rows are not backfilled.** Matching them means
  guessing on name, and a wrong guess merges two children's medical records.
- **`carePlan.ts` needs clinical review before a real district.** ~50 transcribed
  actions that will read as standing orders on a phone at 6am.
