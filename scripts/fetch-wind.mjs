// scripts/fetch-wind.mjs — run on a schedule; writes public/data/wind.json
// Sources: ECCC MSC GeoMet swob-realtime (land/coastal) + NOAA NDBC (buoys).
import { writeFile, rename, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const OUT = 'public/data/wind.json';
const BBOX = '-133.5,48.0,-122.0,55.0';   // BC coast
const STALE_MIN = 60;                      // per spec: SAR-critical
// Look back FURTHER than STALE_MIN, never equal to it. Marine sites (KELP REEFS,
// DISCOVERY ISLAND, Victoria Harbour) report hourly and ECCC publishes the ob ~5-6 min
// after the hour. With the window equal to STALE_MIN, a run between :00 and :06 saw the
// previous ob as just outside the look-back and the current one as not yet published,
// so those stations vanished from the payload entirely — and whichever snapshot
// deployed froze that gap for a full 15-min cycle (CR-004).
// The window decides what we *can* see; `stale` decides what actually renders. Anything
// here too old still gets written, flagged stale, and filtered downstream.
// It must also be wide enough to hold at least TWO obs from an hourly station, since
// that's how medianCadenceMin infers the cadence the staleness rule depends on. 180 min
// always spans three hour boundaries, so an hourly site yields >=2 obs at any moment;
// at 120 it intermittently yielded 1, cadence came back null, and the station fell back
// to the flat floor and vanished again. Cheap because of SWOB_PROPS below (~2 MB).
// Sites reporting less often than ~90 min still infer null and use the STALE_MIN floor.
const WINDOW_MIN = 3 * STALE_MIN;          // SWOB look-back window
const TIMEOUT_MS = 15_000;
const RETRIES = 2;

const KMH_PER_KN = 0.539957;
const MS_TO_KMH = 3.6;

// Fallback chains, best source first. Each is tried in order until one has a value.
const SPD_FIELDS  = ['avg_wnd_spd_10m_pst10mts', 'avg_wnd_spd_10m_pst2mts', 'avg_wnd_spd_10m_pst1mt', 'avg_wnd_spd_10m_pst1hr'];
const GUST_FIELDS = ['max_wnd_spd_10m_pst10mts', 'max_wnd_spd_10m_pst1mt', 'max_wnd_spd_10m_pst1hr'];
const DIR_FIELDS  = ['avg_wnd_dir_10m_pst10mts', 'avg_wnd_dir_10m_pst2mts', 'avg_wnd_dir_10m_pst1mt', 'avg_wnd_dir_10m_pst1hr'];
const WIND_FIELDS = [...SPD_FIELDS, ...GUST_FIELDS, ...DIR_FIELDS];

// Ask for only the fields we read. SWOB features carry ~230 properties each; without
// this the 120-min window pulls ~25 MB per run (~2.4 GB/day off a public API), with it
// ~1.8 MB and roughly half the latency. The `-qa` siblings must be listed explicitly or
// pickWithQa silently loses its suspect-data detection — they're absent from many
// features but are valid collection fields, so requesting them is safe.
// WARNING: one unknown name makes GeoMet 400 the entire query. Verify any field you add
// against the collection schema before shipping it.
const SWOB_PROPS = [
  'msc_id-value', 'stn_nam-value', 'obs_date_tm',
  ...WIND_FIELDS,
  ...WIND_FIELDS.map(f => `${f}-qa`),
];

const NDBC_BUOYS = [
  { id: '46146', name: 'Halibut Bank',    lat: 49.34, lon: -123.73 },
  { id: '46131', name: 'Sentry Shoal',    lat: 49.91, lon: -125.00 },
  { id: '46206', name: 'La Perouse Bank', lat: 48.84, lon: -125.99 },
  { id: '46132', name: 'South Brooks',    lat: 49.74, lon: -127.93 },
  { id: '46204', name: 'West Sea Otter',  lat: 51.38, lon: -128.77 },
  { id: '46181', name: 'Nanakwa Shoal',   lat: 53.82, lon: -128.83 },
];

async function fetchWithRetry(url, label) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ac.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      // Widen the backoff so a few-second upstream blip doesn't burn all attempts at once.
      if (attempt < RETRIES) await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw new Error(`${label} — ${lastErr?.message ?? lastErr}`);
}

const isBadQa = (v) => v != null && /fail|bad|error|suspect/i.test(String(v));

// Returns { value, suspect } — walks fallback chain, records QA state of the picked field.
const pickWithQa = (props, keys) => {
  for (const k of keys) {
    const v = props[k];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (Number.isNaN(n)) continue;
    return { value: n, suspect: isBadQa(props[`${k}-qa`]) };
  }
  return { value: null, suspect: false };
};

