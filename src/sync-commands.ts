import { REST, Routes } from "discord.js";
import { commands } from "./commands";
import { env } from "./env";

const rest = new REST({ version: "10" }).setToken(env.discordToken);
const endpoint = env.guildId === null ? Routes.applicationCommands(env.clientId) : Routes.applicationGuildCommands(env.clientId, env.guildId);

await rest.put(endpoint, { body: commands });
console.log(`Synced ${commands.length} command group(s).`);
