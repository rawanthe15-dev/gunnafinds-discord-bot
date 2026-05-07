import "dotenv/config";
import { Client, Events, GatewayIntentBits, PermissionsBitField } from "discord.js";
import { readConfig } from "./config.js";
import { registerCommands } from "./commands.js";
import {
  AGENT_EMOJI_NAMES,
  buildChannelOnlyMessage,
  buildErrorMessage,
  buildExpiredSessionMessage,
  buildGenericCommandErrorMessage,
  buildOwnerOnlyMessage,
  buildOwnerOnlyCommandMessage,
  buildProductMessage,
  buildSetupCheckMessage,
  buildStatusMessage,
  buildAlreadyVerifiedMessage,
  buildVerifyPermissionErrorMessage,
  buildVerifyRoleMissingMessage,
  buildVerifySuccessMessage,
  buildWelcomeMessage,
  buildW2cSetupMessage,
  isVerifyButton,
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

async function checkFindApiLatency() {
  const started = Date.now();
  await findProducts(config.findApiUrl, "jordan", {
    limit: 1,
    qcOnly: false,
    botApiToken: config.botApiToken,
  });
  return Date.now() - started;
}

async function resolveVerifyRole(guild) {
  if (!guild) return null;
  if (config.verifyRoleId) {
    return guild.roles.fetch(config.verifyRoleId).catch(() => null);
  }

  const roles = await guild.roles.fetch();
  return roles.find((role) => role.name.toLowerCase() === config.verifyRoleName.toLowerCase()) ?? null;
}

function payloadForEdit(message) {
  const { ephemeral, ...payload } = message;
  return payload;
}

async function canAssignRole(guild, role) {
  if (!guild || !role) return false;
  const botMember = await guild.members.fetchMe();
  return (
    botMember.permissions.has(PermissionsBitField.Flags.ManageRoles) &&
    botMember.roles.highest.comparePositionTo(role) > 0
  );
}

async function verifyMember(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const role = await resolveVerifyRole(interaction.guild);
  if (!role) {
    await interaction.editReply(payloadForEdit(buildVerifyRoleMissingMessage(config.verifyRoleName)));
    return;
  }

  let canAssign = false;
  try {
    canAssign = await canAssignRole(interaction.guild, role);
  } catch (error) {
    console.error("Verify permission check failed:", error);
  }

  if (!canAssign) {
    await interaction.editReply(payloadForEdit(buildVerifyPermissionErrorMessage(role.name)));
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (member.roles.cache.has(role.id)) {
    await interaction.editReply(payloadForEdit(buildAlreadyVerifiedMessage(role.name)));
    return;
  }

  try {
    await member.roles.add(role);
    await interaction.editReply(payloadForEdit(buildVerifySuccessMessage(role.name)));
  } catch (error) {
    console.error("Verify role assignment failed:", error);
    await interaction.editReply(payloadForEdit(buildVerifyPermissionErrorMessage(role.name)));
  }
}

async function replyOwnerOnly(interaction) {
  if (interaction.user.id === config.welcomeOwnerId) return false;
  await interaction.reply(buildOwnerOnlyCommandMessage(config.welcomeOwnerId));
  return true;
}

async function replySetupCheck(interaction) {
  const role = await resolveVerifyRole(interaction.guild);
  await interaction.reply(
    buildSetupCheckMessage({
      allowedChannelId: config.allowedChannelId,
      currentChannelId: interaction.channelId,
      role,
      roleError: config.verifyRoleName,
      canManageRoles: role ? await canAssignRole(interaction.guild, role) : false,
    }),
  );
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
      await interaction.deferReply({ ephemeral: true });
      const latencyMs = await checkFindApiLatency().catch(() => null);
      await interaction.editReply(
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

    if (interaction.isChatInputCommand() && interaction.commandName === "welcome") {
      if (await replyOwnerOnly(interaction)) return;
      await interaction.reply(buildWelcomeMessage());
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "setup-w2c") {
      if (await replyOwnerOnly(interaction)) return;
      if (interaction.channelId !== config.allowedChannelId) {
        await interaction.reply(buildChannelOnlyMessage(config.allowedChannelId));
        return;
      }
      await interaction.reply(buildW2cSetupMessage(config.allowedChannelId));
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "setup-check") {
      if (await replyOwnerOnly(interaction)) return;
      await replySetupCheck(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (isVerifyButton(interaction.customId)) {
        await verifyMember(interaction);
        return;
      }

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
    const isFindCommand =
      interaction.isChatInputCommand?.() && interaction.commandName === "find";
    const isFindButton =
      interaction.isButton?.() &&
      (parseResultCursor(interaction.customId) || parseFilterCursor(interaction.customId));
    const fallback = isFindCommand || isFindButton ? buildErrorMessage() : buildGenericCommandErrorMessage();

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(fallback).catch(() => undefined);
    } else {
      await interaction.reply(fallback).catch(() => undefined);
    }
  }
});

await registerCommands(config);
await client.login(config.token);
