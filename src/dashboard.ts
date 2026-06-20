import type { Client } from "discord.js";
import { getGlobalStats, listGuildStats, listRecentEvents } from "./db";
import { env } from "./env";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function page() {
  return `<!doctype html><meta name="viewport" content="width=device-width"><title>GPT Honeypot</title><style>body{font-family:system-ui;background:#09090b;color:#fafafa;margin:2rem}section{background:#18181b;border:1px solid #27272a;border-radius:1rem;padding:1rem;margin:1rem 0}pre{white-space:pre-wrap}</style><h1>🍯 GPT Honeypot</h1><p>Use <code>?key=...</code> or <code>x-dashboard-token</code>.</p><section><h2>Summary</h2><pre id="summary">loading</pre></section><section><h2>Servers</h2><pre id="guilds">loading</pre></section><section><h2>Recent</h2><pre id="events">loading</pre></section><script>const key=new URLSearchParams(location.search).get('key')||'';const load=(id,path)=>fetch(path+'?key='+encodeURIComponent(key)).then(r=>r.json()).then(v=>document.getElementById(id).textContent=JSON.stringify(v,null,2));load('summary','/api/summary');load('guilds','/api/guilds');load('events','/api/events');</script>`;
}

export function startDashboard(client: Client) {
  if (!env.dashboardEnabled) return;
  if (!env.dashboardToken) throw new Error("Dashboard token missing");

  const server = Bun.serve({
    hostname: env.dashboardHost,
    port: env.dashboardPort,
    fetch(request) {
      const url = new URL(request.url);
      const key = request.headers.get("x-dashboard-token") ?? url.searchParams.get("key");
      if (key !== env.dashboardToken) return json({ error: "unauthorized" }, 401);
      if (url.pathname === "/") return new Response(page(), { headers: { "content-type": "text/html; charset=utf-8" } });
      if (url.pathname === "/api/summary") return json({ ...getGlobalStats(), discordGuilds: client.guilds.cache.size });
      if (url.pathname === "/api/guilds") return json(listGuildStats());
      if (url.pathname === "/api/events") return json(listRecentEvents(Number(url.searchParams.get("limit") || 50)));
      return json({ error: "not_found" }, 404);
    }
  });

  console.log(`Dashboard listening on http://${server.hostname}:${server.port}`);
}
