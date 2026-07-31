// AisHub Durable Object: singleton holding one upstream aisstream.io WebSocket,
// an in-memory vessel cache keyed by MMSI, and fan-out to browser WebSockets.
//
// - Upstream WebSocket opened lazily on first client. Reconnects with exponential
//   backoff (1s → 30s) and re-subscribes on every reconnect.
// - `alarm()` drives a periodic broadcast tick that coalesces buffered updates
//   into one `{type:"update"}` message per client, plus a periodic staleness
//   sweep that drops vessels not heard in STALE_MINUTES.
// - New clients get an immediate `{type:"snapshot"}` with the full cache.
// - `/health` returns diagnostic JSON; `/keepalive` nudges the DO awake.

const SUBSCRIBE_MSG_TYPES = ["PositionReport", "ShipStaticData"];
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

export class AisHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.bcastMs = Number(env.BROADCAST_MS || 1500);
    this.staleMinutes = Number(env.STALE_MINUTES || 30);
    this.bbox = [
      [Number(env.BBOX_NW_LAT), Number(env.BBOX_NW_LON)],
      [Number(env.BBOX_SE_LAT), Number(env.BBOX_SE_LON)],
    ];
    this.upstreamUrl = env.UPSTREAM_URL || "wss://stream.aisstream.io/v0/stream";

    /** @type {Map<string, object>} */
    this.vessels = new Map();
    /** @type {Set<string>} */
    this.dirty = new Set();
    /** @type {Set<WebSocket>} */
    this.clients = new Set();

    this.upstream = null;
    this.upstreamState = "idle"; // "idle" | "connecting" | "live" | "reconnecting"
    this.lastUpstreamMsMs = 0;
    this.reconnectDelayMs = RECONNECT_MIN_MS;
    this.reconnectTimer = null;
    this.upstreamConnectInFlight = null;
    this.tickCount = 0;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          upstream: this.upstreamState,
          vessels: this.vessels.size,
          clients: this.clients.size,
          last_msg_age_ms: this.lastUpstreamMsMs ? Date.now() - this.lastUpstreamMsMs : null,
          bbox: this.bbox,
        }),
        { headers: { "content-type": "application/json" } },
      );
    }

    if (url.pathname === "/keepalive") {
      // Await the connect attempt so any error surfaces before the response
      // returns. connectUpstream returns quickly after WS open; the
      // long-lived listeners keep the DO alive.
      await this.ensureUpstreamAwaited();
      await this.ensureAlarm();
      return new Response("ok");
    }

    // WebSocket upgrade — accept the client and start upstream if not already.
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.registerClient(server);
    this.ensureUpstream();
    await this.ensureAlarm();
    this.sendSnapshot(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  registerClient(ws) {
    this.clients.add(ws);
    ws.addEventListener("close", () => this.clients.delete(ws));
    ws.addEventListener("error", () => this.clients.delete(ws));
  }

  sendSnapshot(ws) {
    try {
      ws.send(JSON.stringify({
        type: "snapshot",
        upstream: this.upstreamState,
        vessels: [...this.vessels.values()],
      }));
    } catch {
      this.clients.delete(ws);
    }
  }

  broadcastStatus() {
    const msg = JSON.stringify({ type: "status", upstream: this.upstreamState });
    for (const ws of this.clients) {
      try { ws.send(msg); } catch { this.clients.delete(ws); }
    }
  }

  broadcastUpdates() {
    if (this.dirty.size === 0) return;
    const updates = [];
    for (const mmsi of this.dirty) {
      const v = this.vessels.get(mmsi);
      if (v) updates.push(v);
    }
    this.dirty.clear();
    if (updates.length === 0) return;
    const msg = JSON.stringify({ type: "update", vessels: updates });
    for (const ws of this.clients) {
      try { ws.send(msg); } catch { this.clients.delete(ws); }
    }
  }

  sweepStale() {
    const cutoff = Date.now() - this.staleMinutes * 60_000;
    const removed = [];
    for (const [mmsi, v] of this.vessels) {
      if (v.lastMsgMs < cutoff) {
        this.vessels.delete(mmsi);
        removed.push(mmsi);
      }
    }
    if (removed.length) {
      const msg = JSON.stringify({ type: "remove", mmsis: removed });
      for (const ws of this.clients) {
        try { ws.send(msg); } catch { this.clients.delete(ws); }
      }
    }
  }

  async ensureAlarm() {
    const existing = await this.state.storage.getAlarm();
    if (existing) return;
    await this.state.storage.setAlarm(Date.now() + this.bcastMs);
  }

  async alarm() {
    this.tickCount++;
    this.broadcastUpdates();
    // Sweep stale vessels roughly once a minute.
    if (this.tickCount * this.bcastMs >= 60_000) {
      this.tickCount = 0;
      this.sweepStale();
    }
    // Keep the tick running as long as we have clients OR an active upstream
    // (so the cache warms on schedule even before anyone connects).
    if (this.clients.size > 0 || this.upstreamState === "live") {
      await this.state.storage.setAlarm(Date.now() + this.bcastMs);
    }
  }

  ensureUpstream() {
    if (this.upstream || this.upstreamConnectInFlight) return;
    this.upstreamConnectInFlight = this.connectUpstream().finally(() => {
      this.upstreamConnectInFlight = null;
    });
  }

  async ensureUpstreamAwaited() {
    if (this.upstream) return;
    if (!this.upstreamConnectInFlight) {
      this.upstreamConnectInFlight = this.connectUpstream().finally(() => {
        this.upstreamConnectInFlight = null;
      });
    }
    try { await this.upstreamConnectInFlight; }
    catch (err) { console.error("upstream connect await threw:", err && err.stack || err); }
  }

  async connectUpstream() {
    const apiKey = this.env.AISSTREAM_KEY;
    if (!apiKey) {
      console.error("AISSTREAM_KEY not set; upstream will not connect");
      this.upstreamState = "idle";
      this.broadcastStatus();
      return;
    }
    this.upstreamState = "connecting";
    this.broadcastStatus();
    try {
      const resp = await fetch(this.upstreamUrl, {
        headers: { Upgrade: "websocket" },
      });
      const ws = resp.webSocket;
      if (!ws) {
        const body = await resp.text().catch(() => "<no body>");
        console.error("upstream fetch did not return a webSocket. status =", resp.status, "body =", body.slice(0, 500));
        this.scheduleReconnect();
        return;
      }
      ws.accept();
      const subscription = {
        APIKey: apiKey,
        BoundingBoxes: [this.bbox],
        FilterMessageTypes: SUBSCRIBE_MSG_TYPES,
      };
      ws.send(JSON.stringify(subscription));
      this.upstream = ws;
      this.upstreamState = "live";
      this.reconnectDelayMs = RECONNECT_MIN_MS;
      this.broadcastStatus();
      console.log("ais-proxy: upstream live, bbox", JSON.stringify(this.bbox));

      ws.addEventListener("message", (ev) => this.handleUpstreamMessage(ev));
      ws.addEventListener("close", (ev) => {
        console.warn("upstream ws close event: code =", ev.code, "reason =", ev.reason);
        this.handleUpstreamClose("close");
      });
      ws.addEventListener("error", (ev) => {
        console.error("upstream ws error event:", ev && (ev.message || ev.type));
        this.handleUpstreamClose("error");
      });
    } catch (err) {
      console.error("upstream connect threw:", err && (err.stack || err.message || String(err)));
      this.scheduleReconnect();
    }
  }

  handleUpstreamClose(reason) {
    if (this.upstream) {
      try { this.upstream.close(); } catch {}
      this.upstream = null;
    }
    if (this.upstreamState === "reconnecting") return;
    console.warn("upstream closed:", reason);
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    this.upstreamState = "reconnecting";
    this.broadcastStatus();
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(RECONNECT_MAX_MS, this.reconnectDelayMs * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectUpstream();
    }, delay);
  }

  async decodeMsgData(data) {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
    if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
    if (data && typeof data.arrayBuffer === "function") {
      const buf = await data.arrayBuffer();
      return new TextDecoder().decode(new Uint8Array(buf));
    }
    if (data && typeof data.text === "function") {
      return await data.text();
    }
    throw new Error(
      "unrecognized ev.data type: " + typeof data
      + " ctor=" + (data && data.constructor && data.constructor.name)
    );
  }

  async handleUpstreamMessage(ev) {
    this.lastUpstreamMsMs = Date.now();
    this.msgCount = (this.msgCount || 0) + 1;
    let text;
    try {
      text = await this.decodeMsgData(ev.data);
    } catch (err) {
      if (this.msgCount <= 5) console.error("decode failed:", err && err.message, "typeof =", typeof ev.data);
      return;
    }
    let msg;
    try {
      msg = JSON.parse(text);
    } catch (err) {
      if (this.msgCount <= 3) console.error("json parse failed:", err && err.message, "text head =", text.slice(0, 200));
      return;
    }
    if (!msg || !msg.MessageType) {
      if (this.msgCount <= 3) console.warn("msg missing MessageType, keys =", msg && Object.keys(msg));
      return;
    }
    const meta = msg.MetaData || {};
    const mmsi = String(meta.MMSI || "");
    if (!mmsi) return;

    const now = Date.now();
    const existing = this.vessels.get(mmsi) || { mmsi };

    if (msg.MessageType === "PositionReport") {
      const pr = msg.Message?.PositionReport;
      if (!pr) return;
      const heading = pr.TrueHeading === 511 ? null : pr.TrueHeading;
      const cog = typeof pr.Cog === "number" ? pr.Cog : null;
      const sog = typeof pr.Sog === "number" ? pr.Sog : null;
      const v = {
        ...existing,
        mmsi,
        name: existing.name || meta.ShipName || null,
        lat: pr.Latitude,
        lon: pr.Longitude,
        sog,
        cog,
        heading,
        navStatus: pr.NavigationalStatus ?? null,
        lastMsgMs: now,
      };
      this.vessels.set(mmsi, v);
      this.dirty.add(mmsi);
    } else if (msg.MessageType === "ShipStaticData") {
      const sd = msg.Message?.ShipStaticData;
      if (!sd) return;
      const v = {
        ...existing,
        mmsi,
        name: sd.Name || existing.name || null,
        type: typeof sd.Type === "number" ? sd.Type : existing.type ?? null,
        callsign: sd.CallSign || existing.callsign || null,
        destination: sd.Destination || existing.destination || null,
        lastStaticMs: now,
        // don't overwrite lastMsgMs if position is fresher
        lastMsgMs: existing.lastMsgMs || now,
      };
      this.vessels.set(mmsi, v);
      this.dirty.add(mmsi);
    }
  }
}
