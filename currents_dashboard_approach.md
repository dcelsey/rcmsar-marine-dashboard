# Marine Currents on the RCMSAR Dashboard — Implementation Approach & Design Decision

**Audience:** the developer/Claude Code session that will build the production currents layer.
**Status:** validated in a working single-file POC (`currents_poc.html`). This documents what the POC does, the data sources and gotchas, and the one open design decision — **full time-window + slider vs. a point-in-time map** — with a recommendation.

---

## 1. What we're building

A currents layer for the RCMSAR marine dashboard (BC coast, primarily the Salish Sea) that shows predicted tidal currents at official current stations as clean, Navionics-style arrows: each arrow filled, coloured, and sized by current speed, and rotated to the set (direction of flow). It is decision-support for search-and-rescue (drift awareness, transit planning), not a navigation instrument.

The POC proved the full pipeline works end-to-end against live government APIs from the browser.

---

## 2. Data sources (all free / open government)

### 2.1 CHS IWLS API — the station predictions
Base: `https://api-iwls.dfo-mpo.gc.ca/api/v1`

| Purpose | Call |
|---|---|
| Find current stations | `GET /stations?time-series-code=wcp1-events` (also `wcs1-derv`, `wcso`) |
| Full station list | `GET /stations` (each object has `id`, `code`, `officialName`, `latitude`, `longitude`, `timeSeries[]`) |
| Predictions | `GET /stations/{id}/data?time-series-code={code}&from={ISO}&to={ISO}` |
| Station metadata | `GET /stations/{id}/metadata` |

Relevant **time-series codes** (from `/time-series-definitions`):
- `wcp1-events` — **Current-Tables events**: the primary source. Data points carry `qualifier` ∈ `SLACK` / `EXTREMA_FLOOD` / `EXTREMA_EBB`, with `value` = speed (knots) at that event. `allowedPeriodInDays` = **366**.
- `wcs1-derv` / `wcs2-derv` — derived continuous current speed; `wcso` — official current speed. Few stations; short window (~7 days). Pair with `wcd1-derv` / `wcdo` for a true continuous direction.

Data-point fields: `eventDate` (ISO 8601 UTC), `value` (float), `qualifier`, `qcFlagCode` (1 good / 2 not-evaluated / 3 questionable), `uncertainty`, `timeSeriesId`, `reviewed`.

Metadata fields we use: **`floodDirection`, `ebbDirection`** (true compass set for the arrows), `referencePortStationId`.

Rate limits: **3 req/s, 30 req/min** per IP.

**Important scope limit:** the IWLS API exposes only the ~21 Pacific **reference/primary** current stations (Vol. 5: Juan de Fuca-East, Race Passage, Active Pass, Porlier Pass, Gabriola Passage, Dodd Narrows, First/Second Narrows, Sechelt Rapids; Vol. 6 has its own set). The many **secondary** current stations are *not* in the API — they must be derived (see §4).

### 2.2 ECCC GeoMet — optional whole-area model layer
`https://geo.weather.gc.ca/geomet` (WMS 1.3.0). CIOPS-SalishSea (500 m) / CIOPS-West models provide a continuous current-**speed** raster for context between stations. Discover layers via `GetCapabilities`; render the `...SeaWaterSpeed...` layer as a translucent overlay. This is additive context, not the station data.

### 2.3 Secondary-station corrections — Canadian Tide & Current Tables (PDF)
CHS Vol. 5 (2026/01) **Table 4** ("Reference and Secondary Current Stations"). Not machine-readable / not in any API — transcribed by hand from the PDF (see §4). Each volume of the tables has its own Table 4; to cover the whole BC coast, encode Vol. 6 as well.

---

## 3. Rendering model

