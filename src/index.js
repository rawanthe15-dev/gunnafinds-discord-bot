import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { readConfig } from "./config.js";
import { registerCommands } from "./commands.js";
import {
  AGENT_EMOJI_NAMES,
  buildChannelOnlyMessage,
  buildErrorMessage,
  buildExpiredSessionMessage,
  buildOwnerOnlyMessage,
  buildProductMessage,
  buildStatusMessage,
  parseFilterCursor,
  parseResultCursor,
} from "./presenter.js";
import { findProducts } from "./search-api.js";
import {
  createSearchSession,
  getSearchSession,
  updateSearchSession,
} from "./search-session.js";

const config = readConfig();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let emojiMap = {};
const startedAt = Date.now();

async function loadAgentEmojis() {
  if (!config.guildId) return {};
  const guild = await client.guilds.fetch(config.guildId);
  const emojis = await guild.emojis.fetch();
  const next = {};

  for (const [agentId, emojiName] of Object.entries(AGENT_EMOJI_NAMES)) {
    const emoji = emojis.find((item) => item.name === emojiName);
    if (emoji) {
      next[agentId] = {
        id: emoji.id,
        name: emoji.name,
        animated: emoji.animated ?? false,
      };
    }
  }

  return next;
}

async function replyWithSearch(interaction, query, index = 0, qcOnly = true, userId = null) {
  const result = await findProducts(config.findApiUrl, query, {
    limit: 5,
    qcOnly,
    botApiToken: config.botApiToken,
  });
  const sessionToken = createSearchSession({ query: result.query, qcOnly, ownerId: userId });
  const message = buildProductMessage(result, index, emojiMap, userId, { sessionToken, qcOnly });

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(message);
  } else {
    await interaction.reply(message);
  }
}

async function updateSearchMessage(interaction, sessionToken, index, qcOnly) {
  const session = updateSearchSession(sessionToken, { qcOnly });
  if (!session) {
    await interaction.followUp(buildExpiredSessionMessage());
    return;
  }

  const result = await findProducts(config.findApiUrl, session.query, {
    limit: 5,
    qcOnly: session.qcOnly,
    botApiToken: config.botApiToken,
  });
  const message = buildProductMessage(result, index, emojiMap, session.ownerId, {
    sessionToken,
    qcOnly: session.qcOnly,
  });
  await interaction.editReply(message);
}

async function respondWithAutocomplete(interaction) {
  const query = interaction.options.getFocused();
  if (typeof query !== "string" || query.trim().length < 2) {
    await interaction.respond([]);
    return;
  }

  const result = await findProducts(config.findApiUrl, query, {
    limit: 10,
    qcOnly: false,
    botApiToken: config.botApiToken,
  });
  const choices = result.items.slice(0, 10).map((item) => ({
    name: item.name.slice(0, 100),
    value: item.name.slice(0, 100),
  }));
  await interaction.respond(choices);
}

async function checkFindApiLatency() {
  const started = Date.now();
  await findProducts(config.findApiUrl, "jordan", {
    limit: 1,
    qcOnly: false,
    botApiToken: config.botApiToken,
  });
  return Date.now() - started;
}

client.once(Events.ClientReady, async (readyClient) => {
  emojiMap = await loadAgentEmojis().catch((error) => {
    console.warn("Could not load custom agent emojis:", error.message);
    return {};
  });
  console.log(`GunnaFinds bot online as ${readyClient.user.tag}`);
  console.log(`Loaded ${Object.keys(emojiMap).length} custom agent emojis`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete() && interaction.commandName === "find") {
      await respondWithAutocomplete(interaction);
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "find") {
      if (interaction.channelId !== config.allowedChannelId) {
        await interaction.reply(buildChannelOnlyMessage(config.allowedChannelId));
        return;
      }
      const query = interaction.options.getString("query", true);
      const qcOnly = interaction.options.getBoolean("qc") ?? true;
      await interaction.deferReply();
      await replyWithSearch(interaction, query, 0, qcOnly, interaction.user.id);
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "bot-status") {
      const latencyMs = await checkFindApiLatency().catch(() => null);
      await interaction.reply(
        buildStatusMessage({
          clientUser: client.user,
          uptimeMs: Date.now() - startedAt,
          emojiCount: Object.keys(emojiMap).length,
          findApiUrl: config.findApiUrl,
          latencyMs,
        }),
      );
      return;
    }

    if (interaction.isButton()) {
      if (interaction.channelId !== config.allowedChannelId) {
        await interaction.reply(buildChannelOnlyMessage(config.allowedChannelId));
        return;
      }
      const cursor = parseResultCursor(interaction.customId) ?? parseFilterCursor(interaction.customId);
      if (!cursor) return;
      await interaction.deferUpdate();
      const session = getSearchSession(cursor.sessionToken);
      if (!session) {
        await interaction.followUp(buildExpiredSessionMessage());
        return;
      }
      if (session.ownerId && session.ownerId !== interaction.user.id) {
        await interaction.followUp(buildOwnerOnlyMessage());
        return;
      }
      await updateSearchMessage(
        interaction,
        cursor.sessionToken,
        cursor.index,
        cursor.type === "filter" ? cursor.qcOnly : session.qcOnly,
      );
    }
  } catch (error) {
    console.error(error);
    if (interaction.isAutocomplete?.()) {
      await interaction.respond([]).catch(() => undefined);
      return;
    }
    const fallback = buildErrorMessage();

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(fallback).catch(() => undefined);
    } else {
      await interaction.reply(fallback).catch(() => undefined);
    }
  }
});

await registerCommands(config);
await client.login(config.token);
