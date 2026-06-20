import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { ACTIONS } from "./actions";

const actionChoices = ACTIONS.map((value) => ({ name: value, value }));
const textChannel = (name: string, description: string, required = true) =>
  (option: import("discord.js").SlashCommandChannelOption) =>
    option.setName(name).setDescription(description).addChannelTypes(ChannelType.GuildText).setRequired(required);

export const commands = [
  new SlashCommandBuilder()
    .setName("honeypot")
    .setDescription("Configure GPT Honeypot.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Create or configure the first trap.")
        .addChannelOption(textChannel("channel", "Existing trap text channel.", false))
        .addChannelOption(textChannel("log-channel", "Staff log text channel.", false))
        .addStringOption((option) => option.setName("action").setDescription("Moderation action.").addChoices(...actionChoices).setRequired(false))
    )
    .addSubcommand((sub) => sub.setName("status").setDescription("Show config."))
    .addSubcommand((sub) => sub.setName("stats").setDescription("Show event totals."))
    .addSubcommand((sub) => sub.setName("enable").setDescription("Enable all traps."))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Disable all traps."))
    .addSubcommand((sub) =>
      sub
        .setName("action")
        .setDescription("Change the moderation action.")
        .addStringOption((option) => option.setName("action").setDescription("New action.").addChoices(...actionChoices).setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("log")
        .setDescription("Set the staff log channel.")
        .addChannelOption(textChannel("channel", "Staff log text channel."))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("channels")
        .setDescription("Manage trap channels.")
        .addSubcommand((sub) =>
          sub.setName("add").setDescription("Add a trap channel.").addChannelOption(textChannel("channel", "Trap text channel."))
        )
        .addSubcommand((sub) =>
          sub.setName("remove").setDescription("Remove a trap channel.").addChannelOption(textChannel("channel", "Trap text channel."))
        )
        .addSubcommand((sub) => sub.setName("list").setDescription("List trap channels."))
    )
].map((command) => command.toJSON());
