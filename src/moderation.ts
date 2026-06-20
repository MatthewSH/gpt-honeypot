import { PermissionFlagsBits, type Message } from "discord.js";
import type { HoneypotAction } from "./actions";
import { env } from "./env";
import { botMember } from "./guild-utils";

export type ActionResult = { outcome: "success" | "failed" | "skipped" | "dry-run"; reason: string };

export function shortReason(value: unknown): string {
  return (value instanceof Error ? value.message : String(value)).replace(/\s+/g, " ").slice(0, 300) || "unknown";
}

export async function applyAction(message: Message<true>, action: HoneypotAction): Promise<ActionResult> {
  if (env.dryRun) return { outcome: "dry-run", reason: "DRY_RUN=true" };
  if (message.guild.ownerId === message.author.id) return { outcome: "skipped", reason: "server owner" };

  const me = await botMember(message.guild);
  if (!me) return { outcome: "failed", reason: "bot member not found" };
  if (!me.permissions.has(PermissionFlagsBits.BanMembers)) return { outcome: "failed", reason: "missing Ban Members" };

  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (member && !member.bannable) return { outcome: "failed", reason: "target is not bannable" };

  const reason = `GPT Honeypot: ${message.channelId}/${message.id}`;
  await message.guild.members.ban(message.author.id, { deleteMessageSeconds: env.deleteMessageSeconds, reason });

  if (action === "softban") {
    await Bun.sleep(750);
    await message.guild.members.unban(message.author.id, "GPT Honeypot softban release");
    return { outcome: "success", reason: "softban complete" };
  }

  return { outcome: "success", reason: "banned" };
}
