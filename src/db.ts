import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ACTIONS, type HoneypotAction, isHoneypotAction } from "./actions";
import { env } from "./env";

export type GuildConfig = {
  guildId: string;
  trapChannelId: string | null;
  logChannelId: string | null;
  warningMessageId: string | null;
  action: HoneypotAction;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type ConfigRow = {
  guild_id: string;
  trap_channel_id: string | null;
  log_channel_id: string | null;
  warning_message_id: string | null;
  action: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

if (env.databasePath !== ":memory:") mkdirSync(dirname(env.databasePath), { recursive: true });

const sqlite = new Database(env.databasePath);
sqlite.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,
    trap_channel_id TEXT,
    log_channel_id TEXT,
    warning_message_id TEXT,
    action TEXT NOT NULL DEFAULT 'softban',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS moderation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT,
    channel_id TEXT,
    message_id TEXT,
    action TEXT NOT NULL,
    outcome TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_events_guild_created ON moderation_events(guild_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_events_user ON moderation_events(user_id);
`);

function now() {
  return new Date().toISOString();
}

function parseRow(row: ConfigRow): GuildConfig {
  return {
    guildId: row.guild_id,
    trapChannelId: row.trap_channel_id,
    logChannelId: row.log_channel_id,
    warningMessageId: row.warning_message_id,
    action: isHoneypotAction(row.action) ? row.action : "softban",
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function safeDefaultAction(): HoneypotAction {
  return ACTIONS.includes(env.defaultAction as HoneypotAction) ? (env.defaultAction as HoneypotAction) : "softban";
}

export function getConfig(guildId: string): GuildConfig | null {
  const row = sqlite.query("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId) as ConfigRow | null;
  return row ? parseRow(row) : null;
}

export function ensureConfig(guildId: string): GuildConfig {
  const existing = getConfig(guildId);
  if (existing) return existing;
  const stamp = now();
  sqlite
    .query("INSERT INTO guild_config (guild_id, action, enabled, created_at, updated_at) VALUES (?, ?, 1, ?, ?)")
    .run(guildId, safeDefaultAction(), stamp, stamp);
  return getConfig(guildId)!;
}

export function updateConfig(guildId: string, patch: Partial<Omit<GuildConfig, "guildId" | "createdAt" | "updatedAt">>): GuildConfig {
  const current = ensureConfig(guildId);
  const next = { ...current, ...patch, updatedAt: now() };
  sqlite
    .query(
      "UPDATE guild_config SET trap_channel_id = ?, log_channel_id = ?, warning_message_id = ?, action = ?, enabled = ?, updated_at = ? WHERE guild_id = ?"
    )
    .run(
      next.trapChannelId,
      next.logChannelId,
      next.warningMessageId,
      next.action,
      next.enabled ? 1 : 0,
      next.updatedAt,
      guildId
    );
  return getConfig(guildId)!;
}

export function logEvent(input: {
  guildId: string;
  userId: string;
  username: string;
  channelId: string;
  messageId: string;
  action: HoneypotAction;
  outcome: string;
  reason?: string;
}) {
  sqlite
    .query(
      "INSERT INTO moderation_events (guild_id, user_id, username, channel_id, message_id, action, outcome, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(input.guildId, input.userId, input.username, input.channelId, input.messageId, input.action, input.outcome, input.reason ?? null, now());
}

export function getGuildStats(guildId: string) {
  const total = sqlite.query("SELECT COUNT(*) AS count FROM moderation_events WHERE guild_id = ?").get(guildId) as { count: number };
  const success = sqlite.query("SELECT COUNT(*) AS count FROM moderation_events WHERE guild_id = ? AND outcome = 'success'").get(guildId) as { count: number };
  return { total: Number(total.count), success: Number(success.count) };
}

export function closeDb() {
  sqlite.close();
}
