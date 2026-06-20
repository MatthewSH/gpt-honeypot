import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ACTIONS, type HoneypotAction, isHoneypotAction } from "./actions";
import { env } from "./env";

export type GuildConfig = {
  guildId: string;
  logChannelId: string | null;
  action: HoneypotAction;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HoneypotChannel = {
  guildId: string;
  channelId: string;
  warningMessageId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AllowlistEntry = {
  guildId: string;
  userId: string;
  createdAt: string;
};

export type ModerationEvent = {
  id: number;
  guildId: string;
  userId: string;
  channelId: string;
  messageId: string;
  action: string;
  outcome: string;
  reason: string | null;
  createdAt: string;
};

export type GuildState = GuildConfig & { channels: HoneypotChannel[]; allowlist: AllowlistEntry[] };

type ConfigRow = {
  guild_id: string;
  log_channel_id: string | null;
  action: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

type ChannelRow = {
  guild_id: string;
  channel_id: string;
  warning_message_id: string | null;
  created_at: string;
  updated_at: string;
};

type AllowlistRow = {
  guild_id: string;
  user_id: string;
  created_at: string;
};

type EventRow = {
  id: number;
  guild_id: string;
  user_id: string;
  channel_id: string;
  message_id: string;
  action: string;
  outcome: string;
  reason: string | null;
  created_at: string;
};

if (env.databasePath !== ":memory:") mkdirSync(dirname(env.databasePath), { recursive: true });

const sqlite = new Database(env.databasePath, { strict: true });
sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");

function now() {
  return new Date().toISOString();
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT,
    action TEXT NOT NULL DEFAULT 'softban',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS honeypot_channels (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    warning_message_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS guild_allowlist (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS moderation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    action TEXT NOT NULL,
    outcome TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL
  );

  UPDATE guild_config SET enabled = 0, action = 'softban' WHERE action NOT IN ('softban', 'ban');

  CREATE INDEX IF NOT EXISTS idx_channels_guild ON honeypot_channels(guild_id);
  CREATE INDEX IF NOT EXISTS idx_allowlist_guild ON guild_allowlist(guild_id);
  CREATE INDEX IF NOT EXISTS idx_events_guild_created ON moderation_events(guild_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_events_guild_channel ON moderation_events(guild_id, channel_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_events_created ON moderation_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_events_user ON moderation_events(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_events_unique_message ON moderation_events(guild_id, message_id);
`);

function parseConfig(row: ConfigRow): GuildConfig {
  return {
    guildId: row.guild_id,
    logChannelId: row.log_channel_id,
    action: isHoneypotAction(row.action) ? row.action : "softban",
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseChannel(row: ChannelRow): HoneypotChannel {
  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    warningMessageId: row.warning_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseAllowlist(row: AllowlistRow): AllowlistEntry {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    createdAt: row.created_at
  };
}

function parseEvent(row: EventRow): ModerationEvent {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    action: row.action,
    outcome: row.outcome,
    reason: row.reason,
    createdAt: row.created_at
  };
}

function safeDefaultAction(): HoneypotAction {
  return ACTIONS.includes(env.defaultAction as HoneypotAction) ? (env.defaultAction as HoneypotAction) : "softban";
}

export function getConfig(guildId: string): GuildConfig | null {
  const row = sqlite.query("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId) as ConfigRow | null;
  return row ? parseConfig(row) : null;
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
    .query("UPDATE guild_config SET log_channel_id = ?, action = ?, enabled = ?, updated_at = ? WHERE guild_id = ?")
    .run(next.logChannelId, next.action, next.enabled ? 1 : 0, next.updatedAt, guildId);

  return getConfig(guildId)!;
}

export function listChannels(guildId: string): HoneypotChannel[] {
  const rows = sqlite.query("SELECT * FROM honeypot_channels WHERE guild_id = ? ORDER BY created_at ASC").all(guildId) as ChannelRow[];
  return rows.map(parseChannel);
}

export function getChannel(guildId: string, channelId: string): HoneypotChannel | null {
  const row = sqlite.query("SELECT * FROM honeypot_channels WHERE guild_id = ? AND channel_id = ?").get(guildId, channelId) as ChannelRow | null;
  return row ? parseChannel(row) : null;
}

export function getState(guildId: string): GuildState {
  return { ...ensureConfig(guildId), channels: listChannels(guildId), allowlist: listAllowlist(guildId) };
}

export function addChannel(guildId: string, channelId: string): HoneypotChannel {
  ensureConfig(guildId);
  const stamp = now();
  sqlite
    .query(
      "INSERT INTO honeypot_channels (guild_id, channel_id, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, channel_id) DO UPDATE SET updated_at = excluded.updated_at"
    )
    .run(guildId, channelId, stamp, stamp);
  return getChannel(guildId, channelId)!;
}

export function removeChannel(guildId: string, channelId: string): boolean {
  const result = sqlite.query("DELETE FROM honeypot_channels WHERE guild_id = ? AND channel_id = ?").run(guildId, channelId);
  return result.changes > 0;
}

export function setWarningMessage(guildId: string, channelId: string, warningMessageId: string | null): HoneypotChannel | null {
  const stamp = now();
  sqlite
    .query("UPDATE honeypot_channels SET warning_message_id = ?, updated_at = ? WHERE guild_id = ? AND channel_id = ?")
    .run(warningMessageId, stamp, guildId, channelId);
  return getChannel(guildId, channelId);
}

export function addAllowlist(guildId: string, userId: string): AllowlistEntry {
  ensureConfig(guildId);
  sqlite.query("INSERT OR IGNORE INTO guild_allowlist (guild_id, user_id, created_at) VALUES (?, ?, ?)").run(guildId, userId, now());
  return sqlite.query("SELECT * FROM guild_allowlist WHERE guild_id = ? AND user_id = ?").get(guildId, userId) as AllowlistEntry;
}

export function removeAllowlist(guildId: string, userId: string): boolean {
  const result = sqlite.query("DELETE FROM guild_allowlist WHERE guild_id = ? AND user_id = ?").run(guildId, userId);
  return result.changes > 0;
}

export function isAllowlisted(guildId: string, userId: string): boolean {
  return Boolean(sqlite.query("SELECT 1 FROM guild_allowlist WHERE guild_id = ? AND user_id = ?").get(guildId, userId));
}

export function listAllowlist(guildId: string): AllowlistEntry[] {
  const rows = sqlite.query("SELECT * FROM guild_allowlist WHERE guild_id = ? ORDER BY created_at ASC").all(guildId) as AllowlistRow[];
  return rows.map(parseAllowlist);
}

export function claimEvent(input: {
  guildId: string;
  userId: string;
  channelId: string;
  messageId: string;
  action: HoneypotAction;
}): boolean {
  const result = sqlite
    .query(
      "INSERT OR IGNORE INTO moderation_events (guild_id, user_id, channel_id, message_id, action, outcome, created_at) VALUES (?, ?, ?, ?, ?, 'claimed', ?)"
    )
    .run(input.guildId, input.userId, input.channelId, input.messageId, input.action, now());

  return result.changes > 0;
}

export function finishEvent(guildId: string, messageId: string, outcome: string, reason?: string) {
  sqlite
    .query("UPDATE moderation_events SET outcome = ?, reason = ? WHERE guild_id = ? AND message_id = ?")
    .run(outcome, reason ?? null, guildId, messageId);
}

export function getGuildStats(guildId: string, channelId?: string | null) {
  const where = channelId ? "guild_id = ? AND channel_id = ?" : "guild_id = ?";
  const args = channelId ? [guildId, channelId] : [guildId];
  const events = sqlite.query(`SELECT COUNT(*) AS count FROM moderation_events WHERE ${where}`).get(...args) as { count: number };
  const caught = sqlite.query(`SELECT COUNT(*) AS count FROM moderation_events WHERE ${where} AND outcome = 'success'`).get(...args) as { count: number };

  return { events: Number(events.count), caught: Number(caught.count) };
}

export function getGlobalStats() {
  const [guilds, channels, allowlisted, events, caught] = [
    "SELECT COUNT(*) AS count FROM guild_config",
    "SELECT COUNT(*) AS count FROM honeypot_channels",
    "SELECT COUNT(*) AS count FROM guild_allowlist",
    "SELECT COUNT(*) AS count FROM moderation_events",
    "SELECT COUNT(*) AS count FROM moderation_events WHERE outcome = 'success'"
  ].map((query) => sqlite.query(query).get() as { count: number });

  return {
    guilds: Number(guilds.count),
    channels: Number(channels.count),
    allowlisted: Number(allowlisted.count),
    events: Number(events.count),
    caught: Number(caught.count)
  };
}

export function listGuildStats() {
  const rows = sqlite.query("SELECT guild_id FROM guild_config ORDER BY created_at ASC").all() as { guild_id: string }[];
  return rows.map((row) => ({
    guildId: row.guild_id,
    channels: listChannels(row.guild_id).length,
    allowlisted: listAllowlist(row.guild_id).length,
    ...getGuildStats(row.guild_id)
  }));
}

export function listRecentEvents(limit = 50): ModerationEvent[] {
  const rows = sqlite
    .query("SELECT * FROM moderation_events ORDER BY created_at DESC LIMIT ?")
    .all(Math.max(1, Math.min(200, limit))) as EventRow[];
  return rows.map(parseEvent);
}

export function closeDb() {
  sqlite.close();
}
