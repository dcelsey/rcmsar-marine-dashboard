import SunCalc from 'suncalc';
import type * as LeafletNS from 'leaflet';
import type { StationConfig } from '../lib/stations';
import { fmtTime, fmtDay, fmtNow, compass, wmo } from '../lib/format';
import {
  loadWeather, loadWindByLocation, loadMarine, loadTides, loadLiveWind, loadCurrents, loadTidesMap,
  getNearbyLiveStations, pointHasNearbyLive,
  type WeatherResponse, type WindPointResponse, type MarineResponse, type TideBundle, type LiveWindPayload,
  type CurrentsPayload, type ReferenceCurrentStation, type SecondaryCurrentStation, type TideMapPayload,
} from '../lib/sources';
import { windBarbSvg, speedTint } from '../lib/windBarb';
import { currentArrowSvg, currentTint, interpolateCurrentAt, nextExtremum } from '../lib/currentArrow';
import { tideStateAt, tideMarkerSvg } from '../lib/tideMarker';

const station: StationConfig = JSON.parse(
  document.getElementById('station-config')!.textContent!,
);
const tz = station.tz;

const $ = <T extends Element = HTMLElement>(sel: string) =>
  document.querySelector<T>(sel);

let lastGood: string | null = null;

function renderGlance(wx: WeatherResponse, marine: MarineResponse | null, tides: TideBundle | null, live: LiveWindPayload | null): void {
  const cur = wx.current;

  // Prefer the nearest live obs within 10 km of the station center; otherwise
  // fall back to Open-Meteo's forecast for the center point.
  const nearby = getNearbyLiveStations(live, station.center, { maxKm: 10, limit: 1 });
  const liveNear = nearby[0]?.station ?? null;

  const gWind = $('#g-wind');
  const gWindSub = $('#g-wind-sub');
  const gWindSrc = $('#g-wind-src');
  if (liveNear && liveNear.wind_speed_kn !== null && liveNear.wind_dir_deg !== null) {
    if (gWind) {
      gWind.innerHTML = `${Math.round(liveNear.wind_speed_kn)}<small> kn</small>`;
      gWind.classList.remove('skel');
    }
    if (gWindSub) {
      const gust = liveNear.wind_gust_kn === null ? '—' : String(Math.round(liveNear.wind_gust_kn));
      gWindSub.innerHTML =
        `<span class="arrow" style="transform:rotate(${liveNear.wind_dir_deg + 90}deg)">→</span>`
        + ` from <b>${compass(liveNear.wind_dir_deg)}</b> · gust <b>${gust}</b>`;
    }
    if (gWindSrc) {
      gWindSrc.innerHTML = `${liveNear.source.toUpperCase()} · ${liveNear.name} · ${fmtTime(liveNear.obs_time, tz)}`;
    }
  } else {
    if (gWind) {
      gWind.innerHTML = `${Math.round(cur.wind_speed_10m)}<small> kn</small>`;
      gWind.classList.remove('skel');
    }
    if (gWindSub) {
      gWindSub.innerHTML =
        `<span class="arrow" style="transform:rotate(${cur.wind_direction_10m + 90}deg)">→</span>`
        + ` from <b>${compass(cur.wind_direction_10m)}</b> · gust <b>${Math.round(cur.wind_gusts_10m)}</b>`;
    }
    if (gWindSrc) {
      gWindSrc.innerHTML = 'forecast · Open-Meteo';
    }
  }

  const wh = marine?.current?.wave_height;
  const gSea = $('#g-sea');
  if (gSea) {
    gSea.innerHTML = wh == null ? '—' : `${wh.toFixed(1)}<small> m</small>`;
    gSea.classList.remove('skel');
  }
  const gSeaSub = $('#g-sea-sub');
  if (gSeaSub) {
    if (marine?.current?.wave_period != null) {
      const dirBits = marine.current.wave_direction != null
        ? ` · ${compass(marine.current.wave_direction)}`
        : '';
      gSeaSub.innerHTML = `period <b>${Math.round(marine.current.wave_period)} s</b>${dirBits}`;
    } else {
      gSeaSub.innerHTML = 'see ECCC forecast';
    }
  }

  const [em, lab] = wmo(cur.weather_code);
  const gWx = $('#g-wx');
  if (gWx) {
    gWx.innerHTML = `${em} ${Math.round(cur.temperature_2m)}<small>°C</small>`;
    gWx.classList.remove('skel');
  }
  const gWxSub = $('#g-wx-sub');
  if (gWxSub) {
    gWxSub.innerHTML = `${lab} · feels <b>${Math.round(cur.apparent_temperature)}°</b> · ${Math.round(cur.pressure_msl)} hPa`;
  }

  const gTide = $('#g-tide');
  const gTideSub = $('#g-tide-sub');
  if (gTide && tides) {
    const nowMs = Date.now();
    const next = tides.hilo.find(t => new Date(t.eventDate).getTime() > nowMs);
    // Current level from the wlp curve — pick the sample closest to now; fall
    // back to the next hi/lo if the curve isn't available.
    let currentM: number | null = null;
    if (tides.curve && tides.curve.length > 0) {
      let best = tides.curve[0]!;
      let bestDist = Math.abs(new Date(best.eventDate).getTime() - nowMs);
      for (const c of tides.curve) {
        const d = Math.abs(new Date(c.eventDate).getTime() - nowMs);
        if (d < bestDist) { bestDist = d; best = c; }
      }
      currentM = best.value;
    }
    if (next) {
      const prev = [...tides.hilo].reverse().find(t => new Date(t.eventDate).getTime() <= nowMs);
      const rising = prev ? next.value > prev.value : null;
      const arrow = rising === null ? '' : rising ? '▲' : '▼';
      const verb = rising === null ? '' : rising ? 'rising to' : 'falling to';
      const shownM = currentM !== null ? currentM : next.value;
      gTide.innerHTML = `${arrow} ${shownM.toFixed(1)}<small> m</small>`;
      if (gTideSub) {
        gTideSub.innerHTML = `${verb} <b>${next.value.toFixed(2)} m</b> at <b>${fmtTime(next.eventDate, tz)}</b>`;
      }
    }
    gTide.classList.remove('skel');
  }

  const times = SunCalc.getTimes(new Date(), station.center.lat, station.center.lon);
  const nowD = new Date();
  const isDay = nowD > times.sunrise && nowD < times.sunset;
  const gSun = $('#g-sun');
  if (gSun) {
    gSun.innerHTML = isDay ? '☀️ Day' : '🌙 Night';
    gSun.classList.remove('skel');
  }
  const gSunSub = $('#g-sun-sub');
  if (gSunSub) {
    gSunSub.innerHTML = isDay
      ? `sunset <b>${fmtTime(times.sunset, tz)}</b>`
      : `sunrise <b>${fmtTime(times.sunrise, tz)}</b>`;
  }
}

