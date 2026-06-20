import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { ACTIONS } from "./actions";

const actionChoices = ACTIONS.map((value) => ({ name: value, value }));

export const commands = [
  new SlashCommandBuilder()
    .setName("honeypot")
    .setDescription("Configure GPT Honeypot.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Create or configure the channel.")
        .addChannelOption((option) => option.setName("channel").setDescription("Text channel.").addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addChannelOption((option) => option.setName("log-channel").setDescription("Log channel.").addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addStringOption((option) => option.setName("action").setDescription("Action.").addChoices(...actionChoices).setRequired(false))
    )
    .addSubcommand((sub) => sub.setName("status").setDescription("Show config."))
    .addSubcommand((sub) => sub.setName("stats").setDescription("Show totals."))
    .addSubcommand((sub) => sub.setName("enable").setDescription("Enable."))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Disable."))
    .addSubcommand((sub) =>
      sub
        .setName("action")
        .setDescription("Change action.")
        .addStringOption((option) => option.setName("action").setDescription("New action.").addChoices(...actionChoices).setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Change channel.")
        .addChannelOption((option) => option.setName("channel").setDescription("Text channel.").addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("log")
        .setDescription("Change logs.")
        .addChannelOption((option) => option.setName("channel").setDescription("Text channel.").addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
].map((command) => command.toJSON());
