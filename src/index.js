import "dotenv/config";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  PermissionsBitField,
} from "discord.js";
import { readConfig } from "./config.js";
import { registerCommands } from "./commands.js";
import {
  AGENT_EMOJI_NAMES,
  buildChannelOnlyMessage,
  buildAnnouncementsPanelMessage,
  buildErrorMessage,
  buildExpiredSessionMessage,
  buildGenericCommandErrorMessage,
  buildOwnerOnlyMessage,
  buildOwnerOnlyCommandMessage,
  buildProductMessage,
  buildRulesPanelMessage,
  buildSetupCheckMessage,
  buildSetupServerResultMessage,
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
const PUBLIC_CHANNEL_NAMES = ["welcome", "rules", "announcements"];

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

async function ensureVerifyRole(guild) {
  const existing = await resolveVerifyRole(guild);
  if (existing) return existing;

  return guild.roles.create({
    name: config.verifyRoleName,
    reason: "GunnaFinds verification setup",
  });
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

async function getBotMember(guild) {
  return guild.members.fetchMe();
}

function hasGuildPermission(member, permission) {
  return member.permissions.has(permission);
}

async function findTextChannelByName(guild, name) {
  const channels = await guild.channels.fetch();
  return channels.find((channel) => channel?.type === ChannelType.GuildText && channel.name === name) ?? null;
}

async function ensureTextChannel(guild, name, topic) {
  const existing = await findTextChannelByName(guild, name);
  if (existing) return existing;

  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    topic,
    reason: "GunnaFinds server setup",
  });
}

async function editChannelPermissions(channel, target, permissions) {
  await channel.permissionOverwrites.edit(target, permissions, {
    reason: "GunnaFinds verification setup",
  });
}

async function postPanel(channel, message) {
  await channel.send(message);
}

async function setupServer(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  const botMember = await getBotMember(guild);
  const missingPermissions = [];

  if (!hasGuildPermission(botMember, PermissionsBitField.Flags.ManageRoles)) {
    missingPermissions.push("Give the bot Manage Roles.");
  }
  if (!hasGuildPermission(botMember, PermissionsBitField.Flags.ManageChannels)) {
    missingPermissions.push("Give the bot Manage Channels.");
  }
  if (!hasGuildPermission(botMember, PermissionsBitField.Flags.SendMessages)) {
    missingPermissions.push("Give the bot Send Messages.");
  }

  if (missingPermissions.length) {
    await interaction.editReply(
      payloadForEdit(
        buildSetupServerResultMessage({
          verifiedRole: null,
          publicChannels: [],
          w2cChannelId: config.allowedChannelId,
          lockedCount: 0,
          skippedCount: 0,
          missingPermissions,
        }),
      ),
    );
    return;
  }

  const verifiedRole = await ensureVerifyRole(guild);
  if (!(await canAssignRole(guild, verifiedRole))) {
    missingPermissions.push(`Move the bot role above ${verifiedRole.name}.`);
  }

  const welcomeChannel = await ensureTextChannel(guild, "welcome", "Verify here to unlock the GunnaFinds server.");
  const rulesChannel = await ensureTextChannel(guild, "rules", "Read-only rules for GunnaFinds members.");
  const announcementsChannel = await ensureTextChannel(guild, "announcements", "Read-only GunnaFinds updates.");
  const w2cChannel = await guild.channels.fetch(config.allowedChannelId).catch(() => null);
  if (!w2cChannel || w2cChannel.type !== ChannelType.GuildText) {
    missingPermissions.push(`Set ALLOWED_CHANNEL_ID to an existing W2C text channel. Current value: ${config.allowedChannelId}.`);
  }

  if (missingPermissions.length) {
    await interaction.editReply(
      payloadForEdit(
        buildSetupServerResultMessage({
          verifiedRole,
          publicChannels: [welcomeChannel, rulesChannel, announcementsChannel],
          w2cChannelId: w2cChannel?.id ?? config.allowedChannelId,
          lockedCount: 0,
          skippedCount: 0,
          missingPermissions,
        }),
      ),
    );
    return;
  }

  const everyone = guild.roles.everyone;
  const publicChannels = [welcomeChannel, rulesChannel, announcementsChannel];
  const publicIds = new Set(publicChannels.map((channel) => channel.id));
  let lockedCount = 0;
  let skippedCount = 0;

  for (const channel of publicChannels) {
    await editChannelPermissions(channel, everyone, {
      ViewChannel: true,
      SendMessages: false,
      AddReactions: false,
    });
    await editChannelPermissions(channel, verifiedRole, {
      ViewChannel: true,
      SendMessages: false,
      AddReactions: false,
    });
    lockedCount += 1;
  }

  await editChannelPermissions(w2cChannel, everyone, {
    ViewChannel: false,
  });
  await editChannelPermissions(w2cChannel, verifiedRole, {
    ViewChannel: true,
    SendMessages: true,
    AddReactions: true,
    UseApplicationCommands: true,
  });
  lockedCount += 1;

  const channels = await guild.channels.fetch();
  for (const channel of channels.values()) {
    if (!channel || publicIds.has(channel.id) || channel.id === w2cChannel.id) continue;
    if (!channel.permissionOverwrites) {
      skippedCount += 1;
      continue;
    }

    try {
      await editChannelPermissions(channel, everyone, { ViewChannel: false });
      await editChannelPermissions(channel, verifiedRole, { ViewChannel: true });
      lockedCount += 1;
    } catch (error) {
      console.error(`Could not lock channel ${channel.id}:`, error);
      skippedCount += 1;
    }
  }

  await postPanel(welcomeChannel, buildWelcomeMessage());
  await postPanel(rulesChannel, buildRulesPanelMessage());
  await postPanel(announcementsChannel, buildAnnouncementsPanelMessage());
  await postPanel(w2cChannel, buildW2cSetupMessage(w2cChannel.id));

  await interaction.editReply(
    payloadForEdit(
      buildSetupServerResultMessage({
        verifiedRole,
        publicChannels,
        w2cChannelId: w2cChannel.id,
        lockedCount,
        skippedCount,
      }),
    ),
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

    if (interaction.isChatInputCommand() && interaction.commandName === "setup-server") {
      if (await replyOwnerOnly(interaction)) return;
      await setupServer(interaction);
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
