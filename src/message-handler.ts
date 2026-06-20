import type { Client, Message } from "discord.js";
import { getChannel, getConfig, isAllowlisted, claimEvent, finishEvent } from "./db";
import { env } from "./env";
import { captureEvidence, sendLog } from "./logging";
import { applyAction, shortReason, type ActionResult } from "./moderation";
import { refreshWarning } from "./traps";

const activeUsers = new Set<string>();

export async function handleMessage(client: Client, message: Message) {
  if (!message.inGuild() || !message.guild || message.webhookId) return;
  if (message.author.id === client.user?.id) return;
  if (env.ignoreDiscordBots && message.author.bot) return;

  const config = getConfig(message.guild.id);
  if (!config || !config.enabled) return;

  const trap = getChannel(message.guild.id, message.channelId);
  if (!trap || isAllowlisted(message.guild.id, message.author.id)) return;

  const userKey = `${message.guild.id}:${message.author.id}`;
  if (activeUsers.has(userKey)) return;
  if (!claimEvent({ guildId: message.guild.id, userId: message.author.id, channelId: message.channelId, messageId: message.id, action: config.action })) return;

  activeUsers.add(userKey);
  let result: ActionResult;
  let evidence = "not captured";

  try {
    await message.react("🍯").catch(() => undefined);
    await message.author.send(`A server trap was triggered in ${message.guild.name}.`).catch(() => undefined);
    evidence = await captureEvidence(message, config);
    result = await applyAction(message, config.action);
  } catch (error) {
    result = { outcome: "failed", reason: shortReason(error) };
  } finally {
    activeUsers.delete(userKey);
  }

  finishEvent(message.guild.id, message.id, result.outcome, result.reason);
  await sendLog(message, config, result, evidence);
  await refreshWarning(message.guild, config, trap).catch(() => undefined);
}
