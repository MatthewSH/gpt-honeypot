import type { Message } from "discord.js";
import type { GuildConfig } from "./db";
import { textChannel } from "./guild-utils";

export async function forwardEvidence(message: Message<true>, config: GuildConfig): Promise<string> {
  const channel = await textChannel(message.guild, config.logChannelId);
  if (!channel) return "no log channel configured";

  const forwarded = await message.forward(channel).catch(() => null);
  return forwarded ? `forwarded to <#${channel.id}> as ${forwarded.id}` : "forward failed";
}
