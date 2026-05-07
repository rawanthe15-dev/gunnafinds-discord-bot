import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";

const MAX_AGENT_BUTTONS = 5;
const BRAND_COLOR = 0xf97316;
const MUTED_COLOR = 0x111827;
const SUCCESS_COLOR = 0x16a34a;
const WARNING_COLOR = 0xf59e0b;
const SITE_URL = "https://repgunna.xyz";
const DISCORD_ASSET_BASE_URL = "https://raw.githubusercontent.com/rawanthe15-dev/gunnafinds-discord-bot/main/assets/discord";
const CHANNEL_IMAGE_URLS = {
  finds: `${DISCORD_ASSET_BASE_URL}/finds.png`,
  rules: `${DISCORD_ASSET_BASE_URL}/rules.png`,
  announcements: `${DISCORD_ASSET_BASE_URL}/announcements.png`,
  website: `${DISCORD_ASSET_BASE_URL}/website.png`,
  w2c: `${DISCORD_ASSET_BASE_URL}/w2c.png`,
};
const VERIFY_BUTTON_ID = "verify:access";

export const AGENT_EMOJI_NAMES = {
  lovegobuy: "lovegobuy",
  usfans: "usfanslogo",
  oopbuy: "oopbuy",
  litbuy: "litbuy",
  joyagoo: "joyagoo",
};

function clampIndex(result, index) {
  if (!result.items.length) return 0;
  return Math.max(0, Math.min(index, result.items.length - 1));
}

function cursorId(sessionToken, index) {
  return `find:${sessionToken}:${index}`;
}

function filterId(sessionToken, index, qcOnly) {
  return `filter:${sessionToken}:${index}:${qcOnly ? "qc" : "all"}`;
}

function agentEmoji(agent, emojiMap = {}) {
  if (emojiMap[agent.id]) return emojiMap[agent.id];
  const envKey = `AGENT_EMOJI_${agent.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const custom = process.env[envKey];
  if (custom) return custom;
  return null;
}

function truncate(value, max = 256) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}...`;
}

function feedReason(reason) {
  const text = truncate(reason, 80);
  if (!text) return "GunnaFinds pick";
  if (/\bwebsite\s+clicks?\b/i.test(text)) return "Popular find";
  return text;
}

function resultTone(index, total) {
  if (total <= 1) return "Single best match";
  if (index === 0) return "Best match";
  return `Alternative ${index + 1}`;
}

function agentSummary(product) {
  if (!product.agentLinks.length) return "No agent links listed";
  return product.agentLinks.map((agent) => agent.name).slice(0, MAX_AGENT_BUTTONS).join(" / ");
}

function guardEmbed(title, description, color = WARNING_COLOR) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
}

export function parseResultCursor(customId) {
  const match = customId.match(/^find:([a-f0-9]{20}):(\d+)$/);
  if (!match) return null;
  return {
    type: "page",
    sessionToken: match[1],
    index: Number.parseInt(match[2], 10),
  };
}

export function parseFilterCursor(customId) {
  const match = customId.match(/^filter:([a-f0-9]{20}):(\d+):(qc|all)$/);
  if (!match) return null;
  return {
    type: "filter",
    sessionToken: match[1],
    index: Number.parseInt(match[2], 10),
    qcOnly: match[3] === "qc",
  };
}

export function buildChannelOnlyMessage(channelId) {
  return {
    embeds: [
      guardEmbed(
        "Use the W2C channel",
        `Run \`/find\` in <#${channelId}>. That keeps W2C requests, QC previews, and agent links in one clean place.`,
      ),
    ],
    components: [],
    ephemeral: true,
  };
}

export function buildOwnerOnlyCommandMessage(ownerId) {
  return {
    embeds: [
      guardEmbed(
        "Owner command only",
        `Only <@${ownerId}> can post the welcome and verification panel.`,
      ),
    ],
    components: [],
    ephemeral: true,
  };
}

