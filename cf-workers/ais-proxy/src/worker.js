export { AisHub } from "./durable.js";

function getHub(env) {
  const id = env.AIS_HUB.idFromName("global");
  return env.AIS_HUB.get(id);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/ais") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      return getHub(env).fetch(request);
    }

    if (url.pathname === "/health") {
      return getHub(env).fetch(new Request("https://do/health"));
    }

    if (url.pathname === "/keepalive") {
      return getHub(env).fetch(new Request("https://do/keepalive"));
    }

    return new Response("ais-proxy", { status: 200 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(getHub(env).fetch(new Request("https://do/keepalive")));
  },
};
