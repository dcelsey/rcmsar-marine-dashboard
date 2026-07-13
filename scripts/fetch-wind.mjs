// scripts/fetch-wind.mjs — run on a schedule; writes public/data/wind.json
// Sources: ECCC MSC GeoMet swob-realtime (land/coastal) + NOAA NDBC (buoys).
import { writeFile, rename, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const OUT = 'public/data/wind.json';
const BBOX = '-133.5,48.0,-122.0,55.0';   // BC coast
const WINDOW_MIN = 20;                     // SWOB look-back window
const STALE_MIN = 60;                      // per spec: SAR-critical
const TIMEOUT_MS = 15_000;
const RETRIES = 2;

const KMH_PER_KN = 0.539957;
const MS_TO_KMH = 3.6;

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
      if (attempt < RETRIES) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
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
    + '&sortby=-obs_date_tm&limit=10000&f=json';
  const res = await fetchWithRetry(url, 'SWOB');
  const { features = [] } = await res.json();

  // Reduce to newest observation per station.
  const latest = new Map();
  for (const f of features) {
    const p = f.properties || {};
    const key = p['msc_id-value'];
    if (!key) continue;
    const prev = latest.get(key);
    if (!prev || new Date(p.obs_date_tm) > new Date(prev.properties.obs_date_tm)) {
      latest.set(key, f);
    }
  }

  return [...latest.values()].map(f => {
    const p = f.properties;
    const [lon, lat, elev] = f.geometry.coordinates;
    const spd  = pickWithQa(p, ['avg_wnd_spd_10m_pst10mts','avg_wnd_spd_10m_pst2mts','avg_wnd_spd_10m_pst1mt','avg_wnd_spd_10m_pst1hr']);
    const gust = pickWithQa(p, ['max_wnd_spd_10m_pst10mts','max_wnd_spd_10m_pst1mt','max_wnd_spd_10m_pst1hr']);
    const dir  = pickWithQa(p, ['avg_wnd_dir_10m_pst10mts','avg_wnd_dir_10m_pst2mts','avg_wnd_dir_10m_pst1mt','avg_wnd_dir_10m_pst1hr']);
    return normalize({
      id: `swob:${p['msc_id-value']}`,
      source: 'swob',
      name: p['stn_nam-value'],
      lat, lon,
      elevation_m: elev ?? null,
      obs_time: p.obs_date_tm,
      dir: dir.value,
      kmh: spd.value,
      gust_kmh: gust.value,
      suspect: spd.suspect || dir.suspect || gust.suspect,
    });
  }).filter(s => s.wind_speed_kmh !== null || s.wind_dir_deg !== null);
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
      out.push(normalize({
        id: `ndbc:${b.id}`,
        source: 'ndbc',
        name: b.name,
        lat: b.lat,
        lon: b.lon,
        elevation_m: 0,
        obs_time: obs,
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

function normalize(s) {
  const stale = (Date.now() - new Date(s.obs_time).getTime()) > STALE_MIN * 60_000;
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

const results = await Promise.allSettled([fetchSwob(), fetchNdbc()]);
const swobStations = results[0].status === 'fulfilled' ? results[0].value : [];
const ndbcStations = results[1].status === 'fulfilled' ? results[1].value : [];
for (const r of results) {
  if (r.status === 'rejected') console.warn('source failed:', r.reason?.message ?? r.reason);
}

const stations = [...swobStations, ...ndbcStations];

// Preserve last good file rather than overwriting with an empty one.
if (stations.length === 0 && await readExisting()) {
  console.warn('No stations fetched; leaving previous wind.json intact.');
  process.exit(0);
}

const payload = {
  generated_at: new Date().toISOString(),
  sources: ['msc-geomet-swob-realtime', 'noaa-ndbc'],
  station_count: stations.length,
  stations,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(`${OUT}.tmp`, JSON.stringify(payload, null, 2));
await rename(`${OUT}.tmp`, OUT);   // atomic swap
console.log(`Wrote ${stations.length} stations to ${OUT} (swob=${swobStations.length}, ndbc=${ndbcStations.length})`);
