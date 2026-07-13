// CHS Vol. 5 (2026/01) Table 4 — Reference and Secondary Current Stations.
// Transcribed by hand from the PDF; not published as machine-readable.
// Vol. 6 is a stub — fill from the CHS Vol. 6 PDF (Discovery Passage + WCVI).

export const TABLES_EDITION = 'CHS Vol. 5, 2026/01';

/**
 * @typedef {'SLACK' | 'EXTREMA_FLOOD' | 'EXTREMA_EBB'} EventQualifier
 * @typedef {{ t: number, value: number, qualifier: EventQualifier }} CurrentEvent
 * @typedef {{
 *   id: string, name: string, lat: number, lon: number,
 *   referenceCode: string, floodDir: number,
 *   tf: number, mf: number, te: number, me: number,
 *   floodPct: number | null, ebbPct: number | null,
 *   absoluteFloodKn?: number, absoluteEbbKn?: number,
 *   conditional?: 'haroStrait', notes?: string
 * }} SecondaryCorrection
 * @typedef {{ code: string, events: CurrentEvent[] }} ReferenceSeries
 * @typedef {{
 *   id: string, name: string, lat: number, lon: number,
 *   referenceCode: string, floodDirection: number, ebbDirection: number,
 *   events: CurrentEvent[], notes?: string
 * }} DerivedStation
 */

/** @type {SecondaryCorrection[]} */
export const VOL5_SECONDARIES = [
  { id: 'river-jordan',       name: 'River Jordan',            lat: 48.317, lon: -124.083, referenceCode: 'Juan de Fuca - East',         floodDir: 110, tf: -50, mf: -30, te: -15, me: -25, floodPct: 70, ebbPct: 70 },
  { id: 'baynes-channel',     name: 'Baynes Channel',          lat: 48.433, lon: -123.267, referenceCode: 'Race Passage',                floodDir:  40, tf: -15, mf: -15, te: -15, me: -15, floodPct: 75, ebbPct: 75 },
  { id: 'haro-strait-hamley', name: 'Haro Strait (Hamley Pt.)',lat: 48.583, lon: -123.233, referenceCode: 'Race Passage',                floodDir: 350, tf:  85, mf:  95, te: 150, me: 100, floodPct: 45, ebbPct: 45, conditional: 'haroStrait', notes: '+70 min to turn-to-ebb if preceding flood at Race Passage < 2.0 kt' },
  { id: 'sidney-channel',     name: 'Sidney Channel',          lat: 48.617, lon: -123.333, referenceCode: 'Race Passage',                floodDir: 330, tf:  60, mf:  90, te:  90, me:  40, floodPct: 35, ebbPct: 30 },
  { id: 'swanson-channel',    name: 'Swanson Channel',         lat: 48.783, lon: -123.333, referenceCode: 'Race Passage',                floodDir: 330, tf: 100, mf:  85, te:  85, me:  95, floodPct: 25, ebbPct: 20 },
  { id: 'boundary-passage',   name: 'Boundary Passage',        lat: 48.750, lon: -123.083, referenceCode: 'Race Passage',                floodDir:  70, tf:  60, mf:  70, te:  60, me:  70, floodPct: 50, ebbPct: 40 },
  { id: 'trincomali-channel', name: 'Trincomali Channel',      lat: 48.883, lon: -123.450, referenceCode: 'Race Passage',                floodDir: 320, tf:  35, mf:  50, te:  50, me:  45, floodPct: 15, ebbPct: 15 },
  { id: 'georgeson-passage',  name: 'Georgeson Passage',       lat: 48.833, lon: -123.233, referenceCode: 'Active Pass',                 floodDir: 315, tf: -15, mf: -40, te: -45, me: -30, floodPct: 50, ebbPct: 55 },
  { id: 'boat-passage',       name: 'Boat Passage',            lat: 48.817, lon: -123.183, referenceCode: 'Active Pass',                 floodDir:  55, tf: -15, mf: -40, te: -45, me: -30, floodPct: 100, ebbPct: 100 },
  { id: 'sansum-narrows',     name: 'Sansum Narrows',          lat: 48.783, lon: -123.550, referenceCode: 'Active Pass',                 floodDir:   0, tf:  25, mf:  25, te: -35, me: -35, floodPct: null, ebbPct: null, absoluteFloodKn: 3.0, absoluteEbbKn: 3.0 },
  { id: 'false-narrows',      name: 'False Narrows',           lat: 49.133, lon: -123.783, referenceCode: 'Dodd Narrows',                floodDir: 295, tf:  10, mf:  25, te:  25, me:  25, floodPct: 50, ebbPct: 55 },
  { id: 'tzoonie-narrows',    name: 'Tzoonie Narrows',         lat: 49.717, lon: -123.767, referenceCode: 'Sechelt Rapids',              floodDir:  50, tf:  10, mf:  10, te:  10, me:  10, floodPct: 20, ebbPct: 20 },
];

