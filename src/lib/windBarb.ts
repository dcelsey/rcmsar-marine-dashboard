export type BarbTint = 'g' | 'w' | 'a';

export function speedTint(speedKn: number | null | undefined): BarbTint {
  if (speedKn === null || speedKn === undefined) return 'g';
  if (speedKn >= 22) return 'a';
  if (speedKn >= 15) return 'w';
  return 'g';
}

export type WindBarbOpts = {
  speedKn: number;
  dirDeg: number;
  measured: boolean;
  tint: BarbTint;
};

export function windBarbSvg({ speedKn, dirDeg, measured, tint }: WindBarbOpts): string {
  const rounded = Math.max(0, Math.round(speedKn / 5) * 5);
  const tintCls = `wb-${tint}`;
  const measuredCls = measured ? 'wb-live' : 'wb-fcst';
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-22 -46 44 56" width="44" height="56" class="wb ${measuredCls} ${tintCls}" aria-hidden="true">`;
  const close = `</svg>`;

  const stroke = 2.2;
  const dotR = 4.5;
  const dotFill = measured ? 'currentColor' : 'none';
  const dot = `<circle cx="0" cy="0" r="${dotR}" fill="${dotFill}" stroke="currentColor" stroke-width="${stroke}"/>`;

  // Invisible hover target, sized to the glyph rather than the icon box. The box has to
  // be big enough for a barb pointing any direction, so most of it is empty — hovering
  // that empty space used to open a tooltip for a marker several pixels away.
  const hit = (body: string) => `<g class="mk-hit" fill="rgba(0,0,0,0)" stroke="rgba(0,0,0,0)">${body}</g>`;

  if (rounded < 3) {
    const calm = `<circle cx="0" cy="-13" r="6" fill="none" stroke="currentColor" stroke-width="${stroke}"/>`;
    // Calm is just the dot plus a small ring — a single tight circle covers both.
    return open + hit(`<circle cx="0" cy="-7" r="13"/>`) + dot + calm + close;
  }

  const shaftLen = 34;
  const barbLen = 13;
  const barbGap = 5;
  const pennantW = 8;

  let r = rounded;
  const pennants = Math.floor(r / 50); r -= pennants * 50;
  const fullBarbs = Math.floor(r / 10); r -= fullBarbs * 10;
  const halfBarbs = Math.floor(r / 5);

  const parts: string[] = [
    `<line x1="0" y1="${-dotR}" x2="0" y2="${-shaftLen}" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round"/>`,
  ];

  let off = 0;

  for (let i = 0; i < pennants; i++) {
    const yBase = -shaftLen + off;
    const yBase2 = yBase + pennantW;
    parts.push(
      `<polygon points="0,${yBase} 0,${yBase2} ${barbLen},${yBase - 3}" fill="currentColor" stroke="currentColor" stroke-width="${stroke}" stroke-linejoin="round"/>`,
    );
    off += pennantW + 1.5;
  }

  for (let i = 0; i < fullBarbs; i++) {
    const y = -shaftLen + off;
    parts.push(
      `<line x1="0" y1="${y}" x2="${barbLen}" y2="${y - 6}" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round"/>`,
    );
    off += barbGap;
  }

  if (halfBarbs > 0) {
    if (pennants === 0 && fullBarbs === 0) off += barbGap;
    const y = -shaftLen + off;
    parts.push(
      `<line x1="0" y1="${y}" x2="${barbLen / 2}" y2="${y - 3}" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round"/>`,
    );
  }

  // Dot is always hoverable; the shaft target rides inside the rotation, so the hover
  // area tracks wind direction instead of covering all four quadrants.
  const shaftHit = hit(`<line x1="0" y1="6" x2="0" y2="${-shaftLen - 4}" stroke-width="17"/>`);
  return `${open}${hit(`<circle cx="0" cy="0" r="10"/>`)}`
    + `<g transform="rotate(${dirDeg})">${shaftHit}${parts.join('')}</g>${dot}${close}`;
}
