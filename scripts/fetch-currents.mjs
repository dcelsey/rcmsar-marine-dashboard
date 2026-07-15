// scripts/fetch-currents.mjs — run on a daily schedule; writes public/data/currents.json.
// Source: CHS IWLS API (wcp1-events current-tables predictions). Secondary stations
// derived server-side from the Table 4 corrections module.
//
// Predictions are astronomical, so a daily run is more than enough. IWLS rate-limits
// to 3 req/s, 30 req/min — we sequentialize with a small pause.

import { writeFile, rename, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  TABLES_EDITION,
  VOL5_SECONDARIES,
  VOL6_SECONDARIES,
  deriveSecondary,
} from '../src/lib/currentsTables.mjs';

const OUT = 'public/data/currents.json';
const IWLS = 'https://api-iwls.dfo-mpo.gc.ca/api/v1';
const FETCH_LOOKBEHIND_MS = 8  * 3600e3;   // per spec §6 — wider than displayed
const FETCH_LOOKAHEAD_MS  = 72 * 3600e3;
const RATE_DELAY_MS = 400;                  // stays inside 3 req/s comfortably
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

// Strip milliseconds — IWLS is picky (per POC gotchas §6 in the spec).
function isoNoMs(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function fetchReferenceStations() {
  const url = `${IWLS}/stations?time-series-code=wcp1-events`;
  const res = await fetchWithRetry(url, 'IWLS stations');
  const list = await res.json();
  return list.map(s => ({
    id: s.id,
    code: s.code,
    name: s.officialName,
    lat: s.latitude,
    lon: s.longitude,
  }));
}

async function fetchStationMetadata(id) {
  const res = await fetchWithRetry(`${IWLS}/stations/${id}/metadata`, `metadata ${id}`);
  return res.json();
}

async function fetchEvents(id, fromIso, toIso) {
  const url = `${IWLS}/stations/${id}/data?time-series-code=wcp1-events&from=${fromIso}&to=${toIso}`;
  const res = await fetchWithRetry(url, `events ${id}`);
  const list = await res.json();
  return list.map(p => ({
    t: new Date(p.eventDate).getTime(),
    value: Number(p.value),
    qualifier: p.qualifier,
  }));
}

async function readExisting() {
  try { return JSON.parse(await readFile(OUT, 'utf8')); }
  catch { return null; }
}

// -----------------------------------------------------------------------------

const now = Date.now();
const fromIso = isoNoMs(new Date(now - FETCH_LOOKBEHIND_MS));
const toIso   = isoNoMs(new Date(now + FETCH_LOOKAHEAD_MS));

console.log(`Fetching Vol. 5 reference stations from IWLS (${fromIso} → ${toIso})…`);

let references = [];
try {
  references = await fetchReferenceStations();
  console.log(`  found ${references.length} stations with wcp1-events`);
} catch (e) {
  console.error(`Failed to list reference stations: ${e.message ?? e}`);
  const prev = await readExisting();
  if (prev) {
    console.warn('Leaving previous currents.json intact.');
    process.exit(0);
  }
  process.exit(1);
}

const referenceOut = [];
for (const ref of references) {
  try {
    await sleep(RATE_DELAY_MS);
    const meta = await fetchStationMetadata(ref.id);
    await sleep(RATE_DELAY_MS);
    const events = await fetchEvents(ref.id, fromIso, toIso);
    if (events.length === 0) {
      console.warn(`  ${ref.name}: no events in window — skipping`);
      continue;
    }
    referenceOut.push({
      id: ref.id,
      code: ref.code,
      name: ref.name,
      lat: ref.lat,
      lon: ref.lon,
      floodDirection: meta.floodDirection ?? null,
      ebbDirection: meta.ebbDirection ?? (meta.floodDirection != null ? (meta.floodDirection + 180) % 360 : null),
      events,
    });
    console.log(`  ${ref.name}: ${events.length} events`);
  } catch (e) {
    console.warn(`  skip ${ref.name}: ${e.message ?? e}`);
  }
}

// Derive secondaries. Match on officialName — case-insensitive, trimmed.
const refByCode = new Map(referenceOut.map(r => [r.name.trim().toLowerCase(), r]));

const secondaries = [];
const skippedSecondaries = [];
for (const c of [...VOL5_SECONDARIES, ...VOL6_SECONDARIES]) {
  const ref = refByCode.get(c.referenceCode.trim().toLowerCase());
  if (!ref) {
    skippedSecondaries.push(`${c.name} (missing ref "${c.referenceCode}")`);
    continue;
  }
  secondaries.push(deriveSecondary({ code: ref.name, events: ref.events }, c));
}
if (skippedSecondaries.length) {
  console.warn(`Skipped ${skippedSecondaries.length} secondaries: ${skippedSecondaries.join('; ')}`);
}

if (referenceOut.length === 0 && await readExisting()) {
  console.warn('No reference stations fetched; leaving previous currents.json intact.');
  process.exit(0);
}

const payload = {
  generated_at: new Date().toISOString(),
  tables_edition: TABLES_EDITION,
  window: { from: fromIso, to: toIso },
  reference_stations: referenceOut,
  secondary_stations: secondaries,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(`${OUT}.tmp`, JSON.stringify(payload, null, 2));
await rename(`${OUT}.tmp`, OUT);
console.log(`Wrote ${referenceOut.length} reference + ${secondaries.length} secondary stations to ${OUT}`);