// Stub — fill from CHS Vol. 6 Table 4 (Discovery Passage + WCVI) in a follow-up.
/** @type {SecondaryCorrection[]} */
export const VOL6_SECONDARIES = [];

// Shift + scale each reference event into the secondary's timeline.
// The Haro Strait conditional adjusts turn-to-ebb by an extra 70 min when
// the immediately preceding EXTREMA_FLOOD at the reference was under 2 kt.
/**
 * @param {ReferenceSeries} reference
 * @param {SecondaryCorrection} correction
 * @returns {DerivedStation}
 */
export function deriveSecondary(reference, correction) {
  /** @type {CurrentEvent[]} */
  const derived = [];
  for (let i = 0; i < reference.events.length; i++) {
    const ev = reference.events[i];
    const shift = shiftMinutesFor(ev, reference.events, i, correction);
    if (shift === null) continue;
    derived.push({
      t: ev.t + shift * 60_000,
      value: scaleValueFor(ev, correction),
      qualifier: ev.qualifier,
    });
  }
  derived.sort((a, b) => a.t - b.t);
  return {
    id: correction.id,
    name: correction.name,
    lat: correction.lat,
    lon: correction.lon,
    referenceCode: correction.referenceCode,
    floodDirection: correction.floodDir,
    ebbDirection: (correction.floodDir + 180) % 360,
    events: derived,
    notes: correction.notes,
  };
}

// Slack events are keyed to the phase of the *next* extremum: slack-before-flood
// uses `tf`, slack-before-ebb uses `te`. If no future extremum exists we drop
// the slack rather than guess.
function shiftMinutesFor(ev, all, idx, c) {
  if (ev.qualifier === 'EXTREMA_FLOOD') return c.mf;
  if (ev.qualifier === 'EXTREMA_EBB')   return c.me;
  const nextExtremum = findNextExtremum(all, idx);
  if (!nextExtremum) return null;
  let base = nextExtremum.qualifier === 'EXTREMA_FLOOD' ? c.tf : c.te;
  if (c.conditional === 'haroStrait' && nextExtremum.qualifier === 'EXTREMA_EBB') {
    const prevFlood = findPreviousFlood(all, idx);
    if (prevFlood && Math.abs(prevFlood.value) < 2.0) base += 70;
  }
  return base;
}

function scaleValueFor(ev, c) {
  if (ev.qualifier === 'SLACK') return 0;
  if (ev.qualifier === 'EXTREMA_FLOOD') {
    if (c.absoluteFloodKn !== undefined) return c.absoluteFloodKn;
    if (c.floodPct !== null)             return ev.value * (c.floodPct / 100);
    return ev.value;
  }
  if (c.absoluteEbbKn !== undefined) return c.absoluteEbbKn;
  if (c.ebbPct !== null)             return ev.value * (c.ebbPct / 100);
  return ev.value;
}

function findNextExtremum(all, fromIdx) {
  for (let j = fromIdx + 1; j < all.length; j++) {
    const q = all[j].qualifier;
    if (q === 'EXTREMA_FLOOD' || q === 'EXTREMA_EBB') return all[j];
  }
  return null;
}

function findPreviousFlood(all, fromIdx) {
  for (let j = fromIdx - 1; j >= 0; j--) {
    if (all[j].qualifier === 'EXTREMA_FLOOD') return all[j];
  }
  return null;
}
