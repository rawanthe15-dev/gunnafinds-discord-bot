import { PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from "discord.js";

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
    .setName("welcome")
    .setDescription("Post the GunnaFinds welcome panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Post the GunnaFinds rules panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((command) => command.toJSON());

export async function registerCommands({ token, clientId, guildId }) {
  const rest = new REST({ version: "10" }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commands });
}
