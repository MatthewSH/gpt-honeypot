import { ChannelType, PermissionFlagsBits, type Guild } from "discord.js";
import { addChannel, getGuildStats, listChannels, removeChannel, setWarningMessage, type GuildConfig, type GuildState, type HoneypotChannel } from "./db";
import { env } from "./env";
import { botMember, textChannel } from "./guild-utils";

function decoyName(index: number): string {
  const names = env.honeypotChannelNames;
  const base = names[index % names.length] ?? "read-me-first";
  const suffix = index < names.length ? "" : `-${Math.floor(index / names.length) + 1}`;
  return `${base}${suffix}`.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").slice(0, 90) || "read-me-first";
}

export function warningText(config: GuildConfig, channel: HoneypotChannel): string {
  const guildStats = getGuildStats(config.guildId);
  const channelStats = getGuildStats(config.guildId, channel.channelId);
  const mode = config.enabled ? config.action : "off";
  return [
    "# 🍯 GPT Honeypot",
    "This is a visible bot trap. Do not post here unless staff allowlisted you.",
    `Mode: **${mode}**`,
    `Caught here: **${channelStats.caught}**`,
    `Caught server-wide: **${guildStats.caught}**`,
    "Staff: use `/honeypot status` to manage traps."
  ].join("\n");
}

export async function refreshWarning(guild: Guild, config: GuildConfig, trap: HoneypotChannel): Promise<HoneypotChannel | null> {
  const channel = await textChannel(guild, trap.channelId);
  if (!channel) {
    removeChannel(guild.id, trap.channelId);
    return null;
  }

  const content = warningText(config, trap);
  if (trap.warningMessageId) {
    const existing = await channel.messages.fetch(trap.warningMessageId).catch(() => null);
    if (existing) {
      await existing.edit({ content, allowedMentions: { parse: [] } }).catch(() => undefined);
      return trap;
    }
  }

  const sent = await channel.send({ content, allowedMentions: { parse: [] } });
  await sent.pin("GPT Honeypot warning").catch(() => undefined);
  return setWarningMessage(guild.id, trap.channelId, sent.id);
}

export async function refreshAllWarnings(guild: Guild, state: GuildState): Promise<void> {
  for (const trap of state.channels) await refreshWarning(guild, state, trap).catch(() => undefined);
}

export async function createTrapChannel(guild: Guild): Promise<HoneypotChannel> {
  const me = await botMember(guild);
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error("Manage Channels is required to create traps automatically. Pass existing channels instead.");
  }

  const channel = await guild.channels.create({
    name: decoyName(listChannels(guild.id).length),
    type: ChannelType.GuildText,
    topic: "Visible bot trap channel. Posting here may remove the account.",
    rateLimitPerUser: env.trapSlowmodeSeconds,
    reason: "GPT Honeypot trap setup",
    permissionOverwrites: [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }]
  });

  return addChannel(guild.id, channel.id);
}

export async function createDecoys(guild: Guild, count: number): Promise<HoneypotChannel[]> {
  const traps: HoneypotChannel[] = [];
  for (let i = 0; i < count; i++) traps.push(await createTrapChannel(guild));
  return traps;
}