function renderWindTable(rows: WindPointResponse[], live: LiveWindPayload | null): void {
  const table = $<HTMLTableElement>('#wind-table');
  if (!table) return;
  const nearbyLive = getNearbyLiveStations(live, station.center, { maxKm: 25, limit: 12 });

  const liveRows = nearbyLive.map(({ station: s }) => {
    const spd = s.wind_speed_kn === null ? null : Math.round(s.wind_speed_kn);
    const g   = s.wind_gust_kn === null ? '—' : Math.round(s.wind_gust_kn);
    const cls = spd === null ? 'g' : spd >= 22 ? 'a' : spd >= 15 ? 'w' : 'g';
    const dirCell = s.wind_dir_deg === null ? '—' :
      `<span class="arrow" style="transform:rotate(${s.wind_dir_deg + 90}deg)">→</span> ${compass(s.wind_dir_deg)}`;
    return `<tr>`
      + `<td>${s.name}</td>`
      + `<td class="num"><span class="chip ${cls}">${spd ?? '—'}</span></td>`
      + `<td class="num">${g}</td>`
      + `<td>${dirCell}</td>`
      + `<td class="tiny">${fmtTime(s.obs_time, tz)}</td>`
      + `</tr>`;
  });

  const forecastRows = station.points.flatMap((p, i) => {
    if (pointHasNearbyLive(p, nearbyLive, 2)) return [];
    const c = rows[i]?.current;
    if (!c) return [`<tr><td>${p.name}</td><td colspan="3" class="err">n/a</td><td class="tiny muted">forecast</td></tr>`];
    const spd = Math.round(c.wind_speed_10m);
    const g = Math.round(c.wind_gusts_10m);
    const cls = spd >= 22 ? 'a' : spd >= 15 ? 'w' : 'g';
    return [`<tr><td>${p.name}</td>`
      + `<td class="num"><span class="chip ${cls}">${spd}</span></td>`
      + `<td class="num">${g}</td>`
      + `<td><span class="arrow" style="transform:rotate(${c.wind_direction_10m + 90}deg)">→</span> ${compass(c.wind_direction_10m)}</td>`
      + `<td class="tiny muted">forecast</td></tr>`];
  });

  const tbody = table.querySelector('tbody');
  if (tbody) tbody.innerHTML = [...liveRows, ...forecastRows].join('') || `<tr><td colspan="5" class="muted">No wind data available.</td></tr>`;
  const r = $('#wind-loc-r');
  if (r) r.textContent = 'knots @10m';
}

let lastWindRows: WindPointResponse[] | null = null;
let lastLiveWind: LiveWindPayload | null = null;