async function fetchSwob() {
  const start = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const url = 'https://api.weather.gc.ca/collections/swob-realtime/items'
    + `?bbox=${BBOX}`
    + `&datetime=${encodeURIComponent(start)}/..`
    + `&properties=${SWOB_PROPS.join(',')}`
    + '&sortby=-obs_date_tm&limit=10000&f=json';
  const res = await fetchWithRetry(url, 'SWOB');
  const { features = [] } = await res.json();

  // Reduce to newest observation per station, keeping every obs time seen so each
  // station's reporting cadence can be inferred for the staleness rule.
  const latest = new Map();
  const seenTimes = new Map();
  for (const f of features) {
    const p = f.properties || {};
    const key = p['msc_id-value'];
    if (!key) continue;
    if (!seenTimes.has(key)) seenTimes.set(key, []);
    seenTimes.get(key).push(p.obs_date_tm);
    const prev = latest.get(key);
    if (!prev || new Date(p.obs_date_tm) > new Date(prev.properties.obs_date_tm)) {
      latest.set(key, f);
    }
  }

  const swob = [...latest.values()].map(f => {
    const p = f.properties;
    const [lon, lat, elev] = f.geometry.coordinates;
    const spd  = pickWithQa(p, SPD_FIELDS);
    const gust = pickWithQa(p, GUST_FIELDS);
    const dir  = pickWithQa(p, DIR_FIELDS);
    return normalize({
      id: `swob:${p['msc_id-value']}`,
      source: 'swob',
      name: p['stn_nam-value'],
      lat, lon,
      elevation_m: elev ?? null,
      obs_time: p.obs_date_tm,
      cadence_min: medianCadenceMin(seenTimes.get(p['msc_id-value']) ?? []),
      dir: dir.value,
      kmh: spd.value,
      gust_kmh: gust.value,
      suspect: spd.suspect || dir.suspect || gust.suspect,
    });
  }).filter(s => s.wind_speed_kmh !== null || s.wind_dir_deg !== null);

  return dedupeByPosition(swob);
}

// Several sites publish under two msc_ids at identical coordinates (an AUTO feed
// and its staffed/AWOS partner — Victoria Harbour, Tofino, Nanaimo and friends).
// Keyed by msc_id alone they both survive and stack two markers on the same pixel,
// so collapse co-located records and keep the most complete one.
function dedupeByPosition(stations) {
  const better = (a, b) => {
    const score = s => (s.wind_speed_kn !== null ? 4 : 0)
                     + (s.wind_dir_deg !== null ? 2 : 0)
                     + (s.wind_gust_kn !== null ? 1 : 0);
    if (score(a) !== score(b)) return score(a) > score(b) ? a : b;
    return new Date(a.obs_time) >= new Date(b.obs_time) ? a : b;
  };

  const byPos = new Map();
  for (const s of stations) {
    const key = `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;
    const prev = byPos.get(key);
    byPos.set(key, prev ? better(prev, s) : s);
  }
  return [...byPos.values()];
}

async function fetchNdbc() {
  const out = [];
  for (const b of NDBC_BUOYS) {
    try {
      const res = await fetchWithRetry(`https://www.ndbc.noaa.gov/data/realtime2/${b.id}.txt`, `NDBC ${b.id}`);
      const text = await res.text();
      const rows = text.split('\n').filter(l => l && !l.startsWith('#'));
      if (!rows.length) continue;
      const c = rows[0].trim().split(/\s+/);
      const [YY, MM, DD, hh, mm] = c;
      const obs = `${YY}-${MM}-${DD}T${hh}:${mm}:00Z`;
      const num = v => (v === 'MM' || v === undefined ? null : Number(v));
      const wspd = num(c[6]);
      const gst  = num(c[7]);
      const wdir = num(c[5]);
      // realtime2 is newest-first, so the first few rows give the buoy's reporting
      // interval directly — same cadence-aware staleness rule as the SWOB sites.
      const rowTime = (r) => {
        const f = r.trim().split(/\s+/);
        return `${f[0]}-${f[1]}-${f[2]}T${f[3]}:${f[4]}:00Z`;
      };
      const cadence = medianCadenceMin(rows.slice(0, 6).map(rowTime));
      out.push(normalize({
        id: `ndbc:${b.id}`,
        source: 'ndbc',
        name: b.name,
        lat: b.lat,
        lon: b.lon,
        elevation_m: 0,
        obs_time: obs,
        cadence_min: cadence,
        dir: wdir,
        kmh: wspd === null ? null : wspd * MS_TO_KMH,
        gust_kmh: gst === null ? null : gst * MS_TO_KMH,
        suspect: false,
      }));
    } catch (e) {
      console.warn(`skip NDBC ${b.id}: ${e.message ?? e}`);
    }
  }
  return out;
}

