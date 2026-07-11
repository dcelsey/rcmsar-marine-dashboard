# Handover — rcmsar-marine-dashboard

## Where things stand

- **Repo**: https://github.com/dcelsey/rcmsar-marine-dashboard — pushed. Latest commit at handover: `ae85e85`.
- **Stations wired**: all 31 units (hq + sar01, 02, 04, 05, 08, 10, 12, 14, 20, 25, 27, 29, 31, 33, 34, 35, 36, 37, 38, 39, 45, 59, 60, 61, 63, 64, 65, 70, 103, 106). 94 routes total.
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

### 1. Connect Vercel

- New Vercel project → import `dcelsey/rcmsar-marine-dashboard` from GitHub → Framework: Astro (auto) → Deploy.
- Verify a spread of station routes render correctly (at least sar33, hq, sar25, sar02, sar106).
- Point Lively at `https://<new-domain>/sar33/widescreen`.

### 2. Backfill missing logos (best-effort)

Downloads from the CSV succeeded for 26/36 assets. These still fall back to `/logo-rcmsar.png`:

- Logos needing Chrome capture (CSV noted `not found via fetch`): sar01, sar20, sar36, sar37, sar39, sar64.
- Logos that 403/404'd from the CSV URL and need a fresh source: sar08, sar10, sar14, sar60.
- Favicons that 403/404'd: sar02, sar14, sar20, sar37, sar60, sar64.
- Stations with no source URL at all: sar04, sar38, sar45, sar63, sar65, sar70, sar103.

Drop replacements at `public/stations/sarNN/{logo,favicon}.<ext>` and set `logoSrc` / `faviconSrc` in [src/lib/stations.ts](src/lib/stations.ts).

### 3. Verify ECCC zones for outer-coast stations

I left `eccc: []` for stations where I wasn't sure of the site ID (sar38 Ucluelet, sar39 Port Alberni, sar45 Masset, sar63 Kitimat, sar64 Prince Rupert, sar65 Lax Kw'alaams, sar70 Hartley Bay). Their deep-dive links point at the ECCC regional map page instead. If the crews want the marine bulletins on-page, look up correct `siteId`/`mapId` and fill in.

### 4. sar33 webcam still-image capture (parked)

Approved implementation plan lives at `C:\Users\DuncanElsey\.claude\plans\for-33-for-the-calm-cray.md` (Claude Code plans dir on Duncan's machine). Approach: GitHub Actions cron every 15 min → Playwright headless capture of Willows Beach + Ross Bay pages → Cloudflare R2 (public read) → dashboard renders via a new `kind: 'image'` webcam variant. Prereqs (Cloudflare R2 bucket + 5 GH Actions secrets) documented in the plan. **Work on a branch** when resuming — Playwright/AWS SDK deps are heavy and the Ross Bay YouTube capture may prove infeasible.

### 5. Cross-check a few tide station picks

Confirmed all 30 tide station UUIDs return `wlp` + `wlp-hilo`, but the *nearest* station isn't always the *most useful* — a few worth a look from crews who know the water:

- **sar02 North Vancouver → 07735 Vancouver.** Second Narrows (07745) was the geographic pick but is currents-only; Vancouver is the standard Burrard Inlet reference station. Fixed in commit `ae85e85`.
- **sar04 Squamish → 07811 Squamish Inner** vs 07808 Darrell Bay — both work; may prefer one operationally.
- **sar08 Delta → 07592 Roberts Bank** vs 07577 White Rock — chose Roberts Bank as it's closer to the Point Roberts marina.
- **sar59 Deep Bay → 07953 Hornby Island** — no station in Deep Bay proper; Hornby is closest reference.

## Gotchas the next session should know

- **DFO IWLS: not every station has `wlp`/`wlp-hilo`.** Currents-only stations (like 07745 Second Narrows, 07720 Lions Gate) return empty for water levels, which silently breaks the tide card AND the summary tiles (refresh.ts gates the glance on `wx && tides`). Before assigning a `tideStationId`, verify `timeSeries[].code` includes both `wlp` and `wlp-hilo` by hitting `/api/v1/stations/{uuid}`.
- **Freshwater / inland units set `tideStationId: ''`** — `loadTides` in `src/lib/sources.ts` short-circuits to an empty bundle. Currently only sar106 Shuswap does this.
- **Bash tool cwd does not persist** between calls in this env — every bash command that needs to run in the new repo must prefix with `cd "c:/Users/DuncanElsey/Documents/projects/rcmsar-marine-dashboard" &&`. Use absolute paths for file tools.
- **Windows `/tmp` mismatch** — bash sees `/tmp` mapped to `%LOCALAPPDATA%\Temp`, but Node interprets `/tmp` literally as `C:\tmp` (doesn't exist). When chaining `curl → node`, resolve with `cygpath -w /tmp/foo` first. Python isn't installed on this box; use Node for scripting.
- **`gh` is authenticated** as `dcelsey`. Use it for repo/PR operations.
- **Astro's `<style>` block scopes selectors via `data-astro-cid-*` attributes.** Elements the refresh script injects via `innerHTML` won't carry those attributes and won't get scoped styles. That's why most component styles live in [src/styles/globals.css](src/styles/globals.css) rather than each `.astro` file's `<style>` block.
- **Lively (Windows wallpaper app) strips query strings AND URL fragments** from wallpaper URLs. That's why the routes are path-based (`/sar33/widescreen`, not `/sar33?view=widescreen`).
- **IDE diagnostics can lag behind `Write` calls** — verify with `npx astro check` when in doubt.
