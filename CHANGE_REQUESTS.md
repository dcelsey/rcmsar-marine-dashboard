# Change Requests

Log of user-requested changes. Newest at top. Status: `open`, `in-progress`, `done`, `parked`.

---

## CR-006 — Serve `wind.json` from a Cloudflare Worker instead of the deploy bundle

- **Logged:** 2026-07-31
- **Status:** open — agreed direction, not started
- **Problem:** the client reads `/data/wind.json` out of the Vercel deploy bundle, so every 15-min bot commit must trigger a full rebuild just to move a ~26 KB file. That's **~96 deploys/day against the Hobby tier's 100/day cap** (93–96/day observed all week). Nothing has broken, but the headroom is a few deploys, and the failure mode is silent: fresh data lands in the repo while the site serves a stale build. Commit-message tokens are **not** a lever — Vercel here ignores both `[skip ci]` and `[skip vercel]` (CR-005).
- **Direction:** serve `wind.json` from a Cloudflare Worker (or R2), so data freshness stops depending on a rebuild. Deploys would drop from ~96/day to a handful — only real code changes. This reuses infrastructure already in place and understood: `cf-workers/fetch-wind-trigger/` and `cf-workers/ais-proxy/`. Duncan's call, 2026-07-31, on realising the AIS layer already works this way and costs zero deploys.
- **Why a Worker over raw.githubusercontent:** raw does work — it sends `access-control-allow-origin: *` and caches 5 min, comfortably inside the 15-min refresh — and it was tried in `7c265ce`, then reverted in `e0281fd`. It's the zero-infrastructure option and a reasonable fallback. A Worker is preferred because it gives control over cache headers, can serve currents/tides the same way, and keeps the data path on infrastructure we already operate rather than depending on GitHub's CDN behaviour for a SAR tool.
- **Sequencing — this is the trap that bit once already.** The loader change must be **live in production** before any attempt to reduce deploys. Deploys are what ship the loader, so cutting them first strands the very change that makes cutting them safe. Order: (1) change the client to read from the Worker, (2) merge and confirm the **deployed bundle** actually fetches from it, (3) only then reduce deploy frequency. Verify with the deployed asset, not the repo.
- **Also worth doing at the same time:** `currents.json` and `tides-map.json` have the same shape (6-hourly, ~8 deploys/day between them). Moving all three makes the deploy count reflect code changes only.

## CR-005 — Vercel skips commits that land during an in-flight build

- **Logged:** 2026-07-30 · **corrected 2026-07-31** (the original diagnosis below was wrong)
- **Status:** understood — no action needed beyond knowing the behaviour
- **What's actually true.** Vercel deploys **promptly and indiscriminately**: every deploy studied ran **14–18 s after its commit**, for bot and code commits alike. What decides whether a commit deploys is **isolation in time**, not its author or message. A commit landing while a previous build is in flight is coalesced away; its content ships with the next deploy instead.

  Over the last 24 h (102 deployed / 32 skipped):

  | | median gap from previous commit |
  |---|---|
  | deployed | **899 s** (~15 min) |
  | skipped | **326 s** (~5 min) |

  Bot commits arrive 15 min apart in isolation, so they nearly always deploy. Hand-pushed commits tend to arrive in bursts, so they usually don't — which is the whole illusion.
- **Practical implication:** after pushing code, expect it to reach production on the **next isolated commit**, typically within one 15-min bot cycle. Don't push a burst and assume the last one shipped, and **don't read a missing deployment record as a failure**. Verify by checking whether the deployed SHA *contains* your commit (`git merge-base --is-ancestor <yours> <deployed>`), not by looking for your own SHA.
- **Still true:** Vercel ignores **both** `[skip ci]` and `[skip vercel]` here — `dd76a98` carried both and deployed anyway. Commit-message tokens are not a usable lever for cutting deploy count. An attempt to use one was reverted in `5918c7a`.
- **Why the original diagnosis was wrong** (worth recording, because the method failed silently): it claimed *"plain code pushes don't deploy — zero of the last 100 deployments correspond to a code commit."* Two compounding errors. (1) The 100-deployment sample ended at 19:45 on 2026-07-30, and the only code commits inside it had been coalesced; `e0281fd` — a code commit — deployed at 20:15:10 with a normal 15 s lag, just *after* the sampled window. (2) The per-commit probe used `GET /deployments?sha=<full-sha>`, which returned `0` even for `e0281fd`, a commit that demonstrably deployed. **That filter is unreliable — enumerate deployments and match on `.sha` instead.** Duncan caught this by comparing a commit time to its actual deploy time in the Vercel dashboard.
- **Deploy volume:** the wind bot still drives ~96 deploys/day against the Hobby tier's **100/day** cap (93–96/day observed). Nothing has broken, but headroom is thin. Reducing it means decoupling data delivery from the deploy bundle (serve `wind.json` from raw.githubusercontent, a Worker, or R2) so freshness doesn't need a rebuild — commit-message tokens won't do it. A first attempt at the raw.githubusercontent half was reverted in `e0281fd` as unverified, not as wrong.