- **Speed → colour & size.** Six-stop ramp in knots (calm-blue < 0.5, green 0.5–1.5, yellow 1.5–2.5, orange 2.5–3.5, red-orange 3.5–5, red 5+). Arrow length scales with speed (clamped 20–52 px).
- **Direction → rotation.** True set from station metadata (`floodDirection`/`ebbDirection`) or the continuous direction series. Where only flood/ebb phase is known, ebb ≈ flood + 180°.
- **Speed at an arbitrary time** is interpolated from the `wcp1-events` sequence with a cosine ease between `SLACK` (0) and the adjacent `EXTREMA_*` magnitude, so the arrow grows/shrinks smoothly through the tide.
- **Station classes on the map:** solid arrow = reference/continuous station; dotted-ring "~" arrow = derived secondary; small hollow marker = slack.

---

## 4. Secondary-station derivation (the engine)

For each secondary station, take its **reference** station's `wcp1-events` series and transform it:
1. **Time:** shift each event by the published difference — turn-to-flood, max-flood, turn-to-ebb, max-ebb (minutes). Slack events are classified by the phase of the next extremum.
2. **Speed:** scale each extremum by the published **% of reference rate** (flood%, ebb%), or use an absolute knot value where the tables give one.
3. **Direction:** use the secondary's own flood direction from the tables; ebb = flood + 180°.
4. **Conditionals:** e.g. Haro Strait (Hamley Pt.) — if the preceding flood at Race Passage was < 2.0 kt, add 1 h 10 min to the turn-to-ebb.

### Table 4 as encoded (Vol. 5, 2026/01)
Time diffs in minutes; speed = % of reference rate unless absolute noted; `floodDir` ° true.

| Secondary | Ref | lat | lon | floodDir | tf | mf | te | me | flood% | ebb% | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| River Jordan | Juan de Fuca-East | 48.317 | -124.083 | 110 | -50 | -30 | -15 | -25 | 70 | 70 | |
| Baynes Channel | Race Passage | 48.433 | -123.267 | 40 | -15 | -15 | -15 | -15 | 75 | 75 | |
| Haro Strait (Hamley Pt.) | Race Passage | 48.583 | -123.233 | 350 | 85 | 95 | 150 | 100 | 45 | 45 | +70 min to te if preceding flood < 2.0 kt |
| Sidney Channel | Race Passage | 48.617 | -123.333 | 330 | 60 | 90 | 90 | 40 | 35 | 30 | |
| Swanson Channel | Race Passage | 48.783 | -123.333 | 330 | 100 | 85 | 85 | 95 | 25 | 20 | |
| Boundary Passage | Race Passage | 48.750 | -123.083 | 70 | 60 | 70 | 60 | 70 | 50 | 40 | |
| Trincomali Channel | Race Passage | 48.883 | -123.450 | 320 | 35 | 50 | 50 | 45 | 15 | 15 | |
| Georgeson Passage | Active Pass | 48.833 | -123.233 | 315 | -15 | -40 | -45 | -30 | 50 | 55 | |
| Boat Passage | Active Pass | 48.817 | -123.183 | 55 | -15 | -40 | -45 | -30 | 100 | 100 | |
| Sansum Narrows | Active Pass | 48.783 | -123.550 | 0 | 25 | 25 | -35 | -35 | — | — | absolute 3.0 kt flood & ebb |
| False Narrows | Dodd Narrows | 49.133 | -123.783 | 295 | 10 | 25 | 25 | 25 | 50 | 55 | |
| Tzoonie Narrows | Sechelt Rapids | 49.717 | -123.767 | 50 | 10 | 10 | 10 | 10 | 20 | 20 | |

Excluded: **Malibu Rapids** (Princess Louisa Inlet) — referenced to Point Atkinson HW/LW, not a current reference; needs a tide-based derivation. Add if wanted.

---

## 5. THE DECISION: full time-window + slider, or a point-in-time map?

Both are cheap on data (either way we fetch the full event series per station in one call). The difference is UX framing, clutter, and fit to the SAR job.

### Option A — Point-in-time map ("now")
One snapshot: the current at this moment (or a single chosen time).