type CurrentsMapState = {
  L: typeof LeafletNS;
  map: LeafletNS.Map;
  markers: Map<string, LeafletNS.Marker>;
  tideMarkers: Map<string, LeafletNS.Marker>;
  windMarkers: Map<string, LeafletNS.Marker>;
  fitted: boolean;
};
let currentsMapState: CurrentsMapState | null = null;
let currentsMapInitInFlight: Promise<CurrentsMapState | null> | null = null;
let lastCurrents: CurrentsPayload | null = null;
let lastTidesMap: TideMapPayload | null = null;
let currentsOffsetSec = 0;  // 0 = now; positive = forward look-ahead

type BarbEntry = {
  key: string;
  lat: number;
  lon: number;
  dirDeg: number;
  speedKn: number;
  measured: boolean;
  popupHtml: string;
};

function buildBarbEntries(rows: WindPointResponse[], live: LiveWindPayload | null): BarbEntry[] {
  const nearbyLive = getNearbyLiveStations(live, station.center, { maxKm: 25, limit: 12 });
  const out: BarbEntry[] = [];

  for (const { station: s } of nearbyLive) {
    if (s.wind_dir_deg === null || s.wind_speed_kn === null) continue;
    const timeStr = fmtTime(s.obs_time, tz);
    const gust = s.wind_gust_kn === null ? '—' : String(Math.round(s.wind_gust_kn));
    out.push({
      key: `live:${s.id}`,
      lat: s.lat,
      lon: s.lon,
      dirDeg: s.wind_dir_deg,
      speedKn: s.wind_speed_kn,
      measured: true,
      popupHtml:
        `<div class="wm-popup"><b>${s.name}</b>`
        + `<div>${Math.round(s.wind_speed_kn)} kn · gust ${gust} kn</div>`
        + `<div>${compass(s.wind_dir_deg)} · ${Math.round(s.wind_dir_deg)}°</div>`
        + `<div class="tiny muted">${s.source.toUpperCase()} · ${timeStr}</div></div>`,
    });
  }

  station.points.forEach((p, i) => {
    if (pointHasNearbyLive(p, nearbyLive, 2)) return;
    const c = rows[i]?.current;
    if (!c) return;
    out.push({
      key: `fcst:${p.name}`,
      lat: p.lat,
      lon: p.lon,
      dirDeg: c.wind_direction_10m,
      speedKn: c.wind_speed_10m,
      measured: false,
      popupHtml:
        `<div class="wm-popup"><b>${p.name}</b>`
        + `<div>${Math.round(c.wind_speed_10m)} kn · gust ${Math.round(c.wind_gusts_10m)} kn</div>`
        + `<div>${compass(c.wind_direction_10m)} · ${Math.round(c.wind_direction_10m)}°</div>`
        + `<div class="tiny muted">forecast · Open-Meteo</div></div>`,
    });
  });

  return out;
}

function applyArrowScale(container: HTMLElement, map: LeafletNS.Map, baseZoom: number): void {
  const z = map.getZoom();
  const scale = Math.min(1.3, Math.max(0.35, Math.pow(2, (z - baseZoom) * 0.5)));
  container.style.setProperty('--arrow-scale', scale.toFixed(3));
}

async function ensureCurrentsMap(container: HTMLElement): Promise<CurrentsMapState | null> {
  if (currentsMapState) return currentsMapState;
  if (currentsMapInitInFlight) return currentsMapInitInFlight;
  currentsMapInitInFlight = (async () => {
    const L = (await import('leaflet')) as unknown as typeof LeafletNS;
    container.querySelector('.currents-map-skel')?.remove();
    const c = station.currents?.center ?? { lat: station.windy.lat, lon: station.windy.lon };
    const zoom = station.currents?.zoom ?? station.windy.zoom;
    const map = L.map(container, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    map.setView([c.lat, c.lon], zoom);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);
    applyArrowScale(container, map, zoom);
    map.on('zoomend', () => applyArrowScale(container, map, zoom));
    // When a popup opens on a marker, close its hover tooltip so both don't show at once.
    map.on('popupopen', (e: LeafletNS.PopupEvent) => {
      const layer = (e.popup as unknown as { _source?: LeafletNS.Marker })._source;
      layer?.closeTooltip?.();
    });
    currentsMapState = { L, map, markers: new Map(), tideMarkers: new Map(), windMarkers: new Map(), fitted: false };
    return currentsMapState;
  })();
  const s = await currentsMapInitInFlight;
  currentsMapInitInFlight = null;
  return s;
}

type CurrentsEntry = {
  key: string;
  lat: number;
  lon: number;
  speedKn: number;
  dirDeg: number;
  tint: ReturnType<typeof currentTint>;
  secondary: boolean;
  popupHtml: string;
};