## CR-004 — Hourly marine stations blank out at the top of each hour

- **Logged:** 2026-07-30
- **Status:** done (2026-07-31)
- **Problem:** Kelp Reefs, Discovery Island and Victoria Harbour disappear from the sar33 wind card for part of each hour. Reported live on 2026-07-30 after the CR-002 work.
- **Cause:** CR-002 set `WINDOW_MIN = STALE_MIN` (60) in `scripts/fetch-wind.mjs`. That leaves zero slack for publication lag. These sites report hourly on the hour, and ECCC publishes the ob roughly 5–6 min later. A fetch running between :00 and :06 therefore sees the previous hour's ob as *just* outside the 60-min look-back (60.5 min old → excluded) while the current one isn't published yet → the station is absent entirely. Confirmed: the 20:00:27 run wrote `count=34` with all three absent; the 20:06:32 run wrote `count=78` with all three present and fresh.
- **Why it's worse than it sounds:** whichever snapshot happens to deploy freezes for the full 15-min deploy cycle, so a blackout fetch can strand the dashboard without those stations for 15 minutes. This is still better than the pre-CR-002 behaviour (20-min window missed them ~75% of the time) but it is visibly broken.
- **Fix direction:** decouple the fetch window from the staleness bound — the look-back should be *larger* than `STALE_MIN` so the newest available ob is always retrieved, and let the `stale` flag (computed from `obs_time`) decide what renders. A station whose newest ob is 70 min old is then fetched, marked stale, and filtered by the frontend, which is the honest result. Suggested `WINDOW_MIN = 120` (2× `STALE_MIN`).
- **Measured cost of the wider window** (full BC bbox, 2026-07-30):

  | window | features | stations | payload | fetch |
  |---|---|---|---|---|
  | 60 min | 1684 | 89 | 12.3 MB | 1.3 s |
  | 120 min | 3407 | 98 | 24.9 MB | 1.9 s |
  | 180 min | 5137 | 99 | 37.5 MB | 2.7 s |

  All well under `limit=10000`. 120 min costs ~+12 MB and ~+0.6 s per run against a job that takes 12–45 s, so it is affordable — but ~25 MB every 15 min is ~2.4 GB/day off a public government API.
- **Worth trying first:** the OGC `&properties=<csv>` parameter to return only the ~14 fields `fetch-wind.mjs` actually reads, which should cut the payload dramatically and make the wider window cheap. **This was never tested** — verify GeoMet supports it, and confirm `geometry.coordinates` and the `*-qa` fields still come back, since `pickWithQa` depends on the latter.

### Resolution (2026-07-31)

Widening the window turned out to be **necessary but not sufficient**, and the second half is the interesting part.

1. **`&properties=` works and is lossless.** 25.0 MB → 1.8 MB and 1.85 s → 0.73 s on the same query. `geometry.coordinates` survives. The `-qa` fields do **not** come back unless named explicitly — they're absent from many features but are valid collection fields, so requesting them is safe. Verified by a differential run against the unfiltered query: 101 stations both ways, **zero** value or QA-flag mismatches. **Gotcha:** one unknown property name makes GeoMet return HTTP 400 for the *entire* query, so any field added here must be checked against the collection schema first.
2. **The window alone didn't fix the symptom.** With `WINDOW_MIN` widened, the hourly stations were fetched — but `STALE_MIN = 60` still hid them. An hourly station's newest ob is *always* 0–66 min old, so a flat 60-min bound classifies it stale for ~6 min of every hour while it is reporting perfectly on schedule. Caught live at 17:00:13Z with Kelp Reefs at age 60.2 min, flagged stale.
3. **Fix: cadence-aware staleness.** A station is now stale when it has *missed a report*, not merely when its reading is old: `stale = age > max(STALE_MIN, cadence + 15)`, where cadence is the median gap between that station's own recent obs (`medianCadenceMin`), carried in a new `cadence_min` field. Hourly sites stay visible to 75 min; a 1-min station that dies is still stale at 60 min, so the SAR-critical bound is untouched where it's meaningful.
4. **`WINDOW_MIN` is 180, not 120.** At 120 an hourly station intermittently had only *one* ob in-window, so cadence came back `null`, fell back to the flat floor, and the station vanished again. 180 always spans three hour boundaries, guaranteeing ≥2 obs. Cheap because of `properties=` (~2 MB, 1.7 s per run).

