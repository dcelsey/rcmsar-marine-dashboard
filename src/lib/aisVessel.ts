export type AisVesselType =
  | 'cargo'
  | 'tanker'
  | 'passenger'
  | 'fishing'
  | 'tug'
  | 'sar'
  | 'sailing'
  | 'other'
  | 'unknown';

// AIS ship-type code → category. Codes per ITU-R M.1371-5 / IMO.
export function aisVesselCategory(code: number | null | undefined): AisVesselType {
  if (code === null || code === undefined || code === 0) return 'unknown';
  if (code === 30) return 'fishing';
  if (code === 31 || code === 32 || code === 52) return 'tug';
  if (code === 36) return 'sailing';
  if (code === 51) return 'sar';
  if (code >= 60 && code <= 69) return 'passenger';
  if (code >= 70 && code <= 79) return 'cargo';
  if (code >= 80 && code <= 89) return 'tanker';
  return 'other';
}

export type AisVesselOpts = {
  headingDeg: number | null;
  moving: boolean;
  category: AisVesselType;
};

// Marker per vessel: filled arrow rotated to heading when moving, hollow ring
// when stopped/anchored. Colour comes from the `av-<category>` class defined in
// MarineCurrents.astro (matches the `ca-<tint>` pattern used by currentArrow).
export function aisVesselSvg({ headingDeg, moving, category }: AisVesselOpts): string {
  const cls = `av av-${category}`;
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-16 -16 32 32" width="32" height="32" class="${cls}" aria-hidden="true">`;
  const close = `</svg>`;

  if (!moving || headingDeg === null) {
    const ring = `<circle cx="0" cy="0" r="6" fill="none" stroke="currentColor" stroke-width="2"/>`
      + `<circle cx="0" cy="0" r="2" fill="currentColor"/>`;
    return open + ring + close;
  }

  // Arrow points along direction of travel (up when heading = 0).
  const points = '0,-10 6,7 0,3 -6,7';
  const arrow = `<polygon points="${points}" fill="currentColor" stroke="#000" stroke-width="1" stroke-linejoin="round"/>`;
  return `${open}<g transform="rotate(${headingDeg})">${arrow}</g>${close}`;
}
