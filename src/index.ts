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
  type Message,
  type TextChannel
} from "discord.js";
import { isHoneypotAction, type HoneypotAction } from "./actions";
import { commands } from "./commands";
import { closeDb, ensureConfig, getConfig, getGuildStats, logEvent, updateConfig, type GuildConfig } from "./db";
import { env } from "./env";

const active = new Map<string, number>();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

function warning(config: GuildConfig): string {
  const stats = getGuildStats(config.guildId);
  const mode = config.enabled ? config.action : "disabled";
  return `# 🍯 GPT Honeypot\nDo not post in this channel.\nMode: **${mode}**\nCaught: **${stats.total}**\nStaff: use /honeypot to manage this bot.`;
}

function status(config: GuildConfig): string {
  const stats = getGuildStats(config.guildId);
  return `## GPT Honeypot\nEnabled: **${config.enabled ? "yes" : "no"}**\nMode: **${config.action}**\nTrap: ${config.trapChannelId ? `<#${config.trapChannelId}>` : "not set"}\nLogs: ${config.logChannelId ? `<#${config.logChannelId}>` : "not set"}\nEvents: **${stats.total}** total, **${stats.success}** successful`;
}

async function reply(interaction: ChatInputCommandInteraction, content: string) {
  if (interaction.replied || interaction.deferred) {
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

async function refreshWarning(guild: Guild, config: GuildConfig): Promise<GuildConfig> {
  const channel = await textChannel(guild, config.trapChannelId);
  if (!channel) return config;

  const content = warning(config);
  if (config.warningMessageId) {
    const existing = await channel.messages.fetch(config.warningMessageId).catch(() => null);
    if (existing) {
      await existing.edit(content).catch(() => undefined);
      return config;
    }
  }

  const sent = await channel.send({ content, allowedMentions: { parse: [] } });
  await sent.pin("GPT Honeypot warning").catch(() => undefined);
  return updateConfig(guild.id, { warningMessageId: sent.id });
}

async function ensureTrap(guild: Guild): Promise<GuildConfig> {
  let config = ensureConfig(guild.id);
  const existing = await textChannel(guild, config.trapChannelId);
  if (existing) return refreshWarning(guild, config);

  const channel = await guild.channels.create({
    name: env.honeypotChannelName,
    type: ChannelType.GuildText,
    topic: "GPT Honeypot: visible channel used to catch drive-by spam.",
    reason: "GPT Honeypot setup",
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
      }
    ]
  });

  config = updateConfig(guild.id, { trapChannelId: channel.id, enabled: true });
  return refreshWarning(guild, config);
}

async function sendLog(message: Message<true>, config: GuildConfig, outcome: string, reason: string) {
  const channel = (await textChannel(message.guild, config.logChannelId)) ?? (await textChannel(message.guild, config.trapChannelId));
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("GPT Honeypot event")
    .setDescription(`${message.author} posted in ${message.channel}.`)
    .addFields(
      { name: "Mode", value: config.action, inline: true },
      { name: "Outcome", value: outcome, inline: true },
      { name: "Reason", value: reason.slice(0, 1024) || "none" }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => undefined);
}

async function act(message: Message<true>, action: HoneypotAction): Promise<{ outcome: string; reason: string }> {
  if (env.dryRun) return { outcome: "dry-run", reason: "DRY_RUN=true" };
  if (message.guild.ownerId === message.author.id) return { outcome: "skipped", reason: "server owner" };
  if (action === "disabled") return { outcome: "skipped", reason: "disabled" };

  const reason = `GPT Honeypot: message ${message.id}`;
  const member = await message.guild.members.fetch(message.author.id).catch(() => null);

  if (action === "timeout") {
    if (!member) return { outcome: "failed", reason: "member not found" };
    await member.timeout(env.timeoutMinutes * 60_000, reason);
    return { outcome: "success", reason: `timed out for ${env.timeoutMinutes} minutes` };
  }

  if (action === "kick") {
    if (!member) return { outcome: "failed", reason: "member not found" };
    await member.kick(reason);
    return { outcome: "success", reason: "removed from server" };
  }

  if (action === "softban") {
    await message.guild.members.ban(message.author.id, { deleteMessageSeconds: env.deleteMessageSeconds, reason });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await message.guild.members.unban(message.author.id, "GPT Honeypot soft release");
    return { outcome: "success", reason: "soft action complete" };
  }

  await message.guild.members.ban(message.author.id, { deleteMessageSeconds: env.deleteMessageSeconds, reason });
  return { outcome: "success", reason: "blocked from server" };
}

