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

export type GuildState = GuildConfig & { channels: HoneypotChannel[] };

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

if (env.databasePath !== ":memory:") mkdirSync(dirname(env.databasePath), { recursive: true });

const sqlite = new Database(env.databasePath, { strict: true });
sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");

function now() {
  return new Date().toISOString();
}

function columns(table: string): Set<string> {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

function createCurrentTables() {
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
  `);
}

function migrateLegacyConfig() {
  const guildColumns = columns("guild_config");
  if (!guildColumns.has("trap_channel_id") && !guildColumns.has("warning_message_id")) return;

  sqlite.transaction(() => {
    sqlite.exec("ALTER TABLE guild_config RENAME TO guild_config_legacy;");
    createCurrentTables();
    sqlite.exec(`
      INSERT OR REPLACE INTO guild_config (guild_id, log_channel_id, action, enabled, created_at, updated_at)
      SELECT guild_id, log_channel_id, CASE WHEN action IN ('softban', 'ban', 'disabled') THEN action ELSE 'softban' END, enabled, created_at, updated_at
      FROM guild_config_legacy;

      INSERT OR IGNORE INTO honeypot_channels (guild_id, channel_id, warning_message_id, created_at, updated_at)
      SELECT guild_id, trap_channel_id, warning_message_id, created_at, updated_at
      FROM guild_config_legacy
      WHERE trap_channel_id IS NOT NULL;

      DROP TABLE guild_config_legacy;
    `);
  })();
}

function migrateLegacyEvents() {
  if (!columns("moderation_events").has("username")) return;

  sqlite.transaction(() => {
    sqlite.exec("ALTER TABLE moderation_events RENAME TO moderation_events_legacy;");
    createCurrentTables();
    sqlite.exec(`
      INSERT OR IGNORE INTO moderation_events (id, guild_id, user_id, channel_id, message_id, action, outcome, reason, created_at)
      SELECT id, guild_id, user_id, COALESCE(channel_id, ''), COALESCE(message_id, ''), action, outcome, reason, created_at
      FROM moderation_events_legacy
      WHERE message_id IS NOT NULL;

      DROP TABLE moderation_events_legacy;
    `);
  })();
}

if (columns("guild_config").size === 0) createCurrentTables();
else migrateLegacyConfig();

createCurrentTables();
migrateLegacyEvents();
sqlite.exec(`
  UPDATE guild_config SET action = 'softban' WHERE action NOT IN ('softban', 'ban', 'disabled');
  CREATE INDEX IF NOT EXISTS idx_channels_guild ON honeypot_channels(guild_id);
  CREATE INDEX IF NOT EXISTS idx_events_guild_created ON moderation_events(guild_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_events_guild_channel ON moderation_events(guild_id, channel_id, created_at);
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
  return { ...ensureConfig(guildId), channels: listChannels(guildId) };
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
  const suffix = channelId ? " AND channel_id = ?" : "";
  const args = channelId ? [guildId, channelId] : [guildId];
  const events = sqlite.query(`SELECT COUNT(*) AS count FROM moderation_events WHERE guild_id = ?${suffix}`).get(...args) as { count: number };
  const caught = sqlite
    .query(`SELECT COUNT(*) AS count FROM moderation_events WHERE guild_id = ? AND outcome = 'success'${suffix}`)
    .get(...args) as { count: number };

  return { events: Number(events.count), caught: Number(caught.count) };
}

export function closeDb() {
  sqlite.close();
}
