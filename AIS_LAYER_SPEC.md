# Spec: Live AIS vessel layer for the RCMSAR marine dashboard

**Audience:** the Claude Code session that will build the production AIS layer.
**Status:** validated in a working single-folder POC (`server.js` + `index.html`), tested end-to-end against a mocked aisstream upstream. This spec describes what to build for production, grounded in that POC and in the existing currents architecture (`currents-dashboard-approach.md`).

---

## 1. Goal

Add a toggleable **live AIS vessel layer** to the existing RCMSAR Leaflet dashboard: real-time positions of AIS-equipped, transmitting vessels along the BC coast (primarily the Salish Sea), rendered as heading-oriented markers alongside the existing currents layer.

This is **decision-support / situational awareness** for search-and-rescue — traffic picture, own-asset tracking, vessels of opportunity — **not** a complete picture of craft on the water. Most small craft RCMSAR searches for do not carry AIS. The UI must state this.

### Non-goals
- No historical AIS storage / trajectory analysis (that would be a separate feature; OpenAIS-style warehousing is explicitly out of scope).
- No collision prediction, no ETA computation, no AIS message types beyond position + static data.
- Not a navigation instrument.

---

## 2. Data source

**aisstream.io** — free WebSocket API, aggregated from a global network of AIS stations. Requires a free API key (already obtained).

- Endpoint: `wss://stream.aisstream.io/v0/stream`
- On connect, send a subscription JSON: `APIKey`, `BoundingBoxes`, `FilterMessageTypes`.
- Bounding box format: `[[lat, lon], [lat, lon]]` — two opposite corners. **The `[lat, lon]` order matters; the corner order does not** — upstream documents that "the order of the bounding box corners has no affect", so our NW-then-SE spelling is fine as written. (An earlier revision of this line warned that NW-then-SE was "easy to get wrong", which sent a 2026-08-06 outage investigation chasing a bbox bug that did not exist.)
- Message types we use: `PositionReport` (moving data) and `ShipStaticData` (name, type, destination, callsign).

### Message shape (as consumed in the POC — verify against live feed on first run)
```
{
  MessageType: "PositionReport",
  MetaData: { MMSI, ShipName, ... },
  Message: { PositionReport: {
    Latitude, Longitude, Cog, Sog, TrueHeading, NavigationalStatus
  }}
}
```
`ShipStaticData` carries `Message.ShipStaticData.{Name, Type, Destination, CallSign}`.

**Field-name caveat:** the POC was verified against a mock with these exact names. On first connection to the real feed, confirm the nesting and key names haven't drifted; the decode in `server.js` is the single place that depends on them. Everything downstream is field-independent.

### Sentinel / unit notes (AIS conventions — handle like the IWLS units in the currents work)
- `TrueHeading == 511` → heading not available; fall back to `Cog`.
- `Sog` in knots; treat `<= 0.3` as effectively stopped for rendering.
- `Cog` in degrees.

---

## 3. Architecture

**Do not connect the browser directly to aisstream.** Two hard reasons: (1) the API key must never ship to the client; (2) browser WebSocket clients hit HTTP/2 upgrade quirks with this endpoint. A server-side proxy is mandatory.

```
aisstream.io ──wss──► proxy ──ws──► browser
                      · holds API key
                      · ONE upstream connection, shared by all browsers
                      · filters to BC bounding box (via subscription)
                      · caches last-known position per MMSI
                      · fans out snapshot-on-connect + live updates
```

### Integrate with the existing currents service — do not ship a second server
The currents spec already calls for a thin server-side service that proxies/caches IWLS + CIOPS and serves clean JSON. **Fold AIS into that same service** as one more concern:
- Reuse its process, config, and deployment.
- Add the aisstream upstream connection + vessel cache module.
- Expose AIS to the browser over a WebSocket path (e.g. `/ais`) or the service's existing socket, separate from the currents REST endpoints.
- The Leaflet frontend gets one more toggleable layer beside currents — same map, same layer-control.

