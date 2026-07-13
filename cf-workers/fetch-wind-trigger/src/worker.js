export default {
  async scheduled(event, env, ctx) {
    const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/${env.GH_WORKFLOW}/dispatches`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "fetch-wind-trigger",
      },
      body: JSON.stringify({ ref: env.GH_REF }),
    });
    if (!res.ok) {
      console.error("dispatch failed", res.status, await res.text());
    }
  },
};
