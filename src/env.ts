import { Buffer } from "node:buffer";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function bool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function int(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clientIdFromToken(token: string): string | null {
  try {
    return Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8") || null;
  } catch {
    return null;
  }
}

const token = required("DISCORD_TOKEN");

export const env = {
  discordToken: token,
  clientId: process.env.CLIENT_ID || clientIdFromToken(token) || required("CLIENT_ID"),
  databasePath: process.env.DATABASE_PATH || "data/gpt-honeypot.sqlite",
  defaultAction: process.env.DEFAULT_ACTION || "softban",
  honeypotChannelName: process.env.HONEYPOT_CHANNEL_NAME || "read-me-first",
  dryRun: bool("DRY_RUN"),
  ignoreDiscordBots: bool("IGNORE_DISCORD_BOTS", true),
  timeoutMinutes: int("TIMEOUT_MINUTES", 60, 1, 10_080),
  deleteMessageSeconds: int("DELETE_MESSAGE_SECONDS", 3_600, 0, 604_800)
};
