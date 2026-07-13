# Change Requests

Log of user-requested changes. Newest at top. Status: `open`, `in-progress`, `done`, `parked`.

---

## CR-002 — Preserve wind stations missing from a pull

- **Logged:** 2026-07-13
- **Status:** open
- **Problem:** Some live wind stations occasionally don't appear on the dashboard. Suspected cause: they aren't included in every upstream pull (source may drop stations intermittently rather than the fetch failing).
- **Proposal:** On each pull, diff the new payload against the previous one. For any station present in the previous pull but missing from the new one, carry the last-known observation forward (with its original timestamp so age is honest). Mark carried-over entries so the UI can style them as stale if needed.
- **Open questions:**
  - How long should a carried-over station persist before being dropped entirely? (e.g. 2h, 6h, until midnight)
  - Should stale/carried entries be visually distinguished on the map/tile?
  - Where to persist "last pull" — commit alongside the live feed JSON, or a separate cache file?

## CR-001 — Imperial ↔ metric unit toggle

- **Logged:** 2026-07-13
- **Status:** open
- **Problem:** Units are currently fixed (metric-ish — knots for wind, metres/°C, etc.). Users want a global toggle between imperial and metric.
- **Proposal:** Global unit preference persisted in localStorage. Toggle affects:
  - Wind speed (kts ↔ mph — note kts is arguably neither; confirm desired default per mode)
  - Temperature (°C ↔ °F)
  - Distance / height (m ↔ ft) — tide heights, wave heights, visibility
  - Precipitation (mm ↔ in)
- **Open questions:**
  - Where should the toggle live in the UI? (header, settings drawer, per-tile?)
  - Marine convention keeps wind in knots regardless — should "imperial" mean mph or stay knots?
  - Should the toggle apply to forecast tiles as well as live/glance tiles?