function buildCurrentsEntries(payload: CurrentsPayload, nowMs: number): CurrentsEntry[] {
  const out: CurrentsEntry[] = [];
  const build = (
    s: ReferenceCurrentStation | SecondaryCurrentStation,
    secondary: boolean,
  ): void => {
    const { speedKn, phase } = interpolateCurrentAt(s.events, nowMs);
    const floodDir = s.floodDirection;
    const ebbDir = s.ebbDirection;
    let dirDeg = 0;
    if (phase === 'flood' && floodDir !== null) dirDeg = floodDir;
    else if (phase === 'ebb' && ebbDir !== null) dirDeg = ebbDir;
    else if (floodDir !== null) dirDeg = floodDir;

    const nx = nextExtremum(s.events, nowMs);
    const nxLine = nx
      ? `next max ${nx.phase}: <b>${nx.value.toFixed(1)} kn</b> at <b>${fmtTime(nx.t, tz)}</b>`
      : 'no upcoming extremum in window';
    const currentLine = phase === 'slack' || speedKn < 0.5
      ? `<div>slack</div>`
      : `<div><b>${speedKn.toFixed(1)} kn</b> · ${phase} · ${compass(dirDeg)} · ${Math.round(dirDeg)}°</div>`;
    const noteLine = (s as SecondaryCurrentStation).notes
      ? `<div class="tiny muted">${(s as SecondaryCurrentStation).notes}</div>`
      : '';
    const kindLine = secondary
      ? `<div class="tiny muted">derived from ${(s as SecondaryCurrentStation).referenceCode}</div>`
      : `<div class="tiny muted">reference · CHS IWLS</div>`;

    out.push({
      key: (secondary ? 'sec:' : 'ref:') + s.id,
      lat: s.lat,
      lon: s.lon,
      speedKn,
      dirDeg,
      tint: currentTint(speedKn),
      secondary,
      popupHtml:
        `<div class="wm-popup"><b>${s.name}</b>`
        + currentLine
        + `<div>${nxLine}</div>`
        + kindLine
        + noteLine
        + `</div>`,
    });
  };
  for (const r of payload.reference_stations) build(r, false);
  for (const s of payload.secondary_stations) build(s, true);
  return out;
}

function fmtOffset(sec: number): string {
  if (sec === 0) return 'now';
  const abs = Math.abs(sec);
  const h = Math.floor(abs / 3600);
  const m = Math.round((abs - h * 3600) / 60);
  const sign = sec > 0 ? '+' : '−';
  return h > 0 ? `${sign}${h}h ${m.toString().padStart(2, '0')}m` : `${sign}${m}m`;
}

async function renderCurrents(payload: CurrentsPayload): Promise<void> {
  if (station.currents?.show === false) return;
  const container = $<HTMLDivElement>('#currents-map');
  if (!container) return;
  if (container.offsetWidth === 0 || container.offsetHeight === 0) return;

  const targetMs = Date.now() + currentsOffsetSec * 1000;
  const entries = buildCurrentsEntries(payload, targetMs);
  const state = await ensureCurrentsMap(container);
  if (!state) return;
  const { L, map, markers } = state;
  const canHover = window.matchMedia('(hover: hover)').matches;

  const seen = new Set<string>();
  for (const e of entries) {
    seen.add(e.key);
    const html = currentArrowSvg({ speedKn: e.speedKn, dirDeg: e.dirDeg, tint: e.tint, secondary: e.secondary });
    const icon = L.divIcon({
      html,
      className: `current-arrow-icon ${e.secondary ? 'ca-sec-icon' : 'ca-ref-icon'} ca-${e.tint}`,
      iconSize: [60, 72],
      iconAnchor: [30, 60],
    });
    const existing = markers.get(e.key);
    if (existing) {
      existing.setIcon(icon);
      existing.setPopupContent(e.popupHtml);
      const tt = existing.getTooltip();
      if (tt) tt.setContent(e.popupHtml);
    } else {
      const m = L.marker([e.lat, e.lon], { icon, riseOnHover: true });
      m.bindPopup(e.popupHtml, { className: 'wm-popup-wrap', closeButton: true });
      if (canHover) {
        m.bindTooltip(e.popupHtml, {
          direction: 'top',
          offset: [0, -44],
          className: 'wm-hover',
          opacity: 1,
        });
      }
      m.addTo(map);
      markers.set(e.key, m);
    }
  }
  for (const [key, m] of markers) {
    if (!seen.has(key)) {
      m.remove();
      markers.delete(key);
    }
  }

  const r = $('#currents-r');
  if (r) {
    const refCount = payload.reference_stations.length;
    const secCount = payload.secondary_stations.length;
    const label = currentsOffsetSec === 0
      ? `at <b>${fmtTime(targetMs, tz)}</b>`
      : `at <b>${fmtTime(targetMs, tz)}</b> <span class="warn-text">(${fmtOffset(currentsOffsetSec)})</span>`;
    r.innerHTML = `${refCount} reference · ${secCount} derived · ${label}`;
  }
  const sliderT = $('#currents-slider-t');
  if (sliderT) {
    sliderT.textContent = fmtOffset(currentsOffsetSec);
    sliderT.classList.toggle('away', currentsOffsetSec !== 0);
  }
  const foot = $('#currents-foot');
  if (foot) {
    foot.innerHTML =
      `Predictions from CHS IWLS · ${payload.tables_edition} · ebb = flood + 180°`;
  }
}