export function buildSetupCheckMessage({
  allowedChannelId,
  currentChannelId,
  role,
  roleError,
  canManageRoles,
}) {
  const isW2cChannel = currentChannelId === allowedChannelId;
  const roleStatus = role
    ? `Ready: **${truncate(role.name, 64)}**`
    : `Missing: create **${truncate(roleError, 64)}** or set \`VERIFY_ROLE_ID\`.`;
  const manageStatus = canManageRoles
    ? "Ready: bot can manage roles."
    : "Needs fix: give the bot Manage Roles and move its role above the verify role.";

  const embed = new EmbedBuilder()
    .setColor(role && canManageRoles && isW2cChannel ? SUCCESS_COLOR : WARNING_COLOR)
    .setTitle("GunnaFinds setup check")
    .setDescription("Use this before locking channels behind verification.")
    .addFields(
      { name: "W2C channel", value: isW2cChannel ? `Ready: <#${allowedChannelId}>` : `Run W2C setup in <#${allowedChannelId}>.`, inline: false },
      { name: "Verify role", value: roleStatus, inline: false },
      { name: "Role permissions", value: manageStatus, inline: false },
    )
    .setFooter({ text: "After this passes, lock channels for @everyone and allow Verified" });

  return { embeds: [embed], components: [], ephemeral: true };
}

export function buildSetupServerResultMessage({
  verifiedRole,
  publicChannels,
  findsChannel,
  w2cChannelId,
  lockedCount,
  skippedCount,
  missingPermissions = [],
}) {
  const hasMissing = missingPermissions.length > 0;
  const embed = new EmbedBuilder()
    .setColor(hasMissing ? WARNING_COLOR : SUCCESS_COLOR)
    .setTitle(hasMissing ? "Server setup needs permissions" : "Server setup complete")
    .setDescription(
      hasMissing
        ? "I could not safely change every channel yet. Fix the listed bot permissions, then run `/setup-server` again."
        : "Verification gate, read-only public channels, and W2C access are configured.",
    )
    .addFields(
      {
        name: "Verify role",
        value: verifiedRole ? `Ready: **${truncate(verifiedRole.name, 64)}**` : "Not ready",
        inline: false,
      },
      {
        name: "Public read-only channels",
        value: publicChannels.length
          ? publicChannels.map((channel) => `<#${channel.id}>`).join(" / ")
          : "None configured",
        inline: false,
      },
      {
        name: "Verified finds channel",
        value: findsChannel ? `<#${findsChannel.id}>` : "Not configured",
        inline: false,
      },
      {
        name: "Verified W2C channel",
        value: w2cChannelId ? `<#${w2cChannelId}>` : "Not configured",
        inline: false,
      },
      {
        name: "Locked channels",
        value: `${lockedCount} updated, ${skippedCount} skipped`,
        inline: true,
      },
    )
    .setFooter({ text: "Welcome, rules, and announcements stay visible but read-only" });

  if (hasMissing) {
    embed.addFields({
      name: "Missing permissions",
      value: missingPermissions.join("\n"),
      inline: false,
    });
  }

  return { embeds: [embed], components: [], ephemeral: true };
}

function emptyMessage(query) {
  const embed = new EmbedBuilder()
    .setColor(MUTED_COLOR)
    .setTitle("No matching products")
    .setDescription(
      [
        `I could not find a clean match for **${truncate(query, 80)}**.`,
        "Try a shorter product name, a model code, or switch the QC filter off.",
      ].join("\n"),
    )
    .setFooter({ text: "GunnaFinds search" });

  return { embeds: [embed], components: [] };
}

export function buildExpiredSessionMessage() {
  return {
    embeds: [
      guardEmbed(
        "Search controls expired",
        "Run `/find` again to refresh the result controls. This keeps old buttons from changing stale searches.",
      ),
    ],
    components: [],
    ephemeral: true,
  };
}

export function buildOwnerOnlyMessage() {
  return {
    embeds: [
      guardEmbed(
        "Private controls",
        "These buttons belong to the member who started the search. Run `/find` to open your own result panel.",
      ),
    ],
    components: [],
    ephemeral: true,
  };
}

export function buildErrorMessage() {
  return {
    embeds: [
      guardEmbed(
        "Search is unavailable",
        "The catalog API did not answer cleanly. Wait a moment, then run the search again.",
      ),
    ],
    components: [],
    ephemeral: true,
  };
}

export function buildGenericCommandErrorMessage() {
  return {
    embeds: [
      guardEmbed(
        "Command failed",
        "That command did not complete cleanly. Check the bot logs or run `/setup-check` for setup diagnostics.",
      ),
    ],
    components: [],
    ephemeral: true,
  };
}

