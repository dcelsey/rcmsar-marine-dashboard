import type { CurrentEvent } from './sources';

export type CurrentTint = 'calm' | 'green' | 'yellow' | 'orange' | 'redorange' | 'red';

export function currentTint(speedKn: number): CurrentTint {
  if (speedKn < 0.2) return 'calm';
  if (speedKn < 1.5) return 'green';
  if (speedKn < 2.5) return 'yellow';
  if (speedKn < 3.5) return 'orange';
  if (speedKn < 5.0) return 'redorange';
  return 'red';
}

export type CurrentPhase = 'flood' | 'ebb' | 'slack';

// Cosine ease between adjacent SLACK (magnitude 0) and EXTREMA_* (magnitude at peak).
// Direction (set) is picked in the caller from the station's flood/ebb metadata
// according to the returned phase.
export function interpolateCurrentAt(
  events: CurrentEvent[],
  tMs: number,
): { speedKn: number; phase: CurrentPhase } {
  if (events.length === 0) return { speedKn: 0, phase: 'slack' };

  // Find bracketing events.
  let before: CurrentEvent | null = null;
  let after: CurrentEvent | null = null;
  for (const e of events) {
    if (e.t <= tMs) before = e;
    else { after = e; break; }
  }
  if (!before && after) return { speedKn: 0, phase: 'slack' };
  if (!after) return { speedKn: 0, phase: 'slack' };

  const b = before!;
  const a = after;

  const bMag = Math.abs(b.value);
  const aMag = Math.abs(a.value);
  const span = a.t - b.t;
  const frac = span > 0 ? (tMs - b.t) / span : 0;
  const eased = 0.5 * (1 - Math.cos(Math.PI * frac));
  const speedKn = bMag + (aMag - bMag) * eased;

  // Phase resolves from whichever of the bracket is the extremum. Two slacks in
  // a row shouldn't happen in wcp1-events, but if it does, fall back to slack.
  let phase: CurrentPhase = 'slack';
  if (a.qualifier === 'EXTREMA_FLOOD' || b.qualifier === 'EXTREMA_FLOOD') phase = 'flood';
  else if (a.qualifier === 'EXTREMA_EBB' || b.qualifier === 'EXTREMA_EBB') phase = 'ebb';

  return { speedKn, phase };
}

export function nextExtremum(
  events: CurrentEvent[],
  tMs: number,
): { t: number; value: number; phase: 'flood' | 'ebb' } | null {
  for (const e of events) {
    if (e.t <= tMs) continue;
    if (e.qualifier === 'EXTREMA_FLOOD') return { t: e.t, value: Math.abs(e.value), phase: 'flood' };
    if (e.qualifier === 'EXTREMA_EBB')   return { t: e.t, value: Math.abs(e.value), phase: 'ebb' };
  }
  return null;
}

export type CurrentArrowOpts = {
  speedKn: number;
  dirDeg: number;
  tint: CurrentTint;
  secondary: boolean;   // dotted ring for derived stations
};

// Arrow points along the direction of flow (set). Length scales with speed
// (clamped 10–52 px). Slack (< 0.2 kt) renders as a hollow ring.
export function currentArrowSvg({ speedKn, dirDeg, tint, secondary }: CurrentArrowOpts): string {
  const tintCls = `ca-${tint}`;
  const kindCls = secondary ? 'ca-sec' : 'ca-ref';
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -60 60 72" width="60" height="72" class="ca ${kindCls} ${tintCls}" aria-hidden="true">`;
  const close = `</svg>`;

  if (speedKn < 0.2) {
    const ring = `<circle cx="0" cy="0" r="7" fill="currentColor" stroke="#000" stroke-width="1.2"/>`;
    return open + ring + close;
  }

  const len = Math.min(52, Math.max(10, 10 + speedKn * 6));
  const headW = 8;
  const headH = 10;
  const shaftW = 5;

  // One combined arrow polygon (tail rect + head triangle) so the black outline
  // wraps the whole shape cleanly with no interior seam.
  const points = [
    `${ shaftW/2},0`,
    `${ shaftW/2},${-len}`,
    `${ headW},${-len}`,
    `0,${-len - headH}`,
    `${-headW},${-len}`,
    `${-shaftW/2},${-len}`,
    `${-shaftW/2},0`,
  ].join(' ');
  const arrow = `<polygon points="${points}" fill="currentColor" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/>`;

  return `${open}<g transform="rotate(${dirDeg})">${arrow}</g>${close}`;
}
