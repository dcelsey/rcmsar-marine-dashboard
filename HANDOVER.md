# Handover — rcmsar-marine-dashboard

## Where things stand

- **Repo**: https://github.com/dcelsey/rcmsar-marine-dashboard — pushed. Latest commit at handover: `ce4b440`.
- **Vercel**: not yet connected to the new repo. Vercel dashboard → import `dcelsey/rcmsar-marine-dashboard`. Astro auto-detects, no config needed.
- **Old repo** (`OBSR Conditions Dashboard` / `rcmsar33-oak-bay-conditions.vercel.app`) still deployed on `main` and is what Lively currently points at. Leave running until the new deploy is verified for sar33; then update the Lively URL.

## Architecture

- Config-driven multi-station Astro app. All station-specific values live in [src/lib/stations.ts](src/lib/stations.ts) under `STATIONS`.
- Routes (auto-generated per station via `getStaticPaths`):
  - `/` — landing page, centered RCMSAR logo + station grid
  - `/{slug}/` — standard responsive dashboard
  - `/{slug}/kiosk` — full-viewport dense view for TV/tablet/laptop
  - `/{slug}/widescreen` — inset (75×90 vw/vh) for Lively wallpaper
- Header (in all three variants) has a Standard / Kiosk / Widescreen switcher.
- Runtime data fetching is one client bundle, driven off a `<script id="station-config" type="application/json">` blob injected by [src/layouts/Base.astro](src/layouts/Base.astro).
- Fallbacks: any station omitting `brand.logoSrc` / `logoAlt` / `faviconSrc` / `appleTouchIconSrc` gets the root RCMSAR crest (`/logo-rcmsar.png`, `/favicon.png`, `/apple-touch-icon.png`).

## Immediate next work

### 1. Add station SAR 25 (Salt Spring)

Source: `c:\Users\DuncanElsey\Documents\projects\SAR25 Conditions Dashboard\index.html` (legacy single-file dashboard the user shared).

**Config extracted and ready to paste** into `STATIONS` in [src/lib/stations.ts](src/lib/stations.ts):

```ts
sar25: {
  slug: 'sar25',
  brand: {
    short: 'RCMSAR 25 · Salt Spring',
    tagline: 'Local Marine Conditions',
    // logoSrc omitted → uses /logo-rcmsar.png fallback until a specific
    // Station 25 logo is dropped at public/stations/sar25/logo.png.
    // The user pasted an image of a station-25-branded logo in the
    // chat but no file was saved. Ask them to save the logo PNG
    // to public/stations/sar25/logo.png then set logoSrc here.
    accent: '#37b6ff',
    themeColor: '#0b1622',
  },
  meta: {
    title: 'RCMSAR 25 Salt Spring — Local Conditions',
    description: 'RCMSAR Unit 25 Salt Spring Island local marine conditions dashboard for wind, weather, tides, and sea state.',
    footerCredit: 'RCMSAR 25 Salt Spring conditions',
  },
  labels: {
    windSub: 'Vesuvius Bay',
    seaSub: 'Trincomali Ch.',
    tideSub: 'Crofton (07450)',
    tideCardHeading: 'Tide — Crofton (07450)',
    sunFootnote: 'Computed locally (SunCalc) for Vesuvius Bay.',
    forecastLocation: 'Vesuvius Bay',
    marineWarningLocation: 'Vesuvius Bay',
  },
  tz: 'America/Vancouver',
  center: { name: 'Vesuvius Bay', lat: 48.8833, lon: -123.5680 },
  tideStationId: '5cebf1e03d0f4a073c4bbd43',   // DFO IWLS id for 07450 "Crofton"
  points: [
    { name: 'Vesuvius Bay', lat: 48.8833, lon: -123.5680 },
    { name: 'Booth Bay',    lat: 48.8880, lon: -123.5330 },
    { name: 'Ganges Hbr',   lat: 48.8580, lon: -123.4995 },
    { name: 'Long Hbr',     lat: 48.8500, lon: -123.4510 },
    { name: 'Fulford Hbr',  lat: 48.7660, lon: -123.4510 },
    { name: 'Beaver Pt',    lat: 48.7810, lon: -123.3720 },
    { name: 'Musgrave Ldg', lat: 48.7620, lon: -123.5770 },
    { name: 'Southey Pt',   lat: 48.9470, lon: -123.6180 },
    { name: 'Erskine Pt',   lat: 48.8220, lon: -123.6010 },
  ],
  marinePoint: { name: 'Trincomali Ch.', lat: 48.910, lon: -123.470 },
  refreshMs: 10 * 60 * 1000,
  eccc: [
    { label: 'Strait of Georgia — south of Nanaimo', siteId: '14305', mapId: '02' },
    { label: 'Haro Strait',                          siteId: '06100', mapId: '02' },
  ],
  windy: { lat: 48.83, lon: -123.53, zoom: 11 },
  webcams: [],   // SAR25 had no webcam section
  deepDive: [
    { label: 'WindIsGood — Island map ↗',       href: 'https://windisgood.com/island-map2.html' },
    { label: 'WindIsGood — Gulf Islands ↗',     href: 'https://windisgood.com/gulf-islands.html' },
    { label: 'WindIsGood — Ganges ↗',           href: 'https://windisgood.com/ganges.html' },
    { label: 'Windy.com full ↗',                href: 'https://www.windy.com/?48.83,-123.53,11' },
    { label: 'Weather Network — hourly ↗',      href: 'https://www.theweathernetwork.com/ca/hourly-weather-forecast/british-columbia/ganges' },
    { label: 'DFO tides — Crofton 07450 ↗',     href: 'https://www.tides.gc.ca/en/stations/07450' },
    { label: 'DFO tides — Fulford Hbr 07330 ↗', href: 'https://www.tides.gc.ca/en/stations/07330' },
  ],
} satisfies StationConfig,
```

After pasting: `npm run build` → verify `/sar25/`, `/sar25/kiosk`, `/sar25/widescreen` render and landing page shows two station cards. Commit + push.

### 2. Add the third station

User mentioned there is a third legacy `index.html` for another station. Location unknown; ask them for the file path. Same extraction pattern as SAR 25.

### 3. Connect Vercel

- New Vercel project → import `dcelsey/rcmsar-marine-dashboard` from GitHub → Framework: Astro (auto) → Deploy.
- Verify all 3×3 station-variant routes render correctly.
- Point Lively at `https://<new-domain>/sar33/widescreen`.

## Gotchas the next session should know

- **Bash tool cwd does not persist** between calls in this env — every bash command that needs to run in the new repo must prefix with `cd "c:/Users/DuncanElsey/Documents/projects/rcmsar-marine-dashboard" &&`. Use absolute paths for file tools.
- **`gh` is authenticated** as `dcelsey`. Use it for repo/PR operations.
- **Astro's `<style>` block scopes selectors via `data-astro-cid-*` attributes.** Elements the refresh script injects via `innerHTML` won't carry those attributes and won't get scoped styles. That's why most component styles live in [src/styles/globals.css](src/styles/globals.css) rather than each `.astro` file's `<style>` block.
- **Lively (Windows wallpaper app) strips query strings AND URL fragments** from wallpaper URLs. That's why the routes are path-based (`/sar33/widescreen`, not `/sar33?view=widescreen`).
- **IDE diagnostics can lag behind `Write` calls** — verify with `npx astro check` when in doubt.
