import type { AisMessage, AisStatus, AisVessel } from './sources';

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

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

  const status = (s: AisStatus) => { if (!closed) opts.onStatus(s); };

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
      // upstream state comes via the snapshot / status messages from the proxy
    });

    sock.addEventListener('message', (ev) => {
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
      if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (ws) { try { ws.close(); } catch {} ws = null; }
    },
  };
}
