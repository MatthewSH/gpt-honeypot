import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { ACTIONS } from "./actions";

const actionChoices = ACTIONS.map((value) => ({ name: value, value }));

export const commands = [
  new SlashCommandBuilder()
    .setName("honeypot")
    .setDescription("Configure and inspect GPT Honeypot.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.BanMembers)
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Create or configure the trap channel.")
        .addChannelOption((option) => option.setName("channel").setDescription("Trap text channel.").addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addChannelOption((option) => option.setName("log-channel").setDescription("Log text channel.").addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addStringOption((option) => option.setName("action").setDescription("Action after a trap post.").addChoices(...actionChoices).setRequired(false))
    )
    .addSubcommand((sub) => sub.setName("status").setDescription("Show current config."))
    .addSubcommand((sub) => sub.setName("stats").setDescription("Show server totals."))
    .addSubcommand((sub) => sub.setName("enable").setDescription("Enable the trap."))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Disable the trap."))
    .addSubcommand((sub) =>
      sub
        .setName("action")
        .setDescription("Change the action.")
        .addStringOption((option) => option.setName("action").setDescription("New action.").addChoices(...actionChoices).setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Change the trap channel.")
        .addChannelOption((option) => option.setName("channel").setDescription("Trap text channel.").addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("log")
        .setDescription("Change the log channel.")
        .addChannelOption((option) => option.setName("channel").setDescription("Log text channel.").addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
].map((command) => command.toJSON());
