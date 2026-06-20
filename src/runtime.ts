import {
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type Message,
  type TextChannel
} from "discord.js";
import { isHoneypotAction, type HoneypotAction } from "./actions";
import { commands } from "./commands";
import {
  addChannel,
  claimEvent,
  closeDb,
  ensureConfig,
  finishEvent,
  getChannel,
  getConfig,
  getGuildStats,
  getState,
  listChannels,
  removeChannel,
  setWarningMessage,
  updateConfig,
  type GuildConfig,
  type GuildState,
  type HoneypotChannel
} from "./db";
import { env } from "./env";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const activeUsers = new Set<string>();

type ActionResult = { outcome: "success" | "failed" | "skipped" | "dry-run"; reason: string };

function shortReason(value: unknown): string {
  return (value instanceof Error ? value.message : String(value)).replace(/\s+/g, " ").slice(0, 300) || "unknown";
}

function channelStats(config: GuildConfig, channel: HoneypotChannel): string {
  const guildStats = getGuildStats(config.guildId);
  const trapStats = getGuildStats(config.guildId, channel.channelId);
  const mode = config.enabled ? config.action : "disabled";

  return [
    "# 🍯 GPT Honeypot",
    "This is a visible bot trap. Do not post here.",
    `Mode: **${mode}**`,
    `Caught here: **${trapStats.caught}**`,
    `Caught server-wide: **${guildStats.caught}**`,
    "Staff: use `/honeypot status` to manage traps."
  ].join("\n");
}

function status(state: GuildState): string {
  const stats = getGuildStats(state.guildId);
  const traps = state.channels.length === 0 ? "none" : state.channels.map((channel) => `<#${channel.channelId}>`).join(", ");

  return [
    "## GPT Honeypot",
    `Enabled: **${state.enabled ? "yes" : "no"}**`,
    `Mode: **${state.action}**`,
    `Traps: ${traps}`,
    `Logs: ${state.logChannelId ? `<#${state.logChannelId}>` : "not set"}`,
    `Events: **${stats.events}** total, **${stats.caught}** caught`
  ].join("\n");
}

async function reply(interaction: ChatInputCommandInteraction, content: string) {
  if (interaction.deferred) {
    await interaction.editReply({ content });
  } else if (interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

async function textChannel(guild: Guild, id: string | null): Promise<TextChannel | null> {
  if (!id) return null;
  const channel = await guild.channels.fetch(id).catch(() => null);
  return channel?.type === ChannelType.GuildText ? channel : null;
}

async function botMember(guild: Guild): Promise<GuildMember | null> {
  return guild.members.me ?? guild.members.fetchMe().catch(() => null);
}

async function refreshWarning(guild: Guild, config: GuildConfig, trap: HoneypotChannel): Promise<HoneypotChannel | null> {
  const channel = await textChannel(guild, trap.channelId);
  if (!channel) {
    removeChannel(guild.id, trap.channelId);
    return null;
  }

  const content = channelStats(config, trap);
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

async function refreshAllWarnings(guild: Guild, state = getState(guild.id)): Promise<GuildState> {
  for (const trap of state.channels) {
    await refreshWarning(guild, state, trap).catch(() => undefined);
  }

  return getState(guild.id);
}

async function createTrapChannel(guild: Guild): Promise<HoneypotChannel> {
  const me = await botMember(guild);
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error("Manage Channels is required to create a trap automatically. Pass an existing channel instead.");
  }

  const channel = await guild.channels.create({
    name: env.honeypotChannelName,
    type: ChannelType.GuildText,
    topic: "GPT Honeypot visible trap channel.",
    rateLimitPerUser: 3_600,
    reason: "GPT Honeypot trap setup",
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
      }
    ]
  });

  return addChannel(guild.id, channel.id);
}

async function ensureAtLeastOneTrap(guild: Guild): Promise<GuildState> {
  let state = getState(guild.id);
  if (state.channels.length === 0) {
    const trap = await createTrapChannel(guild);
    await refreshWarning(guild, state, trap);
  } else {
    await refreshAllWarnings(guild, state);
  }

  return getState(guild.id);
}

async function sendLog(message: Message<true>, config: GuildConfig, result: ActionResult) {
  const channel = (await textChannel(message.guild, config.logChannelId)) ?? (await textChannel(message.guild, message.channelId));
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("GPT Honeypot trigger")
    .setDescription(`${message.author} posted in ${message.channel}.`)
    .addFields(
      { name: "User ID", value: message.author.id, inline: true },
      { name: "Action", value: config.action, inline: true },
      { name: "Outcome", value: result.outcome, inline: true },
      { name: "Reason", value: result.reason.slice(0, 1024) || "none" },
      { name: "Evidence", value: `https://discord.com/channels/${message.guild.id}/${message.channelId}/${message.id}` }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => undefined);
}

async function act(message: Message<true>, action: HoneypotAction): Promise<ActionResult> {
  if (env.dryRun) return { outcome: "dry-run", reason: "DRY_RUN=true" };
  if (message.guild.ownerId === message.author.id) return { outcome: "skipped", reason: "server owner" };
  if (action === "disabled") return { outcome: "skipped", reason: "disabled" };

  const me = await botMember(message.guild);
  if (!me) return { outcome: "failed", reason: "bot member not found" };
  if (!me.permissions.has(PermissionFlagsBits.BanMembers)) return { outcome: "failed", reason: "missing Ban Members" };

  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (member && !member.bannable) return { outcome: "failed", reason: "target is not bannable" };

  const reason = `GPT Honeypot: message ${message.id}`;

  if (action === "softban") {
    await message.guild.members.ban(message.author.id, { deleteMessageSeconds: env.deleteMessageSeconds, reason });
    await Bun.sleep(750);
    await message.guild.members.unban(message.author.id, "GPT Honeypot release");
    return { outcome: "success", reason: "softban complete" };
  }

  await message.guild.members.ban(message.author.id, { deleteMessageSeconds: env.deleteMessageSeconds, reason });
  return { outcome: "success", reason: "banned" };
}

