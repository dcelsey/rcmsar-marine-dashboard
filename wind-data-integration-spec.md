# Live Coastal Wind Data — Integration Spec (RCMSAR Weather Dashboard, Astro)

**Purpose:** Add live, *observed* (not forecast) wind speed/direction/gust for BC-coast weather
stations to the existing Astro dashboard. The pipeline fetches from open government APIs and
writes a single normalized `wind.json` file that the dashboard reads.

**Audience:** the developer/AI agent implementing this inside the existing Astro project (which
already contains the RCMSAR station list + coordinates).

**No scraping required.** Everything below is a documented REST/GeoJSON API or a plain text-file
download.

---

## 1. Data sources

### 1a. PRIMARY — Environment Canada MSC GeoMet, `swob-realtime` (land + coastal stations)

Surface Weather Observations from automatic and manual stations. This is an **OGC API – Features**
service returning **GeoJSON**. No API key, free, open.

- Base: `https://api.weather.gc.ca`
- Collection: `swob-realtime`
- Items endpoint: `https://api.weather.gc.ca/collections/swob-realtime/items`
- Docs: https://api.weather.gc.ca/openapi  •  https://eccc-msc.github.io/open-data/msc-geomet/ogc_api_en/

This covers the great majority of near-coastal reporting stations (coastal airports, automatic
stations, and many lightstations/partner stations). Wind is reported in **km/h**, direction in
**degrees true**.

> Note: the collection `swob-marine-stations` is **metadata only** (station definitions), not
> observations — don't use it for live wind. Use `swob-realtime` for observations, and optionally
> `swob-stations` / `swob-marine-stations` to enrich station names/types.

### 1b. SECONDARY — NOAA NDBC realtime buoy files (offshore/inshore moored buoys)

The moored weather buoys in BC waters (owned by ECCC/DFO) are published as plain text files by
NDBC. Use these to fill open-water gaps the land stations can't cover. Wind is in **m/s**.

- Per-station realtime file: `https://www.ndbc.noaa.gov/data/realtime2/<ID>.txt`
  (e.g. https://www.ndbc.noaa.gov/data/realtime2/46146.txt for Halibut Bank)

Confirmed BC-coast buoy IDs (source: DFO Pacific weather buoys):

| Buoy name | ID | Rough area |
|---|---|---|
| Halibut Bank | 46146 | Strait of Georgia (S) |
| Sentry Shoal | 46131 | Strait of Georgia (N) |
| Nanakwa Shoal | 46181 | Kitimat Arm |
| South Brooks | 46132 | NW Vancouver Island |
| South Moresby | 46147 | S Haida Gwaii |
| West Sea Otter | 46204 | Central Coast |
| La Perouse Bank | 46206 | SW Vancouver Island |
| Central Dixon Entrance | 46145 | Dixon Entrance |
| North Hecate Strait | 46183 | Hecate Strait |
| South Hecate Strait | 46185 | Hecate Strait |
| West Dixon Entrance | 46205 | Dixon Entrance |
| East Dellwood Knolls | 46207 | N Coast offshore |
| West Moresby | 46208 | W Haida Gwaii |
| Middle NOMAD | 46004 | Offshore |
| South NOMAD | 46036 | Offshore |
| North NOMAD | 46184 | Offshore |

(The offshore NOMAD/Dixon/Hecate buoys are far from shore — include only the ones relevant to your
stations' areas of responsibility; Halibut Bank, Sentry Shoal, La Perouse, South Brooks, West Sea
Otter, Nanakwa Shoal are the near-coastal ones most useful for SAR.)

### Attribution / licensing

Both sources are open. Include an attribution line in the dashboard footer/credits:
"Weather observations © Environment and Climate Change Canada (MSC GeoMet, Canada Open Government
Licence) and NOAA National Data Buoy Center." Be a good citizen: **cache and refresh on a schedule
(every 10–15 min is plenty)** — do not fetch on every page load or hammer the endpoints.

---

## 2. Querying `swob-realtime` (the important details)

`swob-realtime` emits observations roughly **every minute per station**, so a naive query returns
huge numbers of near-duplicate records. Query a recent time window, then reduce to the latest
record per station in code.

