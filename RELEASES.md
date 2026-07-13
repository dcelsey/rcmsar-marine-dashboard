# Release notes

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