export function buildVerifyRoleMissingMessage(roleName) {
  return {
    embeds: [
      guardEmbed(
        "Verify role is not ready",
        `I could not find the verification role. Create a role named **${truncate(roleName, 64)}** or set \`VERIFY_ROLE_ID\`, then try again.`,
      ),
    ],
    components: [],
    ephemeral: true,
  };
}

export function buildVerifyPermissionErrorMessage(roleName) {
  return {
    embeds: [
      guardEmbed(
        "Verification needs permissions",
        `I found **${truncate(roleName, 64)}**, but I cannot assign it. Give the bot **Manage Roles** and move the bot role above **${truncate(roleName, 64)}**.`,
      ),
    ],
    components: [],
    ephemeral: true,
  };
}

export function buildAlreadyVerifiedMessage(roleName) {
  return {
    embeds: [
      guardEmbed(
        "Already verified",
        `You already have **${truncate(roleName, 64)}**. Access is unlocked.`,
        SUCCESS_COLOR,
      ),
    ],
    components: [],
    ephemeral: true,
  };
}

export function buildVerifySuccessMessage(roleName) {
  return {
    embeds: [
      guardEmbed(
        "Access unlocked",
        `You are verified. The **${truncate(roleName, 64)}** role has been added to your account.`,
        SUCCESS_COLOR,
      ),
    ],
    components: [],
    ephemeral: true,
  };
}

export function buildStatusMessage({ clientUser, uptimeMs, emojiCount, findApiUrl, latencyMs }) {
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const uptime =
    hours > 0 ? `${hours}h ${minutes % 60}m` : minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
  const apiStatus = Number.isFinite(latencyMs) ? `Online in ${latencyMs}ms` : "Not checked";

  const embed = new EmbedBuilder()
    .setColor(SUCCESS_COLOR)
    .setTitle("GunnaFinds bot status")
    .setDescription("Operational view for search, commands, and agent controls.")
    .addFields(
      { name: "Bot", value: clientUser?.tag ?? "Connected", inline: true },
      { name: "Uptime", value: uptime, inline: true },
      { name: "Agent emojis", value: String(emojiCount), inline: true },
      { name: "Search API", value: apiStatus, inline: true },
      { name: "Endpoint", value: truncate(findApiUrl, 100), inline: false },
    )
    .setFooter({ text: "Use deploy scripts from the bot folder for wyspbyte restarts" });

  return { embeds: [embed], components: [], ephemeral: true };
}

export function buildRestartDeniedMessage() {
  return {
    embeds: [
      guardEmbed(
        "Restart blocked",
        "Only configured bot operators or members with Manage Server can restart the bot.",
      ),
    ],
    components: [],
    ephemeral: true,
  };
}

export function buildRestartQueuedMessage() {
  return {
    embeds: [
      guardEmbed(
        "Restarting now",
        "The bot process is restarting. It should come back online in a moment.",
        SUCCESS_COLOR,
      ),
    ],
    components: [],
    ephemeral: true,
  };
}

export function buildRankMessage(activity, roleName = null) {
  const score = activity?.score ?? 0;
  const next =
    score < 10
      ? `${10 - score} points to Active Finder`
      : score < 35
        ? `${35 - score} points to Trusted Finder`
        : score < 90
          ? `${90 - score} points to Gunna Elite`
          : "Top activity role reached";

  const embed = new EmbedBuilder()
    .setColor(SUCCESS_COLOR)
    .setTitle("Activity rank")
    .setDescription("Activity roles grow from useful searches, finds, and channel activity.")
    .addFields(
      { name: "Score", value: String(score), inline: true },
      { name: "Searches", value: String(activity?.finds ?? 0), inline: true },
      { name: "Messages", value: String(activity?.messages ?? 0), inline: true },
      { name: "Current role", value: roleName ?? "Building up", inline: false },
      { name: "Next step", value: next, inline: false },
    );

  return { embeds: [embed], components: [], ephemeral: true };
}