async function renderTidesMap(payload: TideMapPayload): Promise<void> {
  if (station.currents?.show === false) return;
  const container = $<HTMLDivElement>('#currents-map');
  if (!container) return;
  if (container.offsetWidth === 0 || container.offsetHeight === 0) return;

  const state = await ensureCurrentsMap(container);
  if (!state) return;
  const { L, map, tideMarkers } = state;
  const canHover = window.matchMedia('(hover: hover)').matches;
  const targetMs = Date.now() + currentsOffsetSec * 1000;

  const seen = new Set<string>();
  for (const s of payload.stations) {
    const t = tideStateAt(s.events, targetMs);
    if (!t) continue;
    const key = `tide:${s.id}`;
    seen.add(key);
    const html = tideMarkerSvg(t);
    const dir = t.rising ? 'rising' : 'falling';
    const nextLabel = t.next.value > t.prev.value ? 'high' : 'low';
    const popupHtml =
      `<div class="wm-popup"><b>${s.name}</b>`
      + `<div><b>${t.levelM.toFixed(2)} m</b> · ${dir}</div>`
      + `<div>next ${nextLabel}: <b>${t.next.value.toFixed(2)} m</b> at <b>${fmtTime(t.next.t, tz)}</b></div>`
      + `<div class="tiny muted">tide station · CHS IWLS · ${s.code}</div>`
      + `</div>`;
    const icon = L.divIcon({
      html,
      className: `tide-marker-icon tm-${t.rising ? 'rising' : 'falling'}`,
      iconSize: [22, 56],
      iconAnchor: [11, 52],
    });
    const existing = tideMarkers.get(key);
    if (existing) {
      existing.setIcon(icon);
      existing.setPopupContent(popupHtml);
      const tt = existing.getTooltip();
      if (tt) tt.setContent(popupHtml);
    } else {
      const m = L.marker([s.lat, s.lon], { icon, riseOnHover: true });
      m.bindPopup(popupHtml, { className: 'wm-popup-wrap', closeButton: true });
      if (canHover) {
        m.bindTooltip(popupHtml, {
          direction: 'top',
          offset: [0, -50],
          className: 'wm-hover',
          opacity: 1,
        });
      }
      m.addTo(map);
      tideMarkers.set(key, m);
    }
  }
  for (const [key, m] of tideMarkers) {
    if (!seen.has(key)) {
      m.remove();
      tideMarkers.delete(key);
    }
  }
}

async function renderCombinedWind(rows: WindPointResponse[], live: LiveWindPayload | null): Promise<void> {
  if (station.currents?.show === false) return;
  const container = $<HTMLDivElement>('#currents-map');
  if (!container) return;
  if (container.offsetWidth === 0 || container.offsetHeight === 0) return;

  const state = await ensureCurrentsMap(container);
  if (!state) return;
  const { L, map, windMarkers } = state;
  const canHover = window.matchMedia('(hover: hover)').matches;

  // Look-ahead suppresses live observations — they're always "now".
  const suppressLive = currentsOffsetSec !== 0;
  const entries = buildBarbEntries(rows, suppressLive ? null : live);

  const seen = new Set<string>();
  for (const e of entries) {
    seen.add(e.key);
    const tint = speedTint(e.speedKn);
    const html = windBarbSvg({ speedKn: e.speedKn, dirDeg: e.dirDeg, measured: e.measured, tint });
    const icon = L.divIcon({
      html,
      className: `wind-barb-icon ${e.measured ? 'wb-live' : 'wb-fcst'} wb-${tint}`,
      iconSize: [44, 56],
      iconAnchor: [22, 46],
    });
    const existing = windMarkers.get(e.key);
    if (existing) {
      existing.setIcon(icon);
      existing.setPopupContent(e.popupHtml);
      const tt = existing.getTooltip();
      if (tt) tt.setContent(e.popupHtml);
    } else {
      const m = L.marker([e.lat, e.lon], { icon, riseOnHover: true });
      m.bindPopup(e.popupHtml, { className: 'wm-popup-wrap', closeButton: true });
      if (canHover) {
        m.bindTooltip(e.popupHtml, {
          direction: 'top',
          offset: [0, -30],
          className: 'wm-hover',
          opacity: 1,
        });
      }
      m.addTo(map);
      windMarkers.set(e.key, m);
    }
  }
  for (const [key, m] of windMarkers) {
    if (!seen.has(key)) {
      m.remove();
      windMarkers.delete(key);
    }
  }
}

