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
const OPEN_GRAPH_IMAGE_URL = `${SITE_URL}/opengraph-image`;
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
    .setImage(OPEN_GRAPH_IMAGE_URL)
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
    .setImage(OPEN_GRAPH_IMAGE_URL)
    .setFooter({ text: "W2C searches stay cleaner when everyone uses one channel" });

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Open catalog").setStyle(ButtonStyle.Link).setURL(SITE_URL),
      new ButtonBuilder().setLabel("W2C finder").setStyle(ButtonStyle.Link).setURL(`${SITE_URL}/finder`),
    ),
  ];

  return { embeds: [embed], components };
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