export function buildWelcomeMessage() {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setAuthor({ name: "repgunna" })
    .setTitle("Welcome to GunnaFinds")
    .setURL(SITE_URL)
    .setDescription(
      [
        "Search verified finds, compare QC photos, and open the same item through your preferred agent.",
        "Read the rules, verify, then use the W2C channel when you want the bot to pull product matches into Discord.",
      ].join("\n"),
    )
    .addFields(
      { name: "Rule 1", value: "Keep W2C requests in the W2C channel. Use `/find` there so results stay searchable.", inline: false },
      { name: "Rule 2", value: "No fake links, spam, scams, unsafe payments, or referral flooding.", inline: false },
      { name: "Rule 3", value: "Check size, batch, seller, shipping, and agent fees before buying.", inline: false },
      { name: "Rule 4", value: "Respect members and staff. No harassment, doxxing, or drama farming.", inline: false },
      { name: "What the bot does", value: "It pulls product previews with images, prices, and agent buttons from the live catalog.", inline: false },
    )
    .setImage(CHANNEL_IMAGE_URLS.finds)
    .setFooter({ text: "Press Verify to unlock the server" });

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(VERIFY_BUTTON_ID).setLabel("Verify").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setLabel("Open catalog").setStyle(ButtonStyle.Link).setURL(SITE_URL),
      new ButtonBuilder().setLabel("W2C finder").setStyle(ButtonStyle.Link).setURL(`${SITE_URL}/finder`),
    ),
  ];

  return { embeds: [embed], components };
}

export function buildRulesPanelMessage() {
  const embed = new EmbedBuilder()
    .setColor(MUTED_COLOR)
    .setAuthor({ name: "GunnaFinds rules" })
    .setTitle("Rules for a cleaner server")
    .setDescription("Read these before posting. Verification means you agree to keep the server useful.")
    .addFields(
      { name: "Use W2C correctly", value: "Keep product requests in the W2C channel and use `/find` for searchable results.", inline: false },
      { name: "No spam or scams", value: "No fake stores, referral flooding, unsafe payment requests, or repeated command spam.", inline: false },
      { name: "Buy carefully", value: "Check batch, size, seller, shipping cost, agent fees, and QC before ordering.", inline: false },
      { name: "Respect members", value: "No harassment, doxxing, threats, or needless drama.", inline: false },
    )
    .setImage(CHANNEL_IMAGE_URLS.rules)
    .setFooter({ text: "Press Verify in welcome to unlock member channels" });

  return { embeds: [embed], components: [] };
}

export function buildFindsPanelMessage() {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setAuthor({ name: "GunnaFinds catalog" })
    .setTitle("Finds")
    .setDescription("Curated drops, clean product leads, and catalog-ready finds belong here.")
    .addFields(
      { name: "Keep it useful", value: "Post clear names, seller context, QC notes, and agent links when available.", inline: false },
      { name: "Use W2C for requests", value: "Use the W2C channel when you want the bot to search for a product.", inline: false },
    )
    .setImage(CHANNEL_IMAGE_URLS.finds)
    .setFooter({ text: "Verified members can browse and share finds here" });

  return { embeds: [embed], components: [] };
}

export function buildWebsitePanelMessage(siteUrl = SITE_URL) {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setAuthor({ name: "GunnaFinds website" })
    .setTitle("Open the live catalog")
    .setURL(siteUrl)
    .setDescription("Browse the full catalog, open product pages, compare agents, and use the finder from the website.")
    .addFields(
      { name: "Catalog", value: "Search products with images, prices, QC context, and agent routes.", inline: false },
      { name: "Finder", value: "Use the website finder when you want a larger search workspace.", inline: false },
    )
    .setImage(CHANNEL_IMAGE_URLS.website)
    .setFooter({ text: "Discord search stays in W2C. Full browsing lives on the website." });

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Open website").setStyle(ButtonStyle.Link).setURL(siteUrl),
      new ButtonBuilder().setLabel("Open finder").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/finder`),
      new ButtonBuilder().setLabel("Browse catalog").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/catalog`),
    ),
  ];

  return { embeds: [embed], components };
}

