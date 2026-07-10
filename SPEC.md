# RCMSAR 33 (Oak Bay) — Local Conditions Dashboard · Build Spec

**Purpose:** an at-a-glance marine conditions dashboard for RCMSAR Unit 33, Oak Bay. Snapshot of *now* plus today-hourly and 7-day forecast, covering wind, weather, sea state, visibility, tide, and sun/twilight for the operating area (~10 nm around Oak Bay).

**Design principles (from project brief):**
- At-a-glance readability first; **information layering** — summary tiles up top, detail on scroll/click.
- **Actual data only** — display observed/forecast values and official forecast text; no derived "safe/unsafe" judgements.
- Works on **desktop and mobile**.
- **Lightweight & serverless** — everything pulled and processed in the browser; deployable as a static file (GitHub Pages).

This repo already contains a **working single-file prototype (`index.html`)** that implements the core of this spec. This document is the reference for extending/hardening it in VS Code / Claude Code.

---

## 1. Data source analysis

The brief's original sources (windisgood, Windy, Weather Network, tides.gc.ca pages, weather.gc.ca marine pages) are **HTML pages that block cross-origin fetches (CORS)** — a browser-only app cannot parse them directly. The strategy below keeps the *serverless* constraint by substituting equivalent machine-readable APIs, and retains the original sites as embeds/deep-links.

| Data | Source | Endpoint (verified) | CORS | Key | Fields used | Refresh |
|---|---|---|---|---|---|---|
| Wind, temp, humidity, pressure, weather-code, visibility, hourly + 7-day | **Open-Meteo Forecast** | `https://api.open-meteo.com/v1/forecast` | ✅ Yes | None | `current`, `hourly`, `daily` (see §3) | 10 min |
| Wind at all 10 nm points (one call) | **Open-Meteo Forecast (multi-point)** | same, comma-separated `latitude`/`longitude` | ✅ Yes | None | `current.wind_*` | 10 min |
| Waves / sea state (numeric) | **Open-Meteo Marine** | `https://marine-api.open-meteo.com/v1/marine` | ✅ Yes | None | `wave_height`, `wave_period`, `wave_direction`, `swell_wave_height` | 10 min |
| Tide predictions (high/low + curve) | **DFO IWLS** | `https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/{id}/data` | ✅ Yes* | None | `wlp-hilo`, `wlp` | 30–60 min (predictions are static) |
| Sunrise/sunset, civil & nautical twilight, moon | **SunCalc** (client-side JS) | cdnjs / bundled | n/a | None | computed | per load |
| Official sea-state narrative + gale/storm **warnings** | **Environment Canada marine** | `weather.gc.ca/marine/forecast_e.html?siteID=…` | ❌ No | None | text bulletin | link/iframe or proxy |
| Wind map (deep-dive) | **Windy embed** | `embed.windy.com/embed2.html` | n/a (iframe) | None | interactive map | live |

\* IWLS is documented and widely used from browsers; **confirm the `Access-Control-Allow-Origin` header from your deploy origin during build** (see §7 test checklist). If it ever fails, route it through the same tiny proxy proposed for ECCC.

### Verified facts (checked during this analysis, 2026-07-10)
- IWLS station **code `07130` = "Oak Bay"**, internal `id = 5cebf1df3d0f4a073c4bbd22`, lat `48.4237`, lon `-123.3027`. Available series: `wlp` (continuous, 1-minute resolution) and `wlp-hilo` (high/low events). Returns clean JSON `[{eventDate, value}]`, `value` in metres (chart datum), `eventDate` in UTC.
- ECCC marine zones bracketing Oak Bay: **`siteID=06100` = Haro Strait**, **`siteID=07003` = Juan de Fuca Strait – east entrance**. These carry the official warnings and plain-language seas.
- Open-Meteo marine (wave model) **may return `null` for points very close to shore / inside enclosed straits.** Handle nulls gracefully and treat the **ECCC bulletin as the authority for sea state**; show Open-Meteo waves as a supplementary numeric where available.

### The one place a (tiny) backend helps
Only ECCC marine bulletins are not machine-readable cross-origin. Options, cheapest first:
1. **Link out / iframe** (prototype default) — zero infra. `weather.gc.ca` may send `X-Frame-Options`, so prefer clean deep-links over iframes for these.
2. **~30-line Cloudflare Worker / Netlify Function proxy** that fetches the bulletin and returns `{text, issued, warnings}` with `Access-Control-Allow-Origin: *`. This lets you surface the official seas + warnings **inline in the at-a-glance strip**. Still effectively serverless (free tier, no server to run). See §6.
3. ECCC also publishes marine bulletins on the **Datamart** (`dd.weather.gc.ca`) as raw text — the proxy can read those instead of scraping HTML.

---

## 2. Location model (≈10 nm around Oak Bay)

All in `CONFIG.points` (approximate — tune to taste; Open-Meteo grid resolution makes sub-km precision irrelevant for weather, but marker placement benefits from accuracy).

