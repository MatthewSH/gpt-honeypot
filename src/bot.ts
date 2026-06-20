import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { commands } from "./commands";
import { handleCommand } from "./command-handler";
import { startDashboard } from "./dashboard";
import { closeDb, getState } from "./db";
import { env } from "./env";
import { handleMessage } from "./message-handler";
import { createDecoys, refreshAllWarnings } from "./traps";

export async function startBot() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`GPT Honeypot online as ${readyClient.user.tag}. Loaded ${commands.length} command group(s).`);
    startDashboard(client);
  });

  client.on(Events.GuildCreate, async (guild) => {
    try {
      const state = getState(guild.id);
      if (state.channels.length === 0) await createDecoys(guild, 1);
      await refreshAllWarnings(guild, getState(guild.id));
    } catch (error) {
      console.error(`setup failed for ${guild.id}`, error);
    }
  });

  client.on(Events.MessageCreate, (message) => {
    handleMessage(client, message).catch((error) => console.error("message handler failed", error));
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "honeypot") return;
    handleCommand(interaction).catch(async (error) => {
      console.error("command failed", error);
      const content = "Command failed. Check bot logs.";
      if (interaction.deferred) await interaction.editReply({ content }).catch(() => undefined);
      else if (!interaction.replied) await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
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
}