const CADENCE_GRACE_MIN = 15;   // publication lag + schedule jitter

// A station is stale when it has actually MISSED a report — not merely when its newest
// reading is old. Hourly sites (KELP REEFS, DISCOVERY ISLAND, Victoria Harbour) are
// never fresher than ~60 min by definition, so a flat 60-min bound hid them for ~6 min
// of every hour while they were reporting perfectly on schedule (CR-004). Judge each
// station against its own cadence instead, keeping STALE_MIN as the floor so frequent
// reporters retain the tight SAR-critical bound: a 1-min station that dies is still
// stale at 60 min, while an hourly one stays visible until it genuinely misses.
const staleAfterMin = (cadenceMin) => Math.max(STALE_MIN, (cadenceMin ?? 0) + CADENCE_GRACE_MIN);

const isStale = (obsTime, cadenceMin) =>
  (Date.now() - new Date(obsTime).getTime()) / 60_000 > staleAfterMin(cadenceMin);

// Median gap between a station's observations, in minutes. Median rather than mean so a
// single missed report doesn't inflate it. null when there's too little history to tell,
// which falls back to the STALE_MIN floor.
function medianCadenceMin(times) {
  const ms = [...new Set(times)].map(t => new Date(t).getTime()).sort((a, b) => a - b);
  if (ms.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < ms.length; i++) gaps.push((ms[i] - ms[i - 1]) / 60_000);
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return Math.round(gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2);
}

function normalize(s) {
  const stale = isStale(s.obs_time, s.cadence_min);
  const kn  = s.kmh === null ? null : +(s.kmh * KMH_PER_KN).toFixed(1);
  const gkn = s.gust_kmh === null ? null : +(s.gust_kmh * KMH_PER_KN).toFixed(1);
  return {
    id: s.id,
    source: s.source,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    elevation_m: s.elevation_m,
    obs_time: s.obs_time,
    cadence_min: s.cadence_min ?? null,
    wind_dir_deg: s.dir === null ? null : Math.round(s.dir),
    wind_speed_kmh: s.kmh === null ? null : Math.round(s.kmh),
    wind_gust_kmh: s.gust_kmh === null ? null : Math.round(s.gust_kmh),
    wind_speed_kn: kn,
    wind_gust_kn: gkn,
    stale,
    quality: s.suspect ? 'suspect' : 'ok',
  };
}

async function readExisting() {
  try { return JSON.parse(await readFile(OUT, 'utf8')); }
  catch { return null; }
}

const SOURCES = [
  { key: 'swob', label: 'SWOB', fetch: fetchSwob },
  { key: 'ndbc', label: 'NDBC', fetch: fetchNdbc },
];

const previous = await readExisting();
const results = await Promise.allSettled(SOURCES.map(s => s.fetch()));

const stations = [];
const counts = {};
let degraded = false;

results.forEach((r, i) => {
  const { key, label } = SOURCES[i];
  if (r.status === 'fulfilled') {
    stations.push(...r.value);
    counts[key] = r.value.length;
    return;
  }

  console.warn(`source failed: ${label} — ${r.reason?.message ?? r.reason}`);
  degraded = true;

  // A transient upstream blip must not blank this source for a whole refresh cycle.
  // GeoMet drops out for a single run every so often; without this, every coastal
  // SWOB station vanishes from the dashboard until the next successful fetch.
  // Carry the last good observations forward, but only while they're still inside
  // STALE_MIN — so a prolonged outage decays to nothing instead of freezing an
  // ancient snapshot on screen.
  const carried = (previous?.stations ?? [])
    .filter(s => s.source === key && !isStale(s.obs_time, s.cadence_min))
    .map(s => ({ ...s, stale: false }));
  stations.push(...carried);
  counts[key] = carried.length;
  console.warn(`carried forward ${carried.length} ${label} station(s) from the previous run`);
});

// Preserve last good file rather than overwriting with an empty one.
if (stations.length === 0 && previous) {
  console.warn('No stations fetched; leaving previous wind.json intact.');
  process.exit(0);
}

const payload = {
  generated_at: new Date().toISOString(),
  sources: ['msc-geomet-swob-realtime', 'noaa-ndbc'],
  degraded,
  station_count: stations.length,
  stations,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(`${OUT}.tmp`, JSON.stringify(payload, null, 2));
await rename(`${OUT}.tmp`, OUT);   // atomic swap
console.log(`Wrote ${stations.length} stations to ${OUT} (swob=${counts.swob}, ndbc=${counts.ndbc})${degraded ? ' [degraded — a source failed]' : ''}`);
