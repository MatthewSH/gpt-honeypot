import { REST, Routes } from "discord.js";
import { commands } from "./commands";
import { env } from "./env";

const rest = new REST({ version: "10" }).setToken(env.discordToken);
await rest.put(Routes.applicationCommands(env.clientId), { body: commands });
console.log(`Synced ${commands.length} command group(s).`);