async function handleMessage(message: Message) {
  if (!message.inGuild() || !message.guild || message.webhookId) return;
  if (message.author.id === client.user?.id) return;
  if (env.ignoreDiscordBots && message.author.bot) return;

  const config = getConfig(message.guild.id);
  if (!config || !config.enabled || config.action === "disabled") return;

  const trap = getChannel(message.guild.id, message.channelId);
  if (!trap) return;

  const userKey = `${message.guild.id}:${message.author.id}`;
  if (activeUsers.has(userKey)) return;
  if (!claimEvent({ guildId: message.guild.id, userId: message.author.id, channelId: message.channelId, messageId: message.id, action: config.action })) return;

  activeUsers.add(userKey);
  let result: ActionResult;

  try {
    await message.react("🍯").catch(() => undefined);
    await message.author.send(`You posted in a honeypot channel for ${message.guild.name}.`).catch(() => undefined);
    await textChannel(message.guild, config.logChannelId).then((channel) => channel && message.forward(channel)).catch(() => undefined);

    result = await act(message, config.action);
  } catch (error) {
    result = { outcome: "failed", reason: shortReason(error) };
  } finally {
    activeUsers.delete(userKey);
  }

  finishEvent(message.guild.id, message.id, result.outcome, result.reason);
  await sendLog(message, config, result);
  await refreshWarning(message.guild, config, trap).catch(() => undefined);
}

async function handleChannelGroup(interaction: ChatInputCommandInteraction, sub: string) {
  const guild = interaction.guild!;

  if (sub === "add") {
    const channel = interaction.options.getChannel("channel", true);
    if (channel.type !== ChannelType.GuildText) return reply(interaction, "Pick a text channel.");
    const config = ensureConfig(guild.id);
    const trap = addChannel(guild.id, channel.id);
    await refreshWarning(guild, config, trap);
    return reply(interaction, `Added <#${channel.id}>.\n${status(getState(guild.id))}`);
  }

  if (sub === "remove") {
    const channel = interaction.options.getChannel("channel", true);
    const removed = removeChannel(guild.id, channel.id);
    return reply(interaction, `${removed ? "Removed" : "Was not tracking"} <#${channel.id}>.\n${status(getState(guild.id))}`);
  }

  return reply(interaction, status(getState(guild.id)));
}

async function handleCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.inCachedGuild()) return reply(interaction, "Use this in a server.");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return reply(interaction, "You need Manage Server.");

  const guild = interaction.guild;
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (group === "channels") return handleChannelGroup(interaction, sub);

  let config = ensureConfig(guild.id);

  if (sub === "setup") {
    const channel = interaction.options.getChannel("channel");
    const logChannel = interaction.options.getChannel("log-channel");
    const action = interaction.options.getString("action");

    if (isHoneypotAction(action)) config = updateConfig(guild.id, { action, enabled: action !== "disabled" });
    else config = updateConfig(guild.id, { enabled: true });

    if (logChannel?.type === ChannelType.GuildText) config = updateConfig(guild.id, { logChannelId: logChannel.id });
    if (channel?.type === ChannelType.GuildText) await refreshWarning(guild, config, addChannel(guild.id, channel.id));

    const state = await ensureAtLeastOneTrap(guild);
    return reply(interaction, `Ready.\n${status(state)}`);
  }

  if (sub === "status" || sub === "stats") return reply(interaction, status(getState(guild.id)));
  if (sub === "enable") return reply(interaction, status(await refreshAllWarnings(guild, { ...getState(guild.id), ...updateConfig(guild.id, { enabled: true }) })));
  if (sub === "disable") return reply(interaction, status(await refreshAllWarnings(guild, { ...getState(guild.id), ...updateConfig(guild.id, { enabled: false }) })));

  if (sub === "action") {
    const action = interaction.options.getString("action");
    if (!isHoneypotAction(action)) return reply(interaction, "Invalid action.");
    config = updateConfig(guild.id, { action, enabled: action !== "disabled" });
    return reply(interaction, status(await refreshAllWarnings(guild, { ...getState(guild.id), ...config })));
  }

  if (sub === "log") {
    const channel = interaction.options.getChannel("channel", true);
    if (channel.type !== ChannelType.GuildText) return reply(interaction, "Pick a text channel.");
    return reply(interaction, status({ ...getState(guild.id), ...updateConfig(guild.id, { logChannelId: channel.id }) }));
  }
}

export async function startBot() {
  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`GPT Honeypot online as ${readyClient.user.tag}. Loaded ${commands.length} command group(s).`);
  });

  client.on(Events.GuildCreate, (guild) => {
    ensureAtLeastOneTrap(guild).catch((error) => console.error(`setup failed for ${guild.id}`, error));
  });

  client.on(Events.MessageCreate, (message) => {
    handleMessage(message).catch((error) => console.error("message handler failed", error));
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "honeypot") return;
    handleCommand(interaction).catch(async (error) => {
      console.error("command failed", error);
      const content = "Command failed. Check bot logs.";
      if (interaction.deferred) await interaction.editReply({ content }).catch(() => undefined);
      else if (!interaction.replied) await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    });
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      closeDb();
      client.destroy();
      process.exit(0);
    });
  }

  await client.login(env.discordToken);
}
