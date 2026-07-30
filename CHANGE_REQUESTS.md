# Change Requests

Log of user-requested changes. Newest at top. Status: `open`, `in-progress`, `done`, `parked`.

---

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
