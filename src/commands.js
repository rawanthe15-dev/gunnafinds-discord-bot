import { REST, Routes, SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("find")
    .setDescription("Find a product with QC images and agent links")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Product name or model, e.g. Jordan 4 black cat")
        .setRequired(true)
        .setMaxLength(120),
    )
    .addBooleanOption((option) =>
      option
        .setName("qc")
        .setDescription("Keep results limited to products with QC images")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("bot-status")
    .setDescription("Show GunnaFinds bot and search API status"),
  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your GunnaFinds activity role progress"),
  new SlashCommandBuilder()
    .setName("sync-now")
    .setDescription("Owner only: sync website announcements, updates, and finds now"),
  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Post the GunnaFinds welcome and verification panel"),
  new SlashCommandBuilder()
    .setName("setup-w2c")
    .setDescription("Post the W2C search channel instructions"),
  new SlashCommandBuilder()
    .setName("setup-check")
    .setDescription("Check verification role and W2C channel setup"),
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set up verification, website, updates, finds, rules, announcements, and W2C"),
  new SlashCommandBuilder()
    .setName("setup-server")
    .setDescription("Create and lock GunnaFinds channels, panels, and roles"),
].map((command) => command.toJSON());

export async function registerCommands({ token, clientId, guildId }) {
  const rest = new REST({ version: "10" }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commands });
}