**Recommended query pattern:**

```
GET https://api.weather.gc.ca/collections/swob-realtime/items
      ?bbox=<minLon>,<minLat>,<maxLon>,<maxLat>
      &datetime=<ISO start>/..           # open-ended interval: "last 20 minutes onward"
      &sortby=-obs_date_tm               # newest first (verified working)
      &limit=10000
      &f=json
```

- **bbox** covers the whole BC coast. A single wide box works (extra inland stations are harmless —
  they'll simply never be the "nearest" to a coastal SAR station). Suggested coastal box:
  `bbox=-133.5,48.0,-122.0,55.0`. Tighten or split into sub-boxes if you want a smaller payload.
- **datetime** — pass an open interval `"{now - 20min}/.."` (ISO 8601, UTC, e.g.
  `2026-07-13T03:00:00Z/..`). This keeps the result to only recently-reporting stations.
- **sortby=-obs_date_tm** — newest first (confirmed against the live API).
- **paginate** if needed via `offset` (or follow the `rel:"next"` link in the response); with the
  20-minute window the result set is small.
- Optionally use **`properties=`** to select only the fields you need and shrink the payload.

**Deduplicate:** group returned features by `properties["msc_id-value"]` and keep the one with the
newest `properties["obs_date_tm"]`. That yields one current observation per station.

### Field mapping (source key → meaning)

All value fields are strings/numbers under `feature.properties`, each with a sibling `-uom` (unit)
and `-qa`/`-data_flag` (quality) key.

| Concept | Source property key | Unit (`-uom`) |
|---|---|---|
| Station name | `stn_nam-value` | — |
| Station id (use as key) | `msc_id-value` | — |
| Transport Canada id | `tc_id-value` | — |
| WMO id | `wmo_synop_id-value` | — |
| Data provider | `data_pvdr-value` | — |
| Observation time (UTC) | `obs_date_tm` | ISO 8601 Z |
| **Wind speed (10-min mean)** | `avg_wnd_spd_10m_pst10mts` | `km/h` |
| **Wind direction (10-min mean)** | `avg_wnd_dir_10m_pst10mts` | `°` true |
| **Gust (10-min max)** | `max_wnd_spd_10m_pst10mts` | `km/h` |
| Wind speed (1-min mean) | `avg_wnd_spd_10m_pst1mt` | `km/h` |
| Wind dir (1-min mean) | `avg_wnd_dir_10m_pst1mt` | `°` true |
| Gust (1-hr max) | `max_wnd_spd_10m_pst1hr` | `km/h` |
| Latitude / Longitude / Elevation | `feature.geometry.coordinates` = `[lon, lat, elev_m]` | — |

**Field fallback chain** (not every station reports every averaging window — pick the first that is
present and non-null):

- speed: `avg_wnd_spd_10m_pst10mts` → `avg_wnd_spd_10m_pst2mts` → `avg_wnd_spd_10m_pst1mt` → `avg_wnd_spd_10m_pst1hr`
- direction: `avg_wnd_dir_10m_pst10mts` → `avg_wnd_dir_10m_pst2mts` → `avg_wnd_dir_10m_pst1mt` → `avg_wnd_dir_10m_pst1hr`
- gust: `max_wnd_spd_10m_pst10mts` → `max_wnd_spd_10m_pst1mt` → `max_wnd_spd_10m_pst1hr`

Optionally drop values whose `-qa` / `-data_flag` sibling indicates a failed quality check.

---

## 3. Parsing NDBC buoy files

`https://www.ndbc.noaa.gov/data/realtime2/<ID>.txt` is fixed-width text. First two lines are
headers; the **first data row is the most recent observation**. Missing values are `MM`.

```
#YY  MM DD hh mm WDIR WSPD GST  WVHT ... (units line) ... degT m/s  m/s ...
2026 07 13 03 50  290  6.2 8.1   1.2 ...
```

Map: `WDIR` = direction °true, `WSPD` = wind speed **m/s**, `GST` = gust **m/s**. Timestamp is the
`YY MM DD hh mm` columns in **UTC**. Buoy lat/lon are fixed per station (hardcode from the table in
§1b or read the station page once).

---

## 4. Unit conversions

SAR crews generally read wind in **knots**; also keep km/h. Store both, let the UI choose.

```
km/h → knots :  kmh * 0.539957
m/s  → knots :  ms  * 1.943844
m/s  → km/h  :  ms  * 3.6
```

---

## 5. Recommended `wind.json` schema

Output shape is left to the implementer, but this normalized shape works well and is source-agnostic
(SWOB stations and NDBC buoys land in the same array):

```json
{
  "generated_at": "2026-07-13T04:05:00Z",
  "sources": ["msc-geomet-swob-realtime", "noaa-ndbc"],
  "station_count": 42,
  "stations": [
    {
      "id": "swob:1108447",
      "source": "swob",
      "name": "SHERINGHAM POINT",
      "lat": 48.377,
      "lon": -123.921,
      "elevation_m": 12.0,
      "obs_time": "2026-07-13T03:54:00Z",
      "wind_dir_deg": 240,
      "wind_speed_kmh": 28,
      "wind_gust_kmh": 41,
      "wind_speed_kn": 15.1,
      "wind_gust_kn": 22.1,
      "stale": false,
      "quality": "ok"
    },
    {
      "id": "ndbc:46146",
      "source": "ndbc",
      "name": "Halibut Bank",
      "lat": 49.34,
      "lon": -123.73,
      "elevation_m": 0,
      "obs_time": "2026-07-13T03:50:00Z",
      "wind_dir_deg": 290,
      "wind_speed_kmh": 22,
      "wind_gust_kmh": 29,
      "wind_speed_kn": 12.1,
      "wind_gust_kn": 15.7,
      "stale": false,
      "quality": "ok"
    }
  ]
}
```

- `id`: namespace the source (`swob:<msc_id>` / `ndbc:<buoyID>`) so keys never collide.
- `stale`: set `true` when `now - obs_time` exceeds a threshold (suggest **60 min**) so the UI can
  grey it out — a dead sensor is worse than no sensor for SAR.
- `quality`: `"ok"` / `"suspect"` from the SWOB `-qa` flags if you choose to surface it.

---

## 6. Astro integration

The requirement is "write to a JSON file the dashboard reads," so the primary pattern is a
**scheduled fetch script that writes `wind.json`**, with an optional server-endpoint alternative.

### Option A — scheduled fetch script (recommended, matches the file-based requirement)

1. Add `scripts/fetch-wind.mjs` (reference implementation in §7).
2. Write output to `public/data/wind.json` (served as a static asset) **or** `src/data/wind.json`
   if you'd rather import it at build time.
3. Run it on a schedule — pick whatever fits your hosting:
   - **GitHub Action** on a `cron` (e.g. every 15 min) that runs the script and commits/deploys the
     updated JSON, or writes it to your host's storage.
   - **Serverless cron** (Netlify Scheduled Function / Vercel Cron / Cloudflare Worker Cron) that
     regenerates the file/KV value on a timer.
   - **A plain cron/systemd timer** on the box if you self-host.
4. The dashboard reads it — client-side `fetch('/data/wind.json')` on an interval, or a static
   import if you rebuild each cycle. Write the file **atomically** (write to a temp file then rename)
   so the dashboard never reads a half-written file.

### Option B — Astro server endpoint (if you run SSR / an adapter)

Add `src/pages/api/wind.json.ts` that fetches + normalizes server-side with an in-memory TTL cache
(e.g. 10 min), returning the normalized JSON. This avoids browser CORS concerns and keeps the ECCC
call server-side. Requires an SSR-capable output (`output: 'server'` / a Node/serverless adapter).

> **CORS:** don't assume the browser can call `api.weather.gc.ca` directly. Do the fetch
> server-side (Option A script or Option B endpoint), not from client JS.

### Mapping observations to RCMSAR stations

The project already has the SAR station list + coordinates. To attach live wind to each SAR station:

- Compute the **nearest observation station** to each SAR station via the haversine distance
  (great-circle) between coordinates.
- Apply a **max-distance threshold** (suggest ~25–40 km; tune per how sparse coverage is) and a
  **staleness threshold** (60 min). If the nearest station is beyond the threshold or stale, fall
  back to the next-nearest, and finally show "no current data."
- You can either (a) keep `wind.json` as a flat station list and do the nearest-station match in the
  dashboard, or (b) precompute `sar_station_id → nearest obs station(s)` in the fetch script and
  include it in the JSON. Either is fine; (a) keeps the data file reusable.

---

## 7. Reference fetch script (Node, adapt as needed)

```js
// scripts/fetch-wind.mjs  — run on a schedule; writes public/data/wind.json
import { writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const OUT = 'public/data/wind.json';
const BBOX = '-133.5,48.0,-122.0,55.0';           // BC coast
const WINDOW_MIN = 20;                              // look-back window
const STALE_MIN = 60;
const KMH_PER_KN = 0.539957, MS_TO_KN = 1.943844, MS_TO_KMH = 3.6;

const NDBC_BUOYS = [
  { id: '46146', name: 'Halibut Bank',   lat: 49.34, lon: -123.73 },
  { id: '46131', name: 'Sentry Shoal',   lat: 49.91, lon: -125.00 },
  { id: '46206', name: 'La Perouse Bank', lat: 48.84, lon: -125.99 },
  { id: '46132', name: 'South Brooks',   lat: 49.74, lon: -127.93 },
  { id: '46204', name: 'West Sea Otter', lat: 51.38, lon: -128.77 },
  { id: '46181', name: 'Nanakwa Shoal',  lat: 53.82, lon: -128.83 },
  // add more from the DFO buoy list as needed
];

const pick = (props, keys) => {
  for (const k of keys) {
    const v = props[k];
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
};

async function fetchSwob() {
  const start = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const url = `https://api.weather.gc.ca/collections/swob-realtime/items`
    + `?bbox=${BBOX}&datetime=${encodeURIComponent(start)}/..`
    + `&sortby=-obs_date_tm&limit=10000&f=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SWOB ${res.status}`);
  const { features = [] } = await res.json();

  // reduce to latest per station
  const latest = new Map();
  for (const f of features) {
    const p = f.properties || {};
    const key = p['msc_id-value'];
    if (!key) continue;
    const prev = latest.get(key);
    if (!prev || new Date(p.obs_date_tm) > new Date(prev.properties.obs_date_tm)) latest.set(key, f);
  }

  return [...latest.values()].map(f => {
    const p = f.properties, [lon, lat, elev] = f.geometry.coordinates;
    const kmh  = pick(p, ['avg_wnd_spd_10m_pst10mts','avg_wnd_spd_10m_pst2mts','avg_wnd_spd_10m_pst1mt','avg_wnd_spd_10m_pst1hr']);
    const gust = pick(p, ['max_wnd_spd_10m_pst10mts','max_wnd_spd_10m_pst1mt','max_wnd_spd_10m_pst1hr']);
    const dir  = pick(p, ['avg_wnd_dir_10m_pst10mts','avg_wnd_dir_10m_pst2mts','avg_wnd_dir_10m_pst1mt','avg_wnd_dir_10m_pst1hr']);
    return normalize({
      id: `swob:${p['msc_id-value']}`, source: 'swob', name: p['stn_nam-value'],
      lat, lon, elevation_m: elev ?? null, obs_time: p.obs_date_tm,
      dir, kmh, gust_kmh: gust,
    });
  }).filter(s => s.wind_speed_kmh !== null || s.wind_dir_deg !== null);
}

