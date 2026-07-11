import SunCalc from 'suncalc';
import type { StationConfig } from '../lib/stations';
import { fmtTime, fmtDay, fmtNow, compass, wmo } from '../lib/format';
import {
  loadWeather, loadWindByLocation, loadMarine, loadTides,
  type WeatherResponse, type WindPointResponse, type MarineResponse, type TideBundle,
} from '../lib/sources';

const station: StationConfig = JSON.parse(
  document.getElementById('station-config')!.textContent!,
);
const tz = station.tz;

const $ = <T extends Element = HTMLElement>(sel: string) =>
  document.querySelector<T>(sel);

let lastGood: string | null = null;

function renderGlance(wx: WeatherResponse, marine: MarineResponse | null, tides: TideBundle | null): void {
  const cur = wx.current;

  const gWind = $('#g-wind');
  if (gWind) {
    gWind.innerHTML = `${Math.round(cur.wind_speed_10m)}<small> kn</small>`;
    gWind.classList.remove('skel');
  }
  const gWindSub = $('#g-wind-sub');
  if (gWindSub) {
    gWindSub.innerHTML =
      `<span class="arrow" style="transform:rotate(${cur.wind_direction_10m + 90}deg)">→</span>`
      + ` from <b>${compass(cur.wind_direction_10m)}</b> · gust <b>${Math.round(cur.wind_gusts_10m)}</b>`;
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
    const now = new Date();
    const next = tides.hilo.find(t => new Date(t.eventDate) > now);
    if (next) {
      const prev = [...tides.hilo].reverse().find(t => new Date(t.eventDate) <= now);
      const rising = prev ? next.value > prev.value : null;
      const arrow = rising === null ? '' : rising ? '▲' : '▼';
      const verb = rising === null ? '' : rising ? 'rising to' : 'falling to';
      gTide.innerHTML = `${arrow} ${next.value.toFixed(1)}<small> m</small>`;
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

function renderWindTable(rows: WindPointResponse[]): void {
  const table = $<HTMLTableElement>('#wind-table');
  if (!table) return;
  const body = station.points.map((p, i) => {
    const c = rows[i]?.current;
    if (!c) return `<tr><td>${p.name}</td><td colspan="3" class="err">n/a</td></tr>`;
    const spd = Math.round(c.wind_speed_10m);
    const g = Math.round(c.wind_gusts_10m);
    const cls = spd >= 22 ? 'a' : spd >= 15 ? 'w' : 'g';
    return `<tr><td>${p.name}</td>`
      + `<td class="num"><span class="chip ${cls}">${spd}</span></td>`
      + `<td class="num">${g}</td>`
      + `<td><span class="arrow" style="transform:rotate(${c.wind_direction_10m + 90}deg)">→</span> ${compass(c.wind_direction_10m)}</td></tr>`;
  }).join('');
  const tbody = table.querySelector('tbody');
  if (tbody) tbody.innerHTML = body;
  const r = $('#wind-loc-r');
  if (r) r.textContent = 'knots @10m';
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
  ]);
  const [wxR, windR, marR, tideR] = results;
  const wx = wxR!.status === 'fulfilled' ? wxR!.value as WeatherResponse : null;
  const marine = marR!.status === 'fulfilled' ? marR!.value as MarineResponse : null;
  const tides = tideR!.status === 'fulfilled' ? tideR!.value as TideBundle : null;

  try {
    if (wx && tides) renderGlance(wx, marine, tides);
    if (windR!.status === 'fulfilled') renderWindTable(windR!.value as WindPointResponse[]);
    if (tides) renderTide(tides);
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
void refresh();
setInterval(() => { void refresh(); }, station.refreshMs);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refresh();
});