export function buildAnnouncementsPanelMessage() {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setAuthor({ name: "GunnaFinds announcements" })
    .setTitle("Announcements")
    .setDescription("Important updates, catalog changes, bot notices, and community alerts will appear here.")
    .addFields(
      { name: "Signal only", value: "This channel is read-only so updates stay easy to scan.", inline: false },
      { name: "What to expect", value: "New drops, import updates, verified sheet changes, and server notices.", inline: false },
    )
    .setImage(CHANNEL_IMAGE_URLS.announcements)
    .setFooter({ text: "Use W2C for search requests after verifying" });

  return { embeds: [embed], components: [] };
}

export function buildUpdatesPanelMessage(siteUrl = SITE_URL) {
  const embed = new EmbedBuilder()
    .setColor(SUCCESS_COLOR)
    .setAuthor({ name: "GunnaFinds updates" })
    .setTitle("Website updates")
    .setDescription("Catalog refreshes, product-count changes, and website sync notices appear here automatically.")
    .addFields(
      { name: "No noise", value: "This channel stays read-only so updates remain easy to scan.", inline: false },
      { name: "Synced source", value: "The bot watches the live website catalog and posts changes without pinging anyone.", inline: false },
    )
    .setImage(CHANNEL_IMAGE_URLS.website)
    .setFooter({ text: "Updates sync from repgunna.xyz" });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Open website").setStyle(ButtonStyle.Link).setURL(siteUrl),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

export function buildSyncedAnnouncementMessage(announcement) {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setAuthor({ name: "Website announcement" })
    .setTitle(truncate(announcement.title, 240))
    .setDescription(truncate(announcement.body, 1000))
    .setImage(CHANNEL_IMAGE_URLS.announcements)
    .setFooter({ text: "Synced from repgunna.xyz" });

  if (announcement.link) embed.setURL(announcement.link);

  const components = announcement.link
    ? [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("Open update").setStyle(ButtonStyle.Link).setURL(announcement.link),
        ),
      ]
    : [];

  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

export function buildWebsiteUpdateMessage({ total, previousTotal, siteUrl = SITE_URL }) {
  const delta =
    Number.isFinite(previousTotal) && Number.isFinite(total)
      ? total - previousTotal
      : null;
  const change =
    delta && delta > 0
      ? `${delta.toLocaleString()} new catalog items detected.`
      : "The website catalog changed.";
  const embed = new EmbedBuilder()
    .setColor(SUCCESS_COLOR)
    .setAuthor({ name: "Website update" })
    .setTitle("Catalog refreshed")
    .setDescription(change)
    .addFields({ name: "Live catalog size", value: total.toLocaleString(), inline: true })
    .setImage(CHANNEL_IMAGE_URLS.website)
    .setFooter({ text: "Synced automatically from the website" });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Open catalog").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/catalog`),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

export function buildW2cSetupMessage(channelId) {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setAuthor({ name: "GunnaFinds W2C" })
    .setTitle("Use this channel for product searches")
    .setDescription(
      [
        `Run \`/find\` here in <#${channelId}> when you want product matches, QC images, prices, and agent buttons.`,
        "Keep one request per message and use clean product names or model codes for better results.",
      ].join("\n"),
    )
    .addFields(
      { name: "Good searches", value: "`jordan 4 black cat`, `nike tech fleece`, `balenciaga track black`", inline: false },
      { name: "What you get", value: "Matched products, preview images, listed price, catalog link, and agent checkout buttons.", inline: false },
      { name: "If it misses", value: "Try fewer words, remove seller names, or turn the QC filter off.", inline: false },
    )
    .setImage(CHANNEL_IMAGE_URLS.w2c)
    .setFooter({ text: "W2C searches stay cleaner when everyone uses one channel" });

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Open catalog").setStyle(ButtonStyle.Link).setURL(SITE_URL),
      new ButtonBuilder().setLabel("W2C finder").setStyle(ButtonStyle.Link).setURL(`${SITE_URL}/finder`),
    ),
  ];

  return { embeds: [embed], components };
}