| Point | Lat | Lon | Role |
|---|---|---|---|
| **Oak Bay** (Turkey Head / tide stn) | 48.4240 | -123.3010 | Dashboard centre; tide station 07130 |
| Willows Beach | 48.4326 | -123.2958 | launch/beach |
| Cattle Point | 48.4383 | -123.2920 | launch |
| Discovery Island (Sea Bird Pt) | 48.4247 | -123.2261 | hazard/waypoint |
| Kelp Reef | 48.4573 | -123.2385 | hazard (Haro Strait) |
| Gonzales Point | 48.4123 | -123.2905 | waypoint |
| Harling Point | 48.4098 | -123.2947 | waypoint |
| Trial Island | 48.3939 | -123.3053 | hazard/light |
| Victoria Harbour | 48.4235 | -123.3880 | waypoint |
| Dallas Road (Clover Pt) | 48.4085 | -123.3520 | exposure/waypoint |
| *Haro Strait (offshore sample)* | 48.44 | -123.24 | wave-model point |
| *Juan de Fuca E (offshore sample)* | 48.38 | -123.31 | optional 2nd wave point |

---

## 3. API request reference (copy-paste ready)

**Center weather (current + hourly + 7-day):**
```
https://api.open-meteo.com/v1/forecast
  ?latitude=48.424&longitude=-123.301
  &current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,
           wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl
  &hourly=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,
          visibility,precipitation_probability
  &daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,
         wind_gusts_10m_max,wind_direction_10m_dominant,precipitation_probability_max,
         sunrise,sunset
  &wind_speed_unit=kn&timezone=America/Vancouver&forecast_days=7
```

**Multi-point wind (one call for the whole table):** same host; pass comma-separated coords —
`latitude=48.4326,48.4383,…&longitude=-123.2958,-123.2920,…&current=wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=kn&timezone=America/Vancouver`.
Response is a **JSON array**, one object per point (index-aligned to input order).

**Marine waves:**
```
https://marine-api.open-meteo.com/v1/marine
  ?latitude=48.44&longitude=-123.24
  &current=wave_height,wave_direction,wave_period,swell_wave_height,wind_wave_height
  &daily=wave_height_max,wave_direction_dominant,wave_period_max
  &timezone=America/Vancouver&forecast_days=7
```

**Tides — high/low and continuous curve** (window: ~-6 h to +42 h from now, ISO-8601 UTC):
```
https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/5cebf1df3d0f4a073c4bbd22/data?time-series-code=wlp-hilo&from={ISO}&to={ISO}
https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/5cebf1df3d0f4a073c4bbd22/data?time-series-code=wlp&from={ISO}&to={ISO}
```
Both return `[{ "eventDate": "…Z", "value": <metres> }]`. Convert `eventDate` to `America/Vancouver` for display. Derive rising/falling by comparing the next hi/lo to the previous. High vs low: label from the sequence (alternating) rather than a fixed threshold.

**Sun/twilight/moon:** `SunCalc.getTimes(new Date(), lat, lon)` → `sunrise, sunset, dawn, dusk, nauticalDawn, nauticalDusk, solarNoon`; `SunCalc.getMoonIllumination(new Date())` → `fraction, phase`. No network.

---

## 4. UI / layout

Single column, max-width ~1180 px, dark theme (night-readable for ops). Order = information layering:

1. **Sticky header** — unit label, "Updated HH:MM", manual Refresh.
2. **Warnings bar** (conditional) — surfaces active alerts. In the prototype this triggers on high local gusts; with the ECCC proxy (§6) it should show the official gale/storm warning verbatim.
3. **At-a-glance tiles (×5)** — Wind (speed/gust/dir with rotating arrow), Sea state (wave ht/period or "see ECCC"), Weather (icon/temp/feels/pressure), Tide (rising/falling + next hi/lo + time), Sun (day/night + next sunrise or sunset). These answer "what's it doing right now" in one screen.
4. **Wind by location** — table across all 10 nm points; colour chip by band (calm <15, building 15–21, strong ≥22 kn) — bands are visual grouping of the *number*, not advice.
5. **Tide** — SVG sparkline of the `wlp` curve with a "now" marker + next-tides table. **Sun & twilight** — full first-light/last-light table + moon phase (side-by-side; stacks on mobile).
6. **Today hourly** — horizontal scroll strip (icon, wind, gust, dir, temp, visibility).
7. **7-day** — daily rows (icon, min–max, rain %, max wind/gust/dir) + **marine waves** 7-day table.
8. **Official ECCC marine forecast** — the authoritative panel (links now; inline text with proxy).
9. **Windy embed** — live wind map centred on Oak Bay.
10. **Deep-dive links** — windisgood (island map, Willows, Dallas Rd), Windy full, Weather Network, DFO tides.

**Responsive:** tiles 5-up → 2-up under 900 px; two-column sections collapse to one; hourly strip scrolls horizontally on touch.

---

## 5. Architecture & files

The prototype is intentionally single-file (best for static hosting + zero build). For maintainability in VS Code, the recommended split is:

```
/
├── index.html          # markup + <link>/<script> refs
├── css/styles.css      # extracted styles (CSS custom properties already used)
├── js/
│   ├── config.js       # CONFIG: center, tideStationId, points[], marinePoint, refreshMs, tz
│   ├── sources.js      # loadWeather / loadWindByLocation / loadMarine / loadTides  (fetch + shape)
│   ├── render.js       # renderGlance / renderWindTable / renderTide / renderSun / renderHourly / renderDaily
│   ├── util.js         # fmtTime, fmtDay, compass, wmo code map, getJSON
│   └── app.js          # refresh() orchestration, timers, event wiring
├── vendor/suncalc.min.js   # bundle rather than CDN for offline/repeatability
└── README.md
```
Keep it dependency-light: no framework needed. If you later want reactivity, a single small lib (e.g. Preact/htm via ESM) is enough — but vanilla is fine and fastest to load on a phone with poor signal.

**Data flow:** `app.refresh()` → `Promise.allSettled([...loaders])` → each loader returns shaped data → renderers paint. `allSettled` means one dead source never blanks the whole board.

---

## 6. Robustness (build these in)

- **Per-source failure isolation** — `Promise.allSettled`; render whatever succeeded; log the rest. (Prototype does this.)
- **Staleness** — keep `lastGood` timestamp; on failure show "showing data from HH:MM" rather than blanking. Consider dimming a panel whose data is older than N minutes.
- **Null handling** — Open-Meteo marine nulls, missing hourly visibility, empty tide windows all render as "—", never crash.
- **Timezone** — request Open-Meteo with `timezone=America/Vancouver`; convert IWLS UTC with `toLocaleString(..., {timeZone})`. Never rely on the viewer's local zone.
- **Refresh triggers** — interval (10 min) + manual button + `visibilitychange` (re-fetch when crew reopens the tab). Predictions (tide/sun) need far less frequency than live wind, but a unified refresh is simpler.
- **Offline / no-signal** — cache last successful payloads in memory (already), optionally a **Service Worker** to serve the shell + last data when signal drops (valuable for a vessel). Note the project rule against browser storage applies to *artifacts*; for your own hosted app a Service Worker cache is fine and recommended.
- **Rate limits** — Open-Meteo free tier is generous; a 10-min refresh with ~3 calls is well within limits. No key required.

**ECCC proxy sketch (optional, Cloudflare Worker):**
```js
export default {
  async fetch(req) {
    const zones = { haro:'06100', jdf:'07003' };
    const id = new URL(req.url).searchParams.get('zone') || 'haro';
    const r = await fetch(`https://weather.gc.ca/marine/forecast_e.html?mapID=02&siteID=${zones[id]}`);
    const html = await r.text();
    // parse the forecast <div> + any 'warning in effect' banner → {issued, warnings[], text}
    return new Response(JSON.stringify(extract(html)), {
      headers: { 'content-type':'application/json', 'access-control-allow-origin':'*',
                 'cache-control':'max-age=900' }
    });
  }
}
```
Deploy free on Cloudflare Workers; the dashboard then fetches `https://your-worker.dev/?zone=haro` and shows official seas + warnings inline.

---

## 7. Build / verification checklist (for Claude Code)

- [ ] Split single file into the §5 structure; bundle SunCalc into `vendor/`.
- [ ] Confirm **IWLS CORS** from the GitHub Pages origin (DevTools → Network → the two `api-iwls` calls should be 200 with `access-control-allow-origin`). If blocked, add it to the proxy.
- [ ] Confirm Open-Meteo **multi-point** response is an array and index-aligns to `CONFIG.points`.
- [ ] Verify marine call at the offshore point returns non-null `wave_height`; if null, move the sample point further into Haro Strait / Juan de Fuca or accept "see ECCC".
- [ ] Tune all `CONFIG.points` coordinates against a chart.
- [ ] Mobile pass: iPhone SE width — tiles 2-up, tables don't overflow, hourly scrolls.
- [ ] Add the ECCC proxy (optional) and wire the warnings bar to real bulletins.
- [ ] (Optional) Service Worker for offline shell + last-good data.
- [ ] Lighthouse/perf: single file loads <1 s on 3G; no layout shift after data paints.

---

## 8. Deployment (GitHub Pages)

1. Create repo `rcmsar33-oak-bay-conditions` (public or private w/ Pages).
2. Commit `index.html` (+ split assets) to `main`.
3. Settings → Pages → Source: `main` / root. Live at `https://<user>.github.io/rcmsar33-oak-bay-conditions/`.
4. No build step, no secrets, no server. (If you add a Cloudflare Worker for ECCC, that's a separate free deploy; the Pages site just fetches it.)

---

## 9. Explicit scope / honesty notes

- The board shows **values and official forecasts only**. Wind colour bands are visual grouping of the number, not a go/no-go call. Crews confirm against the **official ECCC marine forecast** before tasking — that panel is deliberately prominent.
- Open-Meteo is a **model** (blended global/regional); it is not a substitute for the ECCC marine bulletin, which is the tasking authority for warnings and seas. windisgood/Windy remain the local-knowledge deep-dives.
- Tide figures are **astronomical predictions** (no storm-surge / meteorological residual); station 07130 is a prediction station.
```
