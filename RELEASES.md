# Release notes

## v1.2.0 — 2026-07-13

- Wind-by-location card now offers a List / Map view toggle. The map view (Leaflet + CartoDB Positron tiles) renders proper meteorological wind barbs (half=5 kt / full=10 kt / pennant=50 kt) tinted green / yellow / red by speed, with a closed dot for a live SWOB or NDBC observation and an open dot for the Open-Meteo forecast fallback.
- Mouseover on a barb reveals station name, speed / gust, direction (compass and degrees), and either the observation time or "forecast"; click pins the same content as a popup.
- View choice persists in a 1-year `wind-view` cookie.

## v1.1.1 — 2026-07-13

- Fix kiosk-view grid gap. Kiosk doesn't render the Windy embed, so the shared 4-column grid left an empty column; the freed space now goes to the wind card, which had grown taller with live rows.

## v1.1.0 — 2026-07-13

- Live wind observations merged into the wind-by-location card. Fetch pipeline pulls ECCC SWOB and NOAA NDBC every 15 min. All live stations within 25 km of station centre are shown; configured forecast points within 2 km of a live station are suppressed.
- New "Reported" column shows observation time (HH:MM) for live rows and "forecast" for forecast rows.
- Footer attribution updated for MSC Open Government Licence SWOB and NOAA NDBC.

## v1.0.0 — 2026-07-13

- Relabel wind-by-location card as "Forecast wind across the operating area" and drop "— live" from the Windy map card.
- Add enhancements log (`ENHANCEMENTS.md`) tracking ideas to be explored.
- Publish release notes at `/releases`.

## v0.3.0 — 2026-07-12

- Fix off-by-one day labels in the 7-day and marine daily tables (cross-timezone rollover).
- Switch Open-Meteo requests to unix timestamps so hourly labels stay correct across timezones.

## v0.2.0 — 2026-07-11

- Add Windy embed to the widescreen layout in a dedicated column.
- Polish landing page and tide chart.
- Drop redundant "Knots at 10 m" caption from the wind card.
- Drop hardcoded Oak Bay point list from the `WindByLocation` footnote.

## v0.1.0 — 2026-07-10

- Initial release. Multi-station Astro dashboard with wind, tide, hourly, 7-day, and ECCC links per station.
- Standard, widescreen, and kiosk views per station.
- Landing page with live search across all 32 RCMSAR stations + RCMSAR HQ Pedder Bay.
- Data sources wired: Open-Meteo, DFO IWLS, SunCalc, Environment Canada, Windy.