async function handleMessage(message: Message) {
  if (!message.inGuild() || !message.guild || message.webhookId) return;
  if (message.author.id === client.user?.id) return;
  if (env.ignoreDiscordBots && message.author.bot) return;

  const config = getConfig(message.guild.id);
  if (!config || !config.enabled || config.action === "disabled") return;
  if (message.channelId !== config.trapChannelId) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const until = active.get(key) ?? 0;
  if (until > Date.now()) return;
  active.set(key, Date.now() + 60_000);
  setTimeout(() => active.delete(key), 60_000).unref();

  await message.react("🍯").catch(() => undefined);
  await message.author.send(`You posted in GPT Honeypot for ${message.guild.name}.`).catch(() => undefined);
  await textChannel(message.guild, config.logChannelId).then((channel) => channel && message.forward(channel)).catch(() => undefined);

  let result: { outcome: string; reason: string };
  try {
    result = await act(message, config.action);
  } catch (error) {
    result = { outcome: "failed", reason: error instanceof Error ? error.message : String(error) };
  }

  logEvent({
    guildId: message.guild.id,
    userId: message.author.id,
    username: message.author.tag,
    channelId: message.channelId,
    messageId: message.id,
    action: config.action,
    outcome: result.outcome,
    reason: result.reason
  });

  await sendLog(message, config, result.outcome, result.reason);
  await refreshWarning(message.guild, config).catch(() => undefined);
}

async function handleCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.inCachedGuild()) return reply(interaction, "Use this in a server.");
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return reply(interaction, "You need Manage Server.");

  const guild = interaction.guild;
  const sub = interaction.options.getSubcommand();
  let config = ensureConfig(guild.id);

  if (sub === "setup") {
    const channel = interaction.options.getChannel("channel");
    const logChannel = interaction.options.getChannel("log-channel");
    const action = interaction.options.getString("action");
    const patch: Partial<GuildConfig> = { enabled: true };
    if (channel?.type === ChannelType.GuildText) patch.trapChannelId = channel.id;
    if (logChannel?.type === ChannelType.GuildText) patch.logChannelId = logChannel.id;
    if (isHoneypotAction(action)) patch.action = action;
    config = updateConfig(guild.id, patch);
    if (!config.trapChannelId) config = await ensureTrap(guild);
    config = await refreshWarning(guild, config);
    return reply(interaction, `Ready.\n${status(config)}`);
  }

  if (sub === "status" || sub === "stats") return reply(interaction, status(config));
  if (sub === "enable") return reply(interaction, status(updateConfig(guild.id, { enabled: true })));
  if (sub === "disable") return reply(interaction, status(updateConfig(guild.id, { enabled: false })));

  if (sub === "action") {
    const action = interaction.options.getString("action");
    if (!isHoneypotAction(action)) return reply(interaction, "Invalid action.");
    return reply(interaction, status(updateConfig(guild.id, { action, enabled: action !== "disabled" })));
  }

  if (sub === "channel") {
    const channel = interaction.options.getChannel("channel", true);
    if (channel.type !== ChannelType.GuildText) return reply(interaction, "Pick a text channel.");
    config = updateConfig(guild.id, { trapChannelId: channel.id, warningMessageId: null, enabled: true });
    config = await refreshWarning(guild, config);
    return reply(interaction, status(config));
  }

  if (sub === "log") {
    const channel = interaction.options.getChannel("channel", true);
    if (channel.type !== ChannelType.GuildText) return reply(interaction, "Pick a text channel.");
    return reply(interaction, status(updateConfig(guild.id, { logChannelId: channel.id })));
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`GPT Honeypot online as ${readyClient.user.tag}. Loaded ${commands.length} command group(s).`);
});

client.on(Events.GuildCreate, (guild) => {
  ensureTrap(guild).catch((error) => console.error(`setup failed for ${guild.id}`, error));
});

client.on(Events.MessageCreate, (message) => {
  handleMessage(message).catch((error) => console.error("message handler failed", error));
});

client.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "honeypot") return;
  handleCommand(interaction).catch(async (error) => {
    console.error("command failed", error);
    if (!interaction.replied) await interaction.reply({ content: "Command failed. Check bot logs.", flags: MessageFlags.Ephemeral }).catch(() => undefined);
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
