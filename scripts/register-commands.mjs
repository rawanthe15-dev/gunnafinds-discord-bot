import { readConfig } from "../src/config.js";
import { registerCommands } from "../src/commands.js";

const config = readConfig();
await registerCommands(config);

const scope = config.guildId ? `guild ${config.guildId}` : "global";
console.log(`Registered GunnaFinds commands for ${scope}.`);
