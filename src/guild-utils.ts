import { ChannelType, type Guild, type GuildMember, type TextChannel } from "discord.js";

export async function textChannel(guild: Guild, id: string | null): Promise<TextChannel | null> {
  if (!id) return null;
  const channel = await guild.channels.fetch(id).catch(() => null);
  return channel?.type === ChannelType.GuildText ? channel : null;
}

export async function botMember(guild: Guild): Promise<GuildMember | null> {
  return guild.members.me ?? guild.members.fetchMe().catch(() => null);
}
