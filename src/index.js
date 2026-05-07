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
  addActivity,
  loadBotState,
  rememberId,
  saveBotState,
} from "./bot-state.js";
import {
  AGENT_EMOJI_NAMES,
  buildChannelOnlyMessage,
  buildAnnouncementsPanelMessage,
  buildErrorMessage,
  buildExpiredSessionMessage,
  buildFindsPanelMessage,
  buildFindFeedMessage,
  buildGenericCommandErrorMessage,
  buildOwnerOnlyMessage,
  buildOwnerOnlyCommandMessage,
  buildProductMessage,
  buildRankMessage,
  buildRestartDeniedMessage,
  buildRestartFailedMessage,
  buildRestartQueuedMessage,
  buildRulesPanelMessage,
  buildSetupCheckMessage,
  buildSetupServerResultMessage,
  buildSyncResultMessage,
  buildStatusMessage,
  buildSyncedAnnouncementMessage,
  buildAlreadyVerifiedMessage,
  buildVerifyPermissionErrorMessage,
  buildVerifyRoleMissingMessage,
  buildVerifySuccessMessage,
  buildUpdatesPanelMessage,
  buildWelcomeMessage,
  buildWebsitePanelMessage,
  buildWebsiteUpdateMessage,
  buildW2cSetupMessage,
  isVerifyButton,
  parseFilterCursor,
  parseResultCursor,
} from "./presenter.js";
import { canRestartBot, queueBotRestart, updateBotFromRepo } from "./restart.js";
import { findProducts } from "./search-api.js";
import {
  fetchAnnouncements,
  fetchCatalogSnapshot,
  fetchFindFeed,
} from "./site-api.js";
import {
  createSearchSession,
  getSearchSession,
  updateSearchSession,
} from "./search-session.js";

const config = readConfig();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});
let emojiMap = {};
let botState = await loadBotState(config.stateFile).catch((error) => {
  console.warn("Could not load bot state:", error.message);
  return null;
});
if (!botState) botState = await loadBotState("/tmp/gunnafinds-bot-state.json");
const startedAt = Date.now();
const PUBLIC_CHANNEL_NAMES = ["welcome", "rules", "announcements", "updates", "website"];
const ACTIVITY_ROLES = [
  { name: "Active Finder", score: 10, color: 0xf97316 },
  { name: "Trusted Finder", score: 35, color: 0x60a5fa },
  { name: "Gunna Elite", score: 90, color: 0x16a34a },
];
const stickyTimers = new Map();

async function persistState() {
  await saveBotState(config.stateFile, botState).catch((error) => {
    console.warn("Could not save bot state:", error.message);
  });
}

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

async function ensureActivityRoles(guild) {
  const roles = await guild.roles.fetch();
  const ready = [];
  for (const roleSpec of ACTIVITY_ROLES) {
    const existing = roles.find((role) => role.name.toLowerCase() === roleSpec.name.toLowerCase());
    if (existing) {
      ready.push(existing);
      continue;
    }
    ready.push(
      await guild.roles.create({
        name: roleSpec.name,
        color: roleSpec.color,
        reason: "GunnaFinds activity roles",
      }),
    );
  }
  return ready;
}

function topActivityRoleName(activity) {
  const score = activity?.score ?? 0;
  return [...ACTIVITY_ROLES].reverse().find((role) => score >= role.score)?.name ?? null;
}

async function assignActivityRole(member, activity) {
  const roleName = topActivityRoleName(activity);
  if (!roleName || !member?.guild) return;
  await ensureActivityRoles(member.guild).catch((error) => {
    console.warn("Could not ensure activity roles:", error.message);
  });
  const roles = await member.guild.roles.fetch();
  const role = roles.find((item) => item.name.toLowerCase() === roleName.toLowerCase());
  if (!role) return;
  if (member.roles.cache.has(role.id)) return;
  if (!(await canAssignRole(member.guild, role))) {
    console.warn(`Cannot assign ${roleName}. Give the bot Manage Roles and move its role above activity roles.`);
    return;
  }
  await member.roles.add(role, "GunnaFinds activity role").catch((error) => {
    console.warn(`Could not assign activity role ${roleName}:`, error.message);
  });
}