### Proxy responsibilities (from the POC, harden for production)
1. **Single upstream connection** shared across all connected browsers (don't open one per client).
2. **Reconnect with exponential backoff** on upstream close/error (POC: 1s → 30s cap). Re-send the subscription on every reconnect.
3. **Last-known-position cache** keyed by MMSI. Send the full cache as a `snapshot` message the instant a browser connects, so the map isn't empty on load. The stream only reports a vessel when it transmits.
4. **Staleness pruning** — drop vessels not heard from in N minutes (POC default 30). Configurable.
5. **Merge static + position data** into one vessel record per MMSI (name/type arrive separately from position).

### Production hardening beyond the POC
- **Persist the cache** (Redis / Postgres / Supabase — the dashboard already has Supabase available) so a proxy restart doesn't blank the map. In-memory Map is fine for the POC, not for production.
- **Health/observability:** log upstream connection state, vessel count, last-message timestamp; expose a health endpoint.
- **Backpressure:** if many browsers connect, throttle/batch broadcasts (e.g. coalesce position updates into ~1–2s ticks rather than per-message fan-out) to avoid flooding clients.
- **Config via env:** `AISSTREAM_KEY`, bounding box, stale timeout, broadcast interval.
- **Graceful degradation:** if the upstream is down, the frontend should show a clear "AIS feed unavailable" state, not a silently empty layer.

---

## 4. Coverage box

POC default (Salish Sea / southern BC): `[[51.5, -128.5], [48.0, -122.0]]`.

For full RCMSAR footprint, widen to match the currents coverage (Vol. 5 + Vol. 6 areas: Juan de Fuca, Georgia, Discovery Passage, WCVI). Larger boxes mean more vessels and more traffic through the proxy — keep it configurable and start scoped.

---

## 5. Frontend rendering (Leaflet, matches existing dashboard)

- **Marker per vessel**, rotated to `TrueHeading` (fallback `Cog`).
  - Moving (`Sog > 0.3`): filled arrow/triangle pointing along heading.
  - Stopped/anchored: hollow marker (POC uses a hollow diamond/circle).
- **Colour by vessel type** (AIS type code): cargo/tanker, passenger, fishing/tug/other, unknown. Keep the ramp legible on the dashboard's dark chart basemap.
- **Click → detail card**: name, MMSI, speed (kn), course, type, nav status, destination, "last report N min ago".
- **Smooth position transitions** (CSS transform transition in the POC) so vessels glide rather than jump.
- **Layer toggle** in the existing map's layer control, off or on by default per product call. Must coexist with the currents arrows without visual collision — consider a subtle style distinction (AIS = vessel silhouettes; currents = flow arrows).

### Required UI honesty (carry over from the currents "decision-support" framing)
- A persistent legend note: shows AIS-equipped, transmitting vessels only; situational awareness, not a complete picture.
- A live/stale connection indicator (POC: pulsing dot + "live"/"reconnecting").
- Show data provenance: "AIS via aisstream.io".

---

## 6. Build order

1. **Proxy module** inside the existing currents service: aisstream upstream connection, subscription with BC box, vessel cache, reconnect/backoff. Verify field names against the live feed on first run.
2. **Browser WebSocket channel**: snapshot-on-connect + live position/static merge. Frontend vessel layer with type colours, heading rotation, detail card, legend.
3. **Persistence + hardening**: move cache to Supabase/Redis, add health/observability, broadcast batching, graceful "feed unavailable" state.
4. **Layer integration**: wire into the dashboard's layer control beside currents; resolve any visual collision between vessel markers and current arrows.
5. **Coverage expansion**: widen the box to the full RCMSAR footprint once southern-Salish-Sea scope is proven.

---

## 7. Reference: the working POC

The POC (`server.js` + `index.html`, `ws` the only dependency) implements items 1–2 above in the simplest form and passed an end-to-end test: subscription → decode → cache → snapshot-on-connect → live push. Use it as the reference implementation for the upstream handling and the rendering, then harden per §3 and §5. Run locally with `AISSTREAM_KEY=... node server.js`, open `http://localhost:8080`.

Key POC files to read first: `server.js` (upstream connection, cache, fan-out — lines around `connectUpstream()` and the `vessels` Map) and `index.html` (`vesselIcon()`, `upsert()`, the type/colour maps).

---

## 8. Open questions for product

- Default the AIS layer on or off at dashboard load?
- Should own RCMSAR assets (known MMSIs) be styled distinctly / always-on / pinned?
- Retain any history at all (breadcrumb trails for the last N minutes), or strictly live positions?
- Coverage: southern Salish Sea only at launch, or full coast day one?