function renderTide(tides: TideBundle): void {
  const now = Date.now();

  const table = $<HTMLTableElement>('#tide-table');
  if (table) {
    const upcoming = tides.hilo.filter(t => new Date(t.eventDate).getTime() > now - 3600e3).slice(0, 6);
    const tbody = table.querySelector('tbody');
    if (tbody) {
      tbody.innerHTML = upcoming.map(t => {
        const isHigh = t.value > 1.7;
        return `<tr><td>${isHigh ? '⬆ High' : '⬇ Low'}</td>`
          + `<td class="num">${t.value.toFixed(2)} m</td>`
          + `<td class="num">${fmtTime(t.eventDate, tz)}</td></tr>`;
      }).join('') || '<tr><td colspan="3" class="muted">No data</td></tr>';
    }
  }
  const r = $('#tide-r');
  if (r) r.textContent = 'next 36 h';

  const chart = $('#tide-chart');
  if (!chart) return;
  const pts = (tides.curve || []).map(d => ({ t: new Date(d.eventDate).getTime(), v: d.value }));
  if (pts.length <= 2) return;

  const w = 100, h = 42;
  const xs = pts.map(p => p.t);
  const vs = pts.map(p => p.v);
  const minT = Math.min(...xs), maxT = Math.max(...xs);
  const minV = Math.min(...vs), maxV = Math.max(...vs);
  const X = (t: number) => ((t - minT) / (maxT - minT)) * w;
  const Y = (v: number) => h - 2 - ((v - minV) / (maxV - minV || 1)) * (h - 4);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ');
  const nowX = X(now);

  chart.innerHTML =
    `<div class="tide-chart-wrap" style="position:relative;touch-action:pan-y;cursor:crosshair">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:64px;display:block">
        <path d="${d} L ${w} ${h} L 0 ${h} Z" fill="rgba(55,182,255,.14)"/>
        <path d="${d}" fill="none" stroke="#37b6ff" stroke-width="1.4"/>
        <line x1="${nowX}" y1="0" x2="${nowX}" y2="${h}" stroke="#ffcb47" stroke-width="0.8" stroke-dasharray="2 2"/>
        <line class="tide-hover-line" x1="0" y1="0" x2="0" y2="${h}" stroke="#eaf2fb" stroke-width="0.6" stroke-dasharray="1.5 1.5" style="display:none"/>
        <circle class="tide-hover-dot" cx="0" cy="0" r="1.6" fill="#eaf2fb" style="display:none"/>
      </svg>
      <div class="tide-tooltip" style="position:absolute;top:-30px;left:0;transform:translateX(-50%);background:rgba(0,0,0,.82);color:var(--ink);padding:3px 8px;border-radius:6px;font-size:12px;font-variant-numeric:tabular-nums;pointer-events:none;white-space:nowrap;display:none;border:1px solid var(--line)"></div>
     </div>
     <div class="tiny muted" style="position:relative;height:1.4em">
       <span style="position:absolute;left:0">${fmtTime(pts[0]!.t, tz)}</span>
       <span style="position:absolute;left:${nowX.toFixed(2)}%;transform:translateX(-50%);color:var(--warn)">now</span>
       <span style="position:absolute;right:0">${fmtTime(pts[pts.length - 1]!.t, tz)}</span>
     </div>`;

  const wrap = chart.querySelector<HTMLDivElement>('.tide-chart-wrap');
  const line = wrap?.querySelector<SVGLineElement>('.tide-hover-line');
  const dot = wrap?.querySelector<SVGCircleElement>('.tide-hover-dot');
  const tip = wrap?.querySelector<HTMLDivElement>('.tide-tooltip');
  if (!wrap || !line || !dot || !tip) return;

  const showAt = (clientX: number): void => {
    const rect = wrap.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetT = minT + frac * (maxT - minT);
    let nearest = pts[0]!;
    let nd = Infinity;
    for (const p of pts) {
      const dist = Math.abs(p.t - targetT);
      if (dist < nd) { nd = dist; nearest = p; }
    }
    const hx = X(nearest.t), hy = Y(nearest.v);
    line.setAttribute('x1', String(hx));
    line.setAttribute('x2', String(hx));
    dot.setAttribute('cx', String(hx));
    dot.setAttribute('cy', String(hy));
    line.style.display = dot.style.display = 'block';
    tip.textContent = `${nearest.v.toFixed(2)} m · ${fmtTime(nearest.t, tz)}`;
    tip.style.display = 'block';
    const tipHalf = tip.offsetWidth / 2;
    const clampedX = Math.max(tipHalf, Math.min(rect.width - tipHalf, frac * rect.width));
    tip.style.left = `${clampedX}px`;
  };
  const hide = (): void => {
    line.style.display = dot.style.display = tip.style.display = 'none';
  };
  wrap.addEventListener('pointerdown', e => showAt(e.clientX));
  wrap.addEventListener('pointermove', e => showAt(e.clientX));
  wrap.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
}

