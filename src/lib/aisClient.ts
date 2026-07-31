import type { AisMessage, AisStatus, AisVessel } from './sources';

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Treat the feed as dead after this long with no message at all.
 *
 * A dropped TCP connection doesn't always surface as a `close` or `error` event — the
 * socket can sit open for minutes before the OS times it out. Without a watchdog the
 * status would keep claiming "live" while nothing was arriving, which is the one thing
 * this indicator exists to rule out. The proxy broadcasts on a ~1.5 s tick and there are
 * hundreds of vessels, so silence this long means the feed is gone, not merely quiet.
 */
const SILENCE_TIMEOUT_MS = 30_000;

export type AisSubscribeOpts = {
  url: string;
  onSnapshot: (vessels: AisVessel[], upstream: AisStatus) => void;
  onUpdate: (vessels: AisVessel[]) => void;
  onRemove?: (mmsis: string[]) => void;
  onStatus: (status: AisStatus) => void;
};

export type AisSubscription = { close(): void };

export function subscribeAis(opts: AisSubscribeOpts): AisSubscription {
  let ws: WebSocket | null = null;
  let closed = false;
  let delayMs = RECONNECT_MIN_MS;
  let reconnectTimer: number | null = null;
  let silenceTimer: number | null = null;

  const status = (s: AisStatus) => { if (!closed) opts.onStatus(s); };

  const clearSilenceTimer = () => {
    if (silenceTimer !== null) { clearTimeout(silenceTimer); silenceTimer = null; }
  };

  /** Restarted on every inbound message; fires only if the feed has actually gone quiet. */
  const armSilenceTimer = () => {
    clearSilenceTimer();
    if (closed) return;
    silenceTimer = window.setTimeout(() => {
      silenceTimer = null;
      if (closed) return;
      // Drop the socket ourselves rather than waiting on the OS, so the normal
      // reconnect path runs and the status stops claiming a feed we aren't getting.
      if (ws) { try { ws.close(); } catch { /* already gone */ } ws = null; }
      scheduleReconnect();
    }, SILENCE_TIMEOUT_MS);
  };

  const connect = () => {
    if (closed) return;
    status('connecting');
    let sock: WebSocket;
    try {
      sock = new WebSocket(opts.url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws = sock;

    sock.addEventListener('open', () => {
      delayMs = RECONNECT_MIN_MS;
      armSilenceTimer();
      // upstream state comes via the snapshot / status messages from the proxy
    });

    sock.addEventListener('message', (ev) => {
      armSilenceTimer();
      let msg: AisMessage;
      try { msg = JSON.parse(ev.data as string) as AisMessage; }
      catch { return; }
      if (msg.type === 'snapshot') {
        opts.onSnapshot(msg.vessels, msg.upstream);
        status(msg.upstream);
      } else if (msg.type === 'update') {
        opts.onUpdate(msg.vessels);
      } else if (msg.type === 'remove') {
        opts.onRemove?.(msg.mmsis);
      } else if (msg.type === 'status') {
        status(msg.upstream);
      }
    });

    const handleClose = () => {
      if (closed) return;
      clearSilenceTimer();
      ws = null;
      scheduleReconnect();
    };
    sock.addEventListener('close', handleClose);
    sock.addEventListener('error', handleClose);
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer !== null) return;
    status('reconnecting');
    const delay = delayMs;
    delayMs = Math.min(RECONNECT_MAX_MS, delayMs * 2);
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  connect();

  return {
    close() {
      closed = true;
      status('offline');
      clearSilenceTimer();
      if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (ws) { try { ws.close(); } catch {} ws = null; }
    },
  };
}