**Verified:** replayed the pipeline at every minute of the blackout (00–05 past the hour) with realistic publication lag — all three stations shown throughout, where previously all three were absent. Plus a 7-case table covering dead stations at each cadence.

**Known limit:** sites reporting less often than ~90 min still infer `cadence_min: null` and fall back to the `STALE_MIN` floor. None are currently in use near any station; revisit if one is ever added.

> **CR-003 is reserved** — "AIS layer follow-ups", currently living in the `feat/ais-layer`
> stash (`stash@{0}`), not on `main`. It reappears when that work is unstashed. Numbering
> here skips to CR-004 to avoid clobbering it.

## CR-002 — Preserve wind stations missing from a pull

- **Logged:** 2026-07-13
- **Status:** done (2026-07-30)
- **Problem:** Some live wind stations occasionally don't appear on the dashboard. Suspected cause: they aren't included in every upstream pull (source may drop stations intermittently rather than the fetch failing).
- **Diagnosis:** Reported again 2026-07-30 as "no live wind on Oak Bay, forecast only". Two independent causes, both in `scripts/fetch-wind.mjs`:
  1. **Whole-source failure wiped the source.** GeoMet is intermittently flaky — it returns both `fetch failed` and spurious `HTTP 404`s on URLs that work seconds later (reproduced twice while fixing this). The old code only preserved the previous file when *every* source failed, so a SWOB outage with NDBC healthy wrote a valid-looking file containing just the 6 offshore buoys. Nothing within 25 km of Oak Bay survived, so the card fell back to forecast-only. Hit 9 of the last 150 runs (~6%), each blanking live wind for a full 15-min cycle.
  2. **The 20-min look-back window missed hourly reporters.** The marine sites that matter most to Oak Bay — KELP REEFS, DISCOVERY ISLAND, Victoria Harbour — only report hourly, so they landed in roughly 1 run in 4. This is the original CR-002 symptom: stations flickering in and out with no fetch failure at all. Station counts swung 32 ↔ 89 between runs for this reason.
- **Resolution:**
  - Per-source carry-forward: when one source fails, its stations are carried from the previous file with `stale` recomputed from the real `obs_time`. Answers the open questions — carried entries persist only while inside `STALE_MIN` (60 min), then drop, so a prolonged outage decays to nothing instead of freezing an ancient snapshot. Persisted in `wind.json` itself, no separate cache file. The frontend already hard-filters `!stale`, so no UI change was needed to keep carried data honest.
  - `WINDOW_MIN` now tracks `STALE_MIN` (60 min). Nothing inside the window is stale by definition, and the existing newest-per-station reduction keeps it to one ob each. Costs ~300 ms per fetch; station count is now a stable ~89.
  - New `degraded` flag on the payload so a source failure is visible in the committed JSON, not just in ephemeral Actions logs.
  - Added co-located dedupe: the wider window exposed 9 sites publishing under two `msc_id`s at identical coordinates (Victoria Harbour, Tofino, Nanaimo, Abbotsford …), which stacked two markers on the same pixel. Now collapsed to the most complete record.

## CR-001 — Imperial ↔ metric unit toggle

- **Logged:** 2026-07-13
- **Status:** open
- **Problem:** Units are currently fixed (metric-ish — knots for wind, metres/°C, etc.). Users want a global toggle between imperial and metric.
- **Proposal:** Global unit preference persisted in localStorage. Toggle affects:
  - Wind speed (kts ↔ mph — note kts is arguably neither; confirm desired default per mode)
  - Temperature (°C ↔ °F)
  - Distance / height (m ↔ ft) — tide heights, wave heights, visibility
  - Precipitation (mm ↔ in)
- **Open questions:**
  - Where should the toggle live in the UI? (header, settings drawer, per-tile?)
  - Marine convention keeps wind in knots regardless — should "imperial" mean mph or stay knots?
  - Should the toggle apply to forecast tiles as well as live/glance tiles?
