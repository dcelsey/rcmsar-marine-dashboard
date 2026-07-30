# Change Requests

Log of user-requested changes. Newest at top. Status: `open`, `in-progress`, `done`, `parked`.

---

## CR-004 — Hourly marine stations blank out at the top of each hour

- **Logged:** 2026-07-30
- **Status:** open — **diagnosed, fix not applied**
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

> **CR-003 is reserved** — "AIS layer follow-ups", currently living in the `feat/ais-layer`
> stash (`stash@{0}`), not on `main`. It reappears when that work is unstashed. Numbering
> here skips to CR-004 to avoid clobbering it.

## CR-005 — Vercel deploys only ride the wind-bot commits

- **Logged:** 2026-07-30
- **Status:** open — needs Vercel dashboard access (can't be diagnosed from the repo)
- **Problem:** Plain code pushes to `main` do not trigger a Vercel deployment. Across the last 100+ deployments, **every single one** corresponds to a `chore(wind|currents|tides)` bot commit; zero correspond to a code commit. Code changes reach production only by riding the tree of the next bot commit that deploys. Duncan recalls code pushes triggering deploys previously, so something changed.
- **Also established:** Vercel ignores **both** `[skip ci]` and `[skip vercel]` here — `dd76a98` carried `[skip ci] [skip vercel]` and deployed anyway. So commit-message tokens are **not** a usable lever for reducing deploy count. An attempt to use one was reverted.
- **Why it matters:** the wind bot drives ~96 deploys/day against the Hobby tier's **100/day** cap (93–96/day observed all week). Nothing has broken yet, but headroom is thin, and the failure mode is silent — fresh data lands in the repo while the site serves a stale build.
- **Fix direction:** the real fix is decoupling data delivery from the deploy bundle (serve `wind.json` from raw.githubusercontent, a Worker, or R2) so data freshness doesn't need a rebuild at all. A first attempt at the raw.githubusercontent half was reverted in `e0281fd` — not because it was wrong, but because it was unverified in-browser and pointless while the skip token doesn't work. Check the project's **Ignored Build Step / Git integration settings** first; that's the likely explanation for code pushes not deploying, and it changes which approach is right.

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
