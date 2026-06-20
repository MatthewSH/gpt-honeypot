import type { Client } from "discord.js";
import { getGlobalStats, listGuildStats, listRecentEvents } from "./db";
import { env } from "./env";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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
      if (url.pathname === "/api/summary") return json({ ...getGlobalStats(), discordGuilds: client.guilds.cache.size });
      if (url.pathname === "/api/guilds") return json(listGuildStats());
      if (url.pathname === "/api/events") return json(listRecentEvents(Number(url.searchParams.get("limit") || 50)));
      return json({ ok: true, endpoints: ["/api/summary", "/api/guilds", "/api/events"] });
    }
  });

  console.log(`Dashboard listening on http://${server.hostname}:${server.port}`);
}
