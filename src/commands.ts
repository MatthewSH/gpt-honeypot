import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { ACTIONS } from "./actions";

const actionChoices = ACTIONS.map((value) => ({ name: value, value }));
const textChannel = (name: string, description: string, required = true) =>
  (option: import("discord.js").SlashCommandChannelOption) =>
    option.setName(name).setDescription(description).addChannelTypes(ChannelType.GuildText).setRequired(required);
const user = (name: string, description: string) =>
  (option: import("discord.js").SlashCommandUserOption) => option.setName(name).setDescription(description).setRequired(true);
const count = (description: string, required = true) =>
  (option: import("discord.js").SlashCommandIntegerOption) =>
    option.setName("count").setDescription(description).setMinValue(1).setMaxValue(10).setRequired(required);

export const commands = [
  new SlashCommandBuilder()
    .setName("honeypot")
    .setDescription("Configure GPT Honeypot.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Create or configure traps.")
        .addChannelOption(textChannel("channel", "Existing trap text channel.", false))
        .addChannelOption(textChannel("log-channel", "Staff log text channel.", false))
        .addStringOption((option) => option.setName("action").setDescription("Removal action.").addChoices(...actionChoices).setRequired(false))
        .addIntegerOption((option) => option.setName("decoys").setDescription("Trap channels to create when no channel is supplied.").setMinValue(1).setMaxValue(10).setRequired(false))
    )
    .addSubcommand((sub) => sub.setName("status").setDescription("Show server config."))
    .addSubcommand((sub) => sub.setName("stats").setDescription("Show server totals."))
    .addSubcommand((sub) => sub.setName("enable").setDescription("Enable traps."))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Disable traps without changing the action."))
    .addSubcommand((sub) =>
      sub
        .setName("action")
        .setDescription("Change the removal action.")
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
          sub.setName("add").setDescription("Add an existing trap channel.").addChannelOption(textChannel("channel", "Trap text channel."))
        )
        .addSubcommand((sub) => sub.setName("create").setDescription("Create new decoy trap channels.").addIntegerOption(count("Decoy channels to create.")))
        .addSubcommand((sub) =>
          sub.setName("remove").setDescription("Remove a trap channel.").addChannelOption(textChannel("channel", "Trap text channel."))
        )
        .addSubcommand((sub) => sub.setName("list").setDescription("List trap channels."))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("allowlist")
        .setDescription("Users who may post in trap channels without action.")
        .addSubcommand((sub) => sub.setName("add").setDescription("Allowlist a user.").addUserOption(user("user", "User to allowlist.")))
        .addSubcommand((sub) => sub.setName("remove").setDescription("Remove a user from the allowlist.").addUserOption(user("user", "User to remove.")))
        .addSubcommand((sub) => sub.setName("list").setDescription("List allowlisted user IDs."))
    )
].map((command) => command.toJSON());