export function buildFindFeedMessage(product, siteUrl = SITE_URL) {
  const price = product.price ?? "Price not listed";
  const embed = new EmbedBuilder()
    .setColor(product.image ? BRAND_COLOR : SUCCESS_COLOR)
    .setAuthor({ name: feedReason(product.reason) })
    .setTitle(truncate(product.name, 240))
    .setURL(product.productUrl)
    .setDescription("A clean catalog pick from the website feed. No pings, no repeats.")
    .addFields(
      { name: "Price", value: `**${price}**`, inline: true },
      { name: "Source", value: "Website catalog", inline: true },
    )
    .setFooter({ text: "Automatic finds feed posts every 10 minutes" });

  if (product.image) embed.setImage(product.image);

  const firstAgent = product.agentLinks?.[0];
  const buttons = [
    new ButtonBuilder().setLabel("Open product").setStyle(ButtonStyle.Link).setURL(product.productUrl),
    new ButtonBuilder().setLabel("Open catalog").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/catalog`),
  ];
  if (firstAgent?.url) {
    buttons.push(new ButtonBuilder().setLabel(`Open ${firstAgent.name}`).setStyle(ButtonStyle.Link).setURL(firstAgent.url));
  }

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(...buttons.slice(0, 5))],
    allowedMentions: { parse: [] },
  };
}

export function buildSyncResultMessage({ announcements, updates, finds }) {
  const embed = new EmbedBuilder()
    .setColor(SUCCESS_COLOR)
    .setTitle("Sync complete")
    .setDescription("Website announcements, catalog updates, and finds feed were checked.")
    .addFields(
      { name: "Announcements", value: String(announcements), inline: true },
      { name: "Updates", value: String(updates), inline: true },
      { name: "Finds", value: String(finds), inline: true },
    );

  return { embeds: [embed], components: [], ephemeral: true };
}

export function isVerifyButton(customId) {
  return customId === VERIFY_BUTTON_ID;
}

export function buildProductMessage(
  result,
  requestedIndex = 0,
  emojiMap = {},
  userId = null,
  options = {},
) {
  if (!result.items.length) return emptyMessage(result.query);

  const index = clampIndex(result, requestedIndex);
  const product = result.items[index];
  const shownTotal = result.items.length;
  const price = product.price ?? "Price not listed";
  const sessionToken = options.sessionToken ?? "00000000000000000000";
  const qcOnly = options.qcOnly ?? true;
  const mode = qcOnly ? "QC images only" : "All catalog matches";
  const resultPosition = `${index + 1}/${shownTotal}`;

  const embed = new EmbedBuilder()
    .setColor(product.image ? BRAND_COLOR : SUCCESS_COLOR)
    .setAuthor({ name: "GunnaFinds product search" })
    .setTitle(truncate(product.name, 240))
    .setURL(product.productUrl)
    .setDescription(
      [
        `Search: **${truncate(result.query, 90)}**`,
        `${resultTone(index, shownTotal)} from **${result.total}** catalog hits.`,
      ].join("\n"),
    )
    .addFields(
      { name: "Price", value: `**${price}**`, inline: true },
      { name: "View", value: `**${resultPosition}**`, inline: true },
      { name: "Filter", value: `**${mode}**`, inline: true },
      { name: "Agents", value: truncate(agentSummary(product), 180), inline: false },
    )
    .setFooter({ text: "GunnaFinds search controls expire after 15 minutes" });

  if (product.image) embed.setImage(product.image);

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(cursorId(sessionToken, Math.max(0, index - 1)))
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === 0),
    new ButtonBuilder()
      .setCustomId(cursorId(sessionToken, Math.min(shownTotal - 1, index + 1)))
      .setLabel("Next result")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(index >= shownTotal - 1),
    new ButtonBuilder()
      .setCustomId(filterId(sessionToken, 0, !qcOnly))
      .setLabel(qcOnly ? "Show all" : "QC only")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel("Open product")
      .setStyle(ButtonStyle.Link)
      .setURL(product.productUrl),
  );

  const agentButtons = product.agentLinks.slice(0, MAX_AGENT_BUTTONS).map((agent) => {
    const button = new ButtonBuilder()
      .setLabel(`Open ${agent.name}`)
      .setStyle(ButtonStyle.Link)
      .setURL(agent.url);
    const emoji = agentEmoji(agent, emojiMap);
    if (emoji) button.setEmoji(emoji);
    return button;
  });

  const components = [nav];
  if (agentButtons.length > 0) {
    components.push(new ActionRowBuilder().addComponents(...agentButtons));
  }

  return {
    content: userId ? `<@${userId}>` : undefined,
    allowedMentions: userId ? { users: [userId] } : undefined,
    embeds: [embed],
    components,
  };
}
