import { haversineKm, type LatLon } from './distance';
import type { NearbyLiveStation, WindPointResponse } from './sources';

/**
 * Live-vs-forecast wind disagreement — answers "do they differ *right now*" for the notice
 * shown when both wind layers are on, so it can name the worst case instead of only
 * saying they might.
 *
 * Forecasts only exist at the configured points, so each live station is paired with its
 * nearest point. Too far apart and the comparison says more about geography than about
 * the forecast, hence PAIR_KM.
 */
export const PAIR_KM = 10;
/** A speed gap this big can move a reading across a whole colour band (<15 / 15–21 / 22+). */
export const SPEED_DIFF_KN = 8;
/** Direction is only compared when both winds are at least this strong — in light air
 *  direction swings wildly and a big angular gap means nothing. */
export const DIR_MIN_KN = 8;
export const DIR_DIFF_DEG = 60;

export type WindDisagreement = {
  liveName: string;
  liveKn: number;
  liveDeg: number;
  fcstName: string;
  fcstKn: number;
  fcstDeg: number;
  speedDiffKn: number;
  dirDiffDeg: number;
};

/** Smallest angle between two bearings, 0–180. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Significant pairs, worst first — speed gap ranks ahead of direction gap. */
export function findWindDisagreements(
  nearbyLive: NearbyLiveStation[],
  points: (LatLon & { name: string })[],
  rows: WindPointResponse[],
): WindDisagreement[] {
  const fcst = points.flatMap((p, i) => {
    const c = rows[i]?.current;
    return c ? [{ p, c }] : [];
  });
  const out: WindDisagreement[] = [];

  for (const { station: s } of nearbyLive) {
    if (s.wind_speed_kn === null || s.wind_dir_deg === null) continue;
    let best: (typeof fcst)[number] | null = null;
    let bestKm = Infinity;
    for (const f of fcst) {
      const km = haversineKm(s, f.p);
      if (km < bestKm) { best = f; bestKm = km; }
    }
    if (!best || bestKm > PAIR_KM) continue;

    const speedDiffKn = Math.abs(s.wind_speed_kn - best.c.wind_speed_10m);
    const dirDiffDeg = angleDiff(s.wind_dir_deg, best.c.wind_direction_10m);
    const dirCounts = s.wind_speed_kn >= DIR_MIN_KN && best.c.wind_speed_10m >= DIR_MIN_KN;
    if (speedDiffKn < SPEED_DIFF_KN && !(dirCounts && dirDiffDeg >= DIR_DIFF_DEG)) continue;

    out.push({
      liveName: s.name,
      liveKn: s.wind_speed_kn,
      liveDeg: s.wind_dir_deg,
      fcstName: best.p.name,
      fcstKn: best.c.wind_speed_10m,
      fcstDeg: best.c.wind_direction_10m,
      speedDiffKn,
      dirDiffDeg,
    });
  }

  return out.sort((a, b) => {
    const aSpeed = a.speedDiffKn >= SPEED_DIFF_KN ? 1 : 0;
    const bSpeed = b.speedDiffKn >= SPEED_DIFF_KN ? 1 : 0;
    if (aSpeed !== bSpeed) return bSpeed - aSpeed;
    return aSpeed ? b.speedDiffKn - a.speedDiffKn : b.dirDiffDeg - a.dirDiffDeg;
  });
}
