function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
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

export const env = {
  discordToken: required("DISCORD_TOKEN"),
  clientId: required("CLIENT_ID"),
  guildId: process.env.GUILD_ID?.trim() || null,
  databasePath: process.env.DATABASE_PATH?.trim() || "data/gpt-honeypot.sqlite",
  defaultAction: process.env.DEFAULT_ACTION?.trim() || "softban",
  honeypotChannelName: process.env.HONEYPOT_CHANNEL_NAME?.trim() || "read-me-first",
  dryRun: flag("DRY_RUN"),
  ignoreDiscordBots: flag("IGNORE_DISCORD_BOTS", true),
  deleteMessageSeconds: numberInRange("DELETE_MESSAGE_SECONDS", 3_600, 0, 604_800)
};