async function fetchNdbc() {
  const out = [];
  for (const b of NDBC_BUOYS) {
    try {
      const res = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${b.id}.txt`);
      if (!res.ok) continue;
      const text = await res.text();
      const rows = text.split('\n').filter(l => l && !l.startsWith('#'));
      if (!rows.length) continue;
      const c = rows[0].trim().split(/\s+/);
      const [YY, MM, DD, hh, mm] = c;
      const obs = `${YY}-${MM}-${DD}T${hh}:${mm}:00Z`;
      const num = v => (v === 'MM' || v === undefined ? null : Number(v));
      const wspd = num(c[6]);  // WSPD m/s
      const gst  = num(c[7]);  // GST  m/s
      const wdir = num(c[5]);  // WDIR degT
      out.push(normalize({
        id: `ndbc:${b.id}`, source: 'ndbc', name: b.name, lat: b.lat, lon: b.lon,
        elevation_m: 0, obs_time: obs, dir: wdir,
        kmh: wspd === null ? null : wspd * MS_TO_KMH,
        gust_kmh: gst === null ? null : gst * MS_TO_KMH,
      }));
    } catch { /* skip this buoy */ }
  }
  return out;
}

function normalize(s) {
  const stale = (Date.now() - new Date(s.obs_time).getTime()) > STALE_MIN * 60_000;
  const kn = s.kmh === null ? null : +(s.kmh * KMH_PER_KN).toFixed(1);
  const gkn = s.gust_kmh === null ? null : +(s.gust_kmh * KMH_PER_KN).toFixed(1);
  return {
    id: s.id, source: s.source, name: s.name, lat: s.lat, lon: s.lon,
    elevation_m: s.elevation_m,
    obs_time: s.obs_time,
    wind_dir_deg: s.dir === null ? null : Math.round(s.dir),
    wind_speed_kmh: s.kmh === null ? null : Math.round(s.kmh),
    wind_gust_kmh: s.gust_kmh === null ? null : Math.round(s.gust_kmh),
    wind_speed_kn: kn, wind_gust_kn: gkn,
    stale, quality: 'ok',
  };
}

const stations = [...await fetchSwob(), ...await fetchNdbc()];
const payload = {
  generated_at: new Date().toISOString(),
  sources: ['msc-geomet-swob-realtime', 'noaa-ndbc'],
  station_count: stations.length,
  stations,
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(`${OUT}.tmp`, JSON.stringify(payload, null, 2));
await rename(`${OUT}.tmp`, OUT);            // atomic swap
console.log(`Wrote ${stations.length} stations to ${OUT}`);
```

---

## 8. Edge cases & robustness checklist

- **Stale sensors:** always compare `obs_time` to now and flag `stale`; grey out in UI. Critical for
  SAR — never present a frozen reading as current.
- **Missing wind fields:** many stations report temp/pressure but not wind, or only some averaging
  windows — use the fallback chains; drop stations with no usable wind.
- **QA flags:** optionally honor `-qa` / `-data_flag` to suppress bad values.
- **Timezone:** all obs times are **UTC** — convert to America/Vancouver for display.
- **Pagination:** with the 20-min window the SWOB result is small, but handle the `next` link/`offset`
  if you widen the window.
- **Timeouts/retries:** wrap fetches with a timeout and 1–2 retries; on total failure keep serving the
  last good `wind.json` (don't overwrite with an empty file).
- **Buoy downtime:** buoys go offline seasonally/for maintenance — a missing file is normal, skip it.
- **Rate/courtesy:** refresh every 10–15 min; cache; single request per cycle per source.

---

## 9. Endpoint quick reference

```
# All recent coastal SWOB observations (GeoJSON), newest first:
https://api.weather.gc.ca/collections/swob-realtime/items?bbox=-133.5,48.0,-122.0,55.0&datetime=2026-07-13T03:00:00Z/..&sortby=-obs_date_tm&limit=10000&f=json

# Station metadata (names/types) if you want to enrich:
https://api.weather.gc.ca/collections/swob-stations/items?f=json

# One buoy, latest (text; first data row = newest):
https://www.ndbc.noaa.gov/data/realtime2/46146.txt

# Human reference dashboards (for cross-checking, not for scraping):
#   BC lightstations: https://halibutbank.ca/lightstations.html
#   ECCC marine:      https://weather.gc.ca/marine/region_e.html?mapID=02
```

**API docs:** https://api.weather.gc.ca/openapi • https://eccc-msc.github.io/open-data/msc-geomet/ogc_api_en/
**DFO buoy list:** https://www.pac.dfo-mpo.gc.ca/science/oceans/data-donnees/buoydata-donneebouee/index-eng.html