- **Pros:** simplest to read at a glance; answers the primary SAR question ("what's the current *right now* where my crew is?"); least clutter; no "which time am I looking at?" ambiguity; trivially embeddable as a small dashboard tile.
- **Cons:** no look-ahead for transit/drift planning; can't see when a pass turns; at any single instant some stations sit at slack and show no arrow, so the map can look sparse (see §6).

### Option B — Full window + slider (what the POC does)
A scrubbable day (extendable to a week+), with play/animate.

- **Pros:** supports planning — see the current now *and* in 1/3/6 hours; watch passes build, peak, turn; strong for briefing and transit timing; the data supports it for free.
- **Cons:** more UI; a time control to learn; "current time shown ≠ now" ambiguity unless clearly labelled; animation is a nice-to-have, not core to a live picture.

### Recommendation — **hybrid, defaulting to "now"**
Make the **point-in-time "now" view the primary/default** (it's the core SAR question and the cleanest read), and keep the **time slider as an optional, collapsible look-ahead** rather than the main frame:

- Land on **now** by default, with a prominent, always-visible timestamp and a one-tap **"Now"** button.
- Offer a compact scrubber (next ~24–48 h, `wcp1-events` supports far more) for planning, collapsed by default so the resting state is a clean snapshot.
- This gives the at-a-glance clarity of Option A with Option B's planning value on demand, at no extra data cost.

Note on first-load population: because currents are time-varying, a pure "now" snapshot will show some stations at slack (no arrow). The POC works around this by opening at the **strongest-flow time** so the map looks populated; for production, prefer defaulting to **now** (honest) and accept that some stations are legitimately slack, or surface a small "next max: HH:MM, X kt" readout per station so slack stations still convey information.

**If forced to pick one:** ship the point-in-time "now" map first (smallest, clearest, covers the primary need); add the slider as a fast follow.

---

## 6. Implementation notes & gotchas (learned in the POC)

- **Time format:** GeoMet WMS `TIME` and IWLS matching want seconds precision with no milliseconds — `2026-07-13T06:00:00Z`, never `...:00.000Z`. Strip the `.000`.
- **Fetch a wider data window than you display.** Secondary stations are time-shifted by up to ~±4 h; if you only fetch the visible window, shifted stations (e.g. Haro Strait, +85 to +150 min) fall outside coverage at the current instant and vanish. Fetch e.g. now-8 h … now+32 h, display now-2 h … now+24 h.
- **Slack physics:** at any instant some stations are turning and have no meaningful arrow. This is real, not a bug — design for it (small slack marker and/or a "next max" readout).
- **Ebb direction** is approximated as flood + 180° (Table 4 publishes flood only). Fine for reversing tidal streams; note it.
- **Throttle** station requests to respect 3 req/s; cache each reference station's events (many secondaries derive from one reference — fetch it once).
- **CORS / production architecture:** the browser could reach IWLS and GeoMet directly in testing, but for production build a **thin server-side proxy/service** that (a) fetches + caches reference events and metadata, (b) holds the Table 4 corrections (all volumes), (c) computes secondary predictions, and (d) serves the dashboard a single clean JSON payload. This removes CORS risk, respects rate limits, allows precompute/caching, and keeps the correction tables server-side and versioned by table edition.
- **Coverage:** Vol. 5 = Juan de Fuca & Strait of Georgia. For the full RCMSAR footprint also encode Vol. 6 (Discovery Passage & west coast of Vancouver Island) Table 4, and consider the CIOPS model raster for open water beyond the station network.
- **Provenance:** cite the Table edition (e.g. "CHS Vol. 5, 2026/01") in the UI, and re-verify corrections when a new annual edition publishes.

---

## 7. Suggested build order

1. Point-in-time "now" map: IWLS reference stations (`wcp1-events`) + metadata directions → arrows. (Smallest useful thing.)
2. Secondary derivation from Table 4 (Vol. 5), server-side. 
3. Optional time slider + "Now" button (look-ahead).
4. Vol. 6 corrections; optional CIOPS model raster toggle; Malibu Rapids tide-based derivation.