async function trackActivity(member, kind, points = 1) {
  if (!member?.user?.id || member.user.bot) return null;
  const activity = addActivity(botState, member.user.id, kind, points);
  await assignActivityRole(member, activity);
  await persistState();
  return activity;
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

async function fetchTextChannel(guild, channelId) {
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  return channel?.type === ChannelType.GuildText ? channel : null;
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

async function ensureTextChannelByIdOrName(guild, channelId, name, topic) {
  return (await fetchTextChannel(guild, channelId)) ?? ensureTextChannel(guild, name, topic);
}

async function editChannelPermissions(channel, target, permissions) {
  await channel.permissionOverwrites.edit(target, permissions, {
    reason: "GunnaFinds verification setup",
  });
}

async function postPanel(channel, message) {
  await channel.send(message);
}

async function replaceStickyPanel(channel, kind) {
  const key = kind === "w2c" ? "w2cMessageId" : "findsMessageId";
  const previousId = botState.sticky[key];
  if (previousId) {
    const previous = await channel.messages.fetch(previousId).catch(() => null);
    if (previous) await previous.delete().catch(() => undefined);
  }
  const message =
    kind === "w2c"
      ? buildW2cSetupMessage(channel.id)
      : buildFindsPanelMessage();
  const sent = await channel.send({ ...message, allowedMentions: { parse: [] } });
  botState.sticky[key] = sent.id;
  await persistState();
  return sent;
}

function scheduleStickyRefresh(channel, kind) {
  const key = `${channel.id}:${kind}`;
  const existing = stickyTimers.get(key);
  if (existing) clearTimeout(existing);
  stickyTimers.set(
    key,
    setTimeout(() => {
      stickyTimers.delete(key);
      replaceStickyPanel(channel, kind).catch((error) => {
        console.warn(`Could not refresh ${kind} sticky panel:`, error.message);
      });
    }, 1200),
  );
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
          findsChannel: null,
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
  await ensureActivityRoles(guild);
  if (!(await canAssignRole(guild, verifiedRole))) {
    missingPermissions.push(`Move the bot role above ${verifiedRole.name}.`);
  }

  const welcomeChannel = await ensureTextChannel(guild, "welcome", "Verify here to unlock the GunnaFinds server.");
  const rulesChannel = await ensureTextChannel(guild, "rules", "Read-only rules for GunnaFinds members.");
  const announcementsChannel = await ensureTextChannelByIdOrName(
    guild,
    config.announcementsChannelId,
    "announcements",
    "Read-only GunnaFinds announcements synced from the website.",
  );
  const updatesChannel = await ensureTextChannelByIdOrName(
    guild,
    config.updatesChannelId,
    "updates",
    "Read-only GunnaFinds website and catalog updates.",
  );
  const websiteChannel = await ensureTextChannelByIdOrName(
    guild,
    config.websiteChannelId,
    "website",
    "Read-only link panel for the GunnaFinds website.",
  );
  const findsChannel = await ensureTextChannelByIdOrName(
    guild,
    config.findsChannelId,
    "finds",
    "Verified member finds and catalog drops.",
  );
  const w2cChannel = await guild.channels.fetch(config.allowedChannelId).catch(() => null);
  if (!w2cChannel || w2cChannel.type !== ChannelType.GuildText) {
    missingPermissions.push(`Set ALLOWED_CHANNEL_ID to an existing W2C text channel. Current value: ${config.allowedChannelId}.`);
  }

  if (missingPermissions.length) {
    await interaction.editReply(
      payloadForEdit(
        buildSetupServerResultMessage({
          verifiedRole,
          publicChannels: [welcomeChannel, rulesChannel, announcementsChannel, updatesChannel, websiteChannel],
          findsChannel,
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
  const publicChannels = [welcomeChannel, rulesChannel, announcementsChannel, updatesChannel, websiteChannel];
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
  await postPanel(updatesChannel, buildUpdatesPanelMessage(config.siteUrl));
  await postPanel(websiteChannel, buildWebsitePanelMessage(config.siteUrl));
  await replaceStickyPanel(findsChannel, "finds");
  await replaceStickyPanel(w2cChannel, "w2c");

  await interaction.editReply(
    payloadForEdit(
      buildSetupServerResultMessage({
        verifiedRole,
        publicChannels,
        findsChannel,
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

async function getPrimaryGuild() {
  if (config.guildId) return client.guilds.fetch(config.guildId);
  return client.guilds.cache.first() ?? null;
}

async function resolveNamedChannel(name, configuredId = null) {
  const guild = await getPrimaryGuild();
  if (!guild) return null;
  return (await fetchTextChannel(guild, configuredId)) ?? findTextChannelByName(guild, name);
}

async function syncAnnouncements() {
  const channel = await resolveNamedChannel("announcements", config.announcementsChannelId);
  if (!channel) return 0;
  const announcements = await fetchAnnouncements(config.announcementsApiUrl, {
    botApiToken: config.botApiToken,
  });
  let posted = 0;
  for (const announcement of announcements.reverse()) {
    if (!announcement?.id || botState.announcements.postedIds.includes(announcement.id)) continue;
    await channel.send(buildSyncedAnnouncementMessage(announcement));
    botState.announcements.postedIds = rememberId(botState.announcements.postedIds, announcement.id, 500);
    posted += 1;
  }
  if (posted) await persistState();
  return posted;
}

async function syncWebsiteUpdates({ force = false } = {}) {
  const channel = await resolveNamedChannel("updates", config.updatesChannelId);
  if (!channel) return 0;
  const snapshot = await fetchCatalogSnapshot(config.catalogApiUrl, {
    botApiToken: config.botApiToken,
  });
  const previousTotal = botState.updates.catalogTotal;
  const previousNewest = botState.updates.newestProductId;
  const changed =
    previousTotal !== null &&
    (previousTotal !== snapshot.total || previousNewest !== snapshot.newestProductId);

  botState.updates.catalogTotal = snapshot.total;
  botState.updates.newestProductId = snapshot.newestProductId;
  await persistState();

  if (!changed && !force) return 0;
  await channel.send(
    buildWebsiteUpdateMessage({
      total: snapshot.total,
      previousTotal,
      siteUrl: config.siteUrl,
    }),
  );
  return 1;
}

async function syncFindsFeed() {
  const channel = await resolveNamedChannel("finds", config.findsChannelId);
  if (!channel) return 0;
  const items = await fetchFindFeed({
    feedApiUrl: config.feedApiUrl,
    catalogApiUrl: config.catalogApiUrl,
    siteUrl: config.siteUrl,
    excludeIds: botState.finds.postedIds,
    page: botState.finds.page,
    limit: 12,
    botApiToken: config.botApiToken,
  });
  const product = items.find((item) => item?.id && !botState.finds.postedIds.includes(item.id));
  if (!product) {
    botState.finds.page += 1;
    await persistState();
    return 0;
  }

  await channel.send(buildFindFeedMessage(product, config.siteUrl));
  botState.finds.postedIds = rememberId(botState.finds.postedIds, product.id, 700);
  botState.finds.page = Math.max(1, botState.finds.page + 1);
  await persistState();
  await replaceStickyPanel(channel, "finds");
  return 1;
}

async function syncAll({ force = false } = {}) {
  const [announcements, updates, finds] = await Promise.all([
    syncAnnouncements().catch((error) => {
      console.warn("Announcement sync failed:", error.message);
      return 0;
    }),
    syncWebsiteUpdates({ force }).catch((error) => {
      console.warn("Update sync failed:", error.message);
      return 0;
    }),
    syncFindsFeed().catch((error) => {
      console.warn("Finds feed sync failed:", error.message);
      return 0;
    }),
  ]);
  return { announcements, updates, finds };
}

function startBackgroundSync() {
  setTimeout(() => syncAll().catch(() => undefined), 8_000);
  setInterval(() => syncAnnouncements().catch(() => undefined), 60_000);
  setInterval(() => syncWebsiteUpdates().catch(() => undefined), 90_000);
  setInterval(() => syncFindsFeed().catch(() => undefined), 10 * 60_000);
}

client.once(Events.ClientReady, async (readyClient) => {
  emojiMap = await loadAgentEmojis().catch((error) => {
    console.warn("Could not load custom agent emojis:", error.message);
    return {};
  });
  const guild = await getPrimaryGuild().catch(() => null);
  if (guild) {
    await ensureActivityRoles(guild).catch((error) => {
      console.warn("Could not create activity roles on startup:", error.message);
    });
  }
  console.log(`GunnaFinds bot online as ${readyClient.user.tag}`);
  console.log(`Loaded ${Object.keys(emojiMap).length} custom agent emojis`);
  startBackgroundSync();
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
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      await trackActivity(member, "find", 3);
      if (interaction.channel) scheduleStickyRefresh(interaction.channel, "w2c");
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

    if (interaction.isChatInputCommand() && interaction.commandName === "restart") {
      if (!canRestartBot(interaction, config)) {
        await interaction.reply(buildRestartDeniedMessage());
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        await updateBotFromRepo(config);
        await interaction.editReply(buildRestartQueuedMessage());
        queueBotRestart(config);
      } catch (error) {
        console.error("Bot update before restart failed:", error);
        await interaction.editReply(buildRestartFailedMessage(error));
      }
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "rank") {
      const activity = botState.activity.users[interaction.user.id] ?? {};
      const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
      await assignActivityRole(member, activity);
      await interaction.reply(buildRankMessage(activity, topActivityRoleName(activity)));
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "sync-now") {
      if (await replyOwnerOnly(interaction)) return;
      await interaction.deferReply({ ephemeral: true });
      const result = await syncAll({ force: true });
      await interaction.editReply(buildSyncResultMessage(result));
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

    if (
      interaction.isChatInputCommand() &&
      (interaction.commandName === "setup" || interaction.commandName === "setup-server")
    ) {
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
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      await trackActivity(member, "button", 1);
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

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    const isW2c = message.channelId === config.allowedChannelId;
    const isFinds =
      message.channelId === config.findsChannelId ||
      message.channel?.name === "finds";
    if (!isW2c && !isFinds) return;

    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    await trackActivity(member, "message", 1);
    scheduleStickyRefresh(message.channel, isW2c ? "w2c" : "finds");
  } catch (error) {
    console.warn("Message activity handling failed:", error.message);
  }
});

await registerCommands(config);
await client.login(config.token);
