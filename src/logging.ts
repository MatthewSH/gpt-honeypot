import { EmbedBuilder, type Message } from "discord.js";
import type { GuildConfig } from "./db";
import { forwardEvidence } from "./evidence";
import { textChannel } from "./guild-utils";
import type { ActionResult } from "./moderation";

export async function sendLog(message: Message<true>, config: GuildConfig, result: ActionResult, evidence: string) {
  const channel = (await textChannel(message.guild, config.logChannelId)) ?? (await textChannel(message.guild, message.channelId));
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("GPT Honeypot trigger")
    .setDescription(`User ${message.author.id} posted in <#${message.channelId}>.`)
    .addFields(
      { name: "User ID", value: message.author.id, inline: true },
      { name: "Action", value: config.action, inline: true },
      { name: "Outcome", value: result.outcome, inline: true },
      { name: "Reason", value: result.reason.slice(0, 1024) || "none" },
      { name: "Evidence", value: evidence.slice(0, 1024) || "none" }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => undefined);
}

export async function captureEvidence(message: Message<true>, config: GuildConfig): Promise<string> {
  return forwardEvidence(message, config).catch(() => "forward failed");
}