function renderSun(): void {
  const sunTable = $<HTMLTableElement>('#sun-table');
  if (!sunTable) return;
  const { lat, lon } = station.center;
  const d = new Date();
  const t = SunCalc.getTimes(d, lat, lon);
  const rows: [string, Date][] = [
    ['Nautical dawn', t.nauticalDawn],
    ['Civil dawn (first light)', t.dawn],
    ['Sunrise', t.sunrise],
    ['Solar noon', t.solarNoon],
    ['Sunset', t.sunset],
    ['Civil dusk (last light)', t.dusk],
    ['Nautical dusk', t.nauticalDusk],
  ];
  const mi = SunCalc.getMoonIllumination(d);
  const phase = mi.phase;
  const pn = phase < .03 || phase > .97 ? 'New'
    : phase < .22 ? 'Waxing crescent'
    : phase < .28 ? 'First quarter'
    : phase < .47 ? 'Waxing gibbous'
    : phase < .53 ? 'Full'
    : phase < .72 ? 'Waning gibbous'
    : phase < .78 ? 'Last quarter'
    : 'Waning crescent';
  sunTable.innerHTML = '<tbody>'
    + rows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v && !isNaN(v.getTime()) ? fmtTime(v, tz) : '—'}</td></tr>`).join('')
    + `<tr><td>Moon</td><td class="num">${pn} · ${Math.round(mi.fraction * 100)}%</td></tr>`
    + '</tbody>';
}

function renderHourly(wx: WeatherResponse): void {
  const strip = $('#hourly');
  if (!strip) return;
  const H = wx.hourly;
  const now = Date.now();
  let start = H.time.findIndex(t => new Date(t).getTime() >= now - 3600e3);
  if (start < 0) start = 0;
  const idx: number[] = [];
  for (let i = start; i < start + 16 && i < H.time.length; i++) idx.push(i);
  strip.innerHTML = idx.map(i => {
    const [em] = wmo(H.weather_code[i]!);
    const vis = H.visibility[i];
    const visStr = vis != null ? `${Math.round(vis / 1000)}km` : '—';
    return `<div class="hcol">
      <div class="t">${fmtTime(H.time[i]!, tz)}</div>
      <div class="em">${em}</div>
      <div class="v">${Math.round(H.wind_speed_10m[i]!)}<span class="muted tiny"> kn</span></div>
      <div class="w">g${Math.round(H.wind_gusts_10m[i]!)} ${compass(H.wind_direction_10m[i]!)}</div>
      <div class="w">${Math.round(H.temperature_2m[i]!)}° · vis ${visStr}</div>
    </div>`;
  }).join('');
}

function renderDaily(wx: WeatherResponse, marine: MarineResponse | null): void {
  const daily = $('#daily');
  if (daily) {
    const D = wx.daily;
    daily.innerHTML = D.time.map((t, i) => {
      const [em] = wmo(D.weather_code[i]!);
      return `<div class="d">
        <div class="dow">${i === 0 ? 'Today' : fmtDay(t, tz)}</div>
        <div class="em">${em}</div>
        <div class="rng">${Math.round(D.temperature_2m_min[i]!)}° – <b>${Math.round(D.temperature_2m_max[i]!)}°</b>
          <span class="muted tiny"> · rain ${D.precipitation_probability_max[i] ?? 0}%</span></div>
        <div class="wind">${Math.round(D.wind_speed_10m_max[i]!)} g${Math.round(D.wind_gusts_10m_max[i]!)} kn ${compass(D.wind_direction_10m_dominant[i]!)}</div>
      </div>`;
    }).join('');
  }

  const marineTable = $<HTMLTableElement>('#marine-table');
  if (!marineTable) return;
  if (marine?.daily?.wave_height_max) {
    const M = marine.daily;
    marineTable.innerHTML = '<thead><tr><th>Day</th><th class="num">Wave max</th><th class="num">Period</th><th>Dir</th></tr></thead><tbody>'
      + M.time.map((t, i) => {
        const wh = M.wave_height_max[i];
        const wp = M.wave_period_max?.[i];
        const wd = M.wave_direction_dominant?.[i];
        return `<tr><td>${i === 0 ? 'Today' : fmtDay(t, tz)}</td>
          <td class="num">${wh != null ? wh.toFixed(1) + ' m' : '—'}</td>
          <td class="num">${wp != null ? Math.round(wp) + ' s' : '—'}</td>
          <td>${wd != null ? compass(wd) : '—'}</td></tr>`;
      }).join('')
      + '</tbody>';
    const mr = $('#marine-r');
    if (mr) mr.textContent = station.marinePoint.name;
  } else {
    marineTable.innerHTML = `<tbody><tr><td class="muted">No wave-model data at this coastal point — use the ECCC marine forecast for sea state.</td></tr></tbody>`;
  }
}

function setUpdated(ok: boolean): void {
  const el = $('#updated');
  if (!el) return;
  el.innerHTML = ok
    ? `Updated <b>${fmtNow(tz)}</b>`
    : `<span class="err">Update failed</span> · showing ${lastGood ? 'data from ' + lastGood : '—'}`;
}

async function refresh(): Promise<void> {
  const btn = $<HTMLButtonElement>('#refreshBtn');
  btn?.classList.add('spin');

  const results = await Promise.allSettled([
    loadWeather(station),
    loadWindByLocation(station),
    loadMarine(station),
    loadTides(station),
    loadLiveWind(),
    station.currents?.show === false ? Promise.resolve(null) : loadCurrents(),
    station.currents?.show === false ? Promise.resolve(null) : loadTidesMap(),
  ]);
  const [wxR, windR, marR, tideR, liveR, curR, tmR] = results;
  const wx = wxR!.status === 'fulfilled' ? wxR!.value as WeatherResponse : null;
  const marine = marR!.status === 'fulfilled' ? marR!.value as MarineResponse : null;
  const tides = tideR!.status === 'fulfilled' ? tideR!.value as TideBundle : null;
  const live = liveR!.status === 'fulfilled' ? liveR!.value as LiveWindPayload | null : null;
  const currents = curR!.status === 'fulfilled' ? curR!.value as CurrentsPayload | null : null;
  const tidesMap = tmR!.status === 'fulfilled' ? tmR!.value as TideMapPayload | null : null;

  try {
    if (wx && tides) renderGlance(wx, marine, tides, live);
    if (windR!.status === 'fulfilled') {
      lastWindRows = windR!.value as WindPointResponse[];
      lastLiveWind = live;
      renderWindTable(lastWindRows, live);
      void renderCombinedWind(lastWindRows, live);
    }
    if (tides) renderTide(tides);
    if (currents) {
      lastCurrents = currents;
      void renderCurrents(currents);
    }
    if (tidesMap) {
      lastTidesMap = tidesMap;
      void renderTidesMap(tidesMap);
    }
    renderSun();
    if (wx) renderHourly(wx);
    if (wx) renderDaily(wx, marine);

    const maxWind = wx ? Math.round(wx.current.wind_gusts_10m) : 0;
    const wb = $('#warnbar');
    const wt = $('#warntext');
    if (wb) {
      if (maxWind >= 25) {
        wb.className = 'warnbar show alert';
        if (wt) wt.innerHTML = `⚠ Gusts to <b>${maxWind} kn</b> at ${station.labels.marineWarningLocation} right now — check the ECCC marine forecast for active warnings.`;
      } else {
        wb.className = 'warnbar';
      }
    }
  } catch (e) {
    console.error(e);
  }

  const anyOk = results.some(r => r.status === 'fulfilled');
  if (anyOk) lastGood = fmtNow(tz);
  setUpdated(results.every(r => r.status === 'fulfilled'));
  results
    .filter(r => r.status === 'rejected')
    .forEach(r => console.warn('source failed:', (r as PromiseRejectedResult).reason?.message ?? (r as PromiseRejectedResult).reason));

  btn?.classList.remove('spin');
}

$<HTMLButtonElement>('#refreshBtn')?.addEventListener('click', () => { void refresh(); });

(function wireCurrentsControls(): void {
  const input = document.getElementById('currents-slider-input') as HTMLInputElement | null;
  const nowBtn = document.getElementById('currents-now-btn');
  if (!input || !nowBtn) return;

  const applyOffset = (sec: number): void => {
    currentsOffsetSec = sec;
    input.value = String(sec);
    if (lastCurrents) void renderCurrents(lastCurrents);
    if (lastTidesMap) void renderTidesMap(lastTidesMap);
    if (lastWindRows) void renderCombinedWind(lastWindRows, lastLiveWind);
  };

  input.addEventListener('input', () => applyOffset(Number(input.value)));
  nowBtn.addEventListener('click', () => applyOffset(0));
})();

void refresh();
setInterval(() => { void refresh(); }, station.refreshMs);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refresh();
});
