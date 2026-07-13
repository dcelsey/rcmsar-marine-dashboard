import type { TideMapEvent } from './sources';

export type TideState = {
  levelM: number;
  fillFrac: number;   // 0..1 between bracketing low and high
  rising: boolean;
  prev: TideMapEvent;
  next: TideMapEvent;
};

// Cosine ease between adjacent hi/lo events matches the astronomical-tide
// shape closely enough for a marker. Fill fraction is relative to the station's
// full range across the payload window (~40 h → spans neap + spring extrema),
// not just the immediate bracket — so at a 2.8 m low the bar still shows how
// high 2.8 m is in the station's day-scale range.
// Returns null if we can't bracket tMs.
export function tideStateAt(events: TideMapEvent[], tMs: number): TideState | null {
  let prev: TideMapEvent | null = null;
  let next: TideMapEvent | null = null;
  for (const e of events) {
    if (e.t <= tMs) prev = e;
    else { next = e; break; }
  }
  if (!prev || !next || next.t <= prev.t) return null;
  const frac = (tMs - prev.t) / (next.t - prev.t);
  const eased = 0.5 * (1 - Math.cos(Math.PI * frac));
  const levelM = prev.value + (next.value - prev.value) * eased;
  const rising = next.value > prev.value;

  let minM = Infinity;
  let maxM = -Infinity;
  for (const e of events) {
    if (e.value < minM) minM = e.value;
    if (e.value > maxM) maxM = e.value;
  }
  const span = maxM - minM || 1;
  const fillFrac = Math.max(0, Math.min(1, (levelM - minM) / span));
  return { levelM, fillFrac, rising, prev, next };
}

// Vertical column with fill from bottom + directional "hat" on top.
// Anchor: bottom-centre of the column marks the station location.
export function tideMarkerSvg(state: TideState): string {
  const colW = 14;
  const colH = 40;
  const hatH = 10;
  const totalH = colH + hatH;
  const stroke = 1.2;
  const colour = state.rising ? '#2a7bd8' : '#d84a4a';

  const fillH = state.fillFrac * colH;
  const fillY = -fillH;

  const colOutline = `<rect x="${-colW / 2}" y="${-colH}" width="${colW}" height="${colH}" fill="#ffffff" stroke="#000" stroke-width="${stroke}"/>`;
  const colFill = fillH > 0
    ? `<rect x="${-colW / 2}" y="${fillY}" width="${colW}" height="${fillH}" fill="${colour}"/>`
    : '';

  const hatY = -colH - 1;
  const hat = state.rising
    ? `<polygon points="${-colW / 2 - 1},${hatY} ${colW / 2 + 1},${hatY} 0,${hatY - hatH}" fill="${colour}" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round"/>`
    : `<polygon points="${-colW / 2 - 1},${hatY - hatH} ${colW / 2 + 1},${hatY - hatH} 0,${hatY}" fill="${colour}" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round"/>`;

  const viewBoxH = totalH + 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-colW / 2 - 2} ${-viewBoxH} ${colW + 4} ${viewBoxH + 2}" width="${colW + 4}" height="${viewBoxH + 2}" class="tm" aria-hidden="true">`
    + colOutline
    + colFill
    + hat
    + `</svg>`;
}
