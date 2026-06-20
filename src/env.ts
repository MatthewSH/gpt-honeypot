function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optional(name: string): string | null {
  return process.env[name]?.trim() || null;
}

function flag(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function numberInRange(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function list(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  if (!value) return fallback;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

const dashboardEnabled = flag("DASHBOARD_ENABLED", false);
const dashboardToken = optional("DASHBOARD_TOKEN");
if (dashboardEnabled && !dashboardToken) throw new Error("DASHBOARD_TOKEN is required when DASHBOARD_ENABLED=true");

export const env = {
  discordToken: required("DISCORD_TOKEN"),
  clientId: required("CLIENT_ID"),
  guildId: optional("GUILD_ID"),
  databasePath: optional("DATABASE_PATH") || "data/gpt-honeypot.sqlite",
  defaultAction: optional("DEFAULT_ACTION") || "softban",
  honeypotChannelNames: list("HONEYPOT_CHANNEL_NAMES", ["read-me-first", "rules-check", "verify-here", "start-here"]),
  trapSlowmodeSeconds: numberInRange("TRAP_SLOWMODE_SECONDS", 5, 0, 21_600),
  dryRun: flag("DRY_RUN"),
  ignoreDiscordBots: flag("IGNORE_DISCORD_BOTS", true),
  deleteMessageSeconds: numberInRange("DELETE_MESSAGE_SECONDS", 3_600, 0, 604_800),
  dashboardEnabled,
  dashboardToken,
  dashboardHost: optional("DASHBOARD_HOST") || "0.0.0.0",
  dashboardPort: numberInRange("DASHBOARD_PORT", 3000, 1, 65_535)
};
