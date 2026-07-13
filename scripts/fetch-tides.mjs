// scripts/fetch-tides.mjs — run on a daily schedule; writes public/data/tides-map.json.
// Fetches wlp-hilo hi/lo events for all BC-coast IWLS stations. Client-side
// interpolates current level + rising/falling and renders Navionics-style column
// markers on the shared currents/tides map.

import { writeFile, rename, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const OUT = 'public/data/tides-map.json';
const IWLS = 'https://api-iwls.dfo-mpo.gc.ca/api/v1';
const BBOX = { latMin: 48.0, latMax: 55.0, lonMin: -134.0, lonMax: -122.0 };
const FETCH_LOOKBEHIND_MS = 8  * 3600e3;
const FETCH_LOOKAHEAD_MS  = 32 * 3600e3;
const RATE_DELAY_MS = 2100; // IWLS sustained cap is 30 req/min
const TIMEOUT_MS = 15_000;
const RETRIES = 2;

async function fetchWithRetry(url, label) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ac.signal });
      clearTimeout(timer);
      if (res.status === 429 && attempt < RETRIES) {
        await new Promise(r => setTimeout(r, 30_000));
        continue;
      }
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isoNoMs = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

async function fetchTideStations() {
  const url = `${IWLS}/stations?time-series-code=wlp-hilo`;
  const res = await fetchWithRetry(url, 'IWLS tide stations');
  const list = await res.json();
  return list
    .filter(s =>
      s.latitude >= BBOX.latMin && s.latitude <= BBOX.latMax &&
      s.longitude >= BBOX.lonMin && s.longitude <= BBOX.lonMax,
    )
    .map(s => ({
      id: s.id,
      code: s.code,
      name: s.officialName,
      lat: s.latitude,
      lon: s.longitude,
    }));
}

async function fetchHilo(id, fromIso, toIso) {
  const url = `${IWLS}/stations/${id}/data?time-series-code=wlp-hilo&from=${fromIso}&to=${toIso}`;
  const res = await fetchWithRetry(url, `wlp-hilo ${id}`);
  const list = await res.json();
  return list.map(p => ({
    t: new Date(p.eventDate).getTime(),
    value: Number(p.value),
  }));
}

async function readExisting() {
  try { return JSON.parse(await readFile(OUT, 'utf8')); }
  catch { return null; }
}

const now = Date.now();
const fromIso = isoNoMs(new Date(now - FETCH_LOOKBEHIND_MS));
const toIso   = isoNoMs(new Date(now + FETCH_LOOKAHEAD_MS));

console.log(`Fetching BC-coast wlp-hilo stations from IWLS (${fromIso} → ${toIso})…`);

let stations = [];
try {
  stations = await fetchTideStations();
  console.log(`  found ${stations.length} tide stations in bbox`);
} catch (e) {
  console.error(`Failed to list tide stations: ${e.message ?? e}`);
  const prev = await readExisting();
  if (prev) {
    console.warn('Leaving previous tides-map.json intact.');
    process.exit(0);
  }
  process.exit(1);
}

const out = [];
for (const s of stations) {
  try {
    await sleep(RATE_DELAY_MS);
    const events = await fetchHilo(s.id, fromIso, toIso);
    if (events.length < 2) continue; // need at least a bracket for interp
    out.push({
      id: s.id,
      code: s.code,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      events,
    });
  } catch (e) {
    console.warn(`  skip ${s.name}: ${e.message ?? e}`);
  }
}

if (out.length === 0 && await readExisting()) {
  console.warn('No tide stations fetched; leaving previous tides-map.json intact.');
  process.exit(0);
}

const payload = {
  generated_at: new Date().toISOString(),
  window: { from: fromIso, to: toIso },
  stations: out,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(`${OUT}.tmp`, JSON.stringify(payload, null, 2));
await rename(`${OUT}.tmp`, OUT);
console.log(`Wrote ${out.length} tide stations to ${OUT}`);
