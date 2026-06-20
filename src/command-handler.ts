import { ChannelType, MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction, type Guild } from "discord.js";
import { isHoneypotAction } from "./actions";
import { addAllowlist, addChannel, ensureConfig, getGuildStats, getState, listAllowlist, removeAllowlist, removeChannel, updateConfig, type GuildState } from "./db";
import { createDecoys, refreshAllWarnings, refreshWarning } from "./traps";

function status(state: GuildState): string {
  const stats = getGuildStats(state.guildId);
  const traps = state.channels.length === 0 ? "none" : state.channels.map((channel) => `<#${channel.channelId}>`).join(", ");
  return [
    "## GPT Honeypot",
    `Enabled: **${state.enabled ? "yes" : "no"}**`,
    `Action: **${state.action}**`,
    `Traps: ${traps}`,
    `Allowlisted users: **${state.allowlist.length}**`,
    `Logs: ${state.logChannelId ? `<#${state.logChannelId}>` : "not set"}`,
    `Events: **${stats.events}** total, **${stats.caught}** caught`
  ].join("\n");
}

async function reply(interaction: ChatInputCommandInteraction, content: string) {
  if (interaction.deferred) return interaction.editReply({ content });
  if (interaction.replied) return interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function createAndRefresh(guild: Guild, count: number) {
  const config = ensureConfig(guild.id);
  const traps = await createDecoys(guild, count);
  for (const trap of traps) await refreshWarning(guild, config, trap);
  return traps;
}

async function handleChannels(interaction: ChatInputCommandInteraction, sub: string) {
  const guild = interaction.guild!;
  if (sub === "add") {
    const channel = interaction.options.getChannel("channel", true);
    if (channel.type !== ChannelType.GuildText) return reply(interaction, "Pick a text channel.");
    const config = ensureConfig(guild.id);
    const trap = addChannel(guild.id, channel.id);
    await refreshWarning(guild, config, trap);
    return reply(interaction, `Added <#${channel.id}>.\n${status(getState(guild.id))}`);
  }

  if (sub === "create") {
    const traps = await createAndRefresh(guild, interaction.options.getInteger("count", true));
    return reply(interaction, `Created ${traps.length} decoy channel(s).\n${status(getState(guild.id))}`);
  }

  if (sub === "remove") {
    const channel = interaction.options.getChannel("channel", true);
    const removed = removeChannel(guild.id, channel.id);
    return reply(interaction, `${removed ? "Removed" : "Was not tracking"} <#${channel.id}>.\n${status(getState(guild.id))}`);
  }

  return reply(interaction, status(getState(guild.id)));
}

async function handleAllowlist(interaction: ChatInputCommandInteraction, sub: string) {
  const guild = interaction.guild!;
  if (sub === "add") {
    const user = interaction.options.getUser("user", true);
    addAllowlist(guild.id, user.id);
    return reply(interaction, `Allowlisted ${user.id}.\n${status(getState(guild.id))}`);
  }

  if (sub === "remove") {
    const user = interaction.options.getUser("user", true);
    const removed = removeAllowlist(guild.id, user.id);
    return reply(interaction, `${removed ? "Removed" : "Was not allowlisted"} ${user.id}.\n${status(getState(guild.id))}`);
  }

  const entries = listAllowlist(guild.id);
  const body = entries.length === 0 ? "none" : entries.map((entry) => `- ${entry.userId}`).join("\n");
  return reply(interaction, `Allowlist:\n${body}`);
}

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.inCachedGuild()) return reply(interaction, "Use this in a server.");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return reply(interaction, "You need Manage Server.");

  const guild = interaction.guild;
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();
  if (group === "channels") return handleChannels(interaction, sub);
  if (group === "allowlist") return handleAllowlist(interaction, sub);

  let config = ensureConfig(guild.id);
  if (sub === "setup") {
    const channel = interaction.options.getChannel("channel");
    const logChannel = interaction.options.getChannel("log-channel");
    const action = interaction.options.getString("action");
    const decoys = interaction.options.getInteger("decoys") ?? 0;
    config = updateConfig(guild.id, { enabled: true, action: isHoneypotAction(action) ? action : config.action });
    if (logChannel?.type === ChannelType.GuildText) config = updateConfig(guild.id, { logChannelId: logChannel.id });
    if (channel?.type === ChannelType.GuildText) await refreshWarning(guild, config, addChannel(guild.id, channel.id));
    if (!channel && (getState(guild.id).channels.length === 0 || decoys > 0)) await createAndRefresh(guild, decoys || 1);
    return reply(interaction, `Ready.\n${status(getState(guild.id))}`);
  }

  if (sub === "status" || sub === "stats") return reply(interaction, status(getState(guild.id)));
  if (sub === "enable") return reply(interaction, status(await (async () => { const state = { ...getState(guild.id), ...updateConfig(guild.id, { enabled: true }) }; await refreshAllWarnings(guild, state); return getState(guild.id); })()));
  if (sub === "disable") return reply(interaction, status(await (async () => { const state = { ...getState(guild.id), ...updateConfig(guild.id, { enabled: false }) }; await refreshAllWarnings(guild, state); return getState(guild.id); })()));

  if (sub === "action") {
    const action = interaction.options.getString("action");
    if (!isHoneypotAction(action)) return reply(interaction, "Invalid action.");
    config = updateConfig(guild.id, { action, enabled: true });
    await refreshAllWarnings(guild, { ...getState(guild.id), ...config });
    return reply(interaction, status(getState(guild.id)));
  }

  if (sub === "log") {
    const channel = interaction.options.getChannel("channel", true);
    if (channel.type !== ChannelType.GuildText) return reply(interaction, "Pick a text channel.");
    return reply(interaction, status({ ...getState(guild.id), ...updateConfig(guild.id, { logChannelId: channel.id }) }));
  }
}
