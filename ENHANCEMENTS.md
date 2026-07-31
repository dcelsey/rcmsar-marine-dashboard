# Enhancements

Log of updates to be explored. Rough priority order.

## To explore

- **Current data** — needs exploration as to whether the data available is live (observations) or forecast (model). Check DFO IWLS current stations, Open-Meteo marine currents, and any real-time ADCP feeds. Deliverable: decision on live vs. forecast (or both) before scoping UI.

## Tried, not adopted

- **Open-Meteo `/v1/gem` (ECCC HRDPS + RDPS + GDPS) instead of the default `/v1/forecast`** — explored 2026-07-12 on `feat/eccc-weather-source`, **not adopted; branch deleted 2026-07-31**. The intent was to prefer Canada's official model blend over Open-Meteo's `best_match` (blended global models) for `loadWeather` and `loadWindByLocation`. It was parked pending a couple of weeks of side-by-side comparison against Weather Network / Environment Canada — **that comparison never happened**, so there is no evidence either way. Dropped in favour of staying on the known-good `best_match` rather than switching a SAR tool's forecast source on an untested hunch.

  Reviving it is a two-line change, which is why the branch wasn't worth keeping — in `src/lib/sources.ts`, swap `api.open-meteo.com/v1/forecast` for `api.open-meteo.com/v1/gem` in **`loadWeather`** and **`loadWindByLocation`** (leave `loadMarine`, which uses the separate `marine-api` host). Original commit was `9e6acdd`, recoverable from the reflog for a while.

  If it's picked up again, evaluate it properly rather than by eye: the SWOB live observations in `public/data/wind.json` give ground truth, so both endpoints can be scored against actual observed wind at the same coordinates over a few days. A snapshot comparison proves nothing — the models differ constantly without either being better.
