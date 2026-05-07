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
        "Search channel only",
        `Run \`/find\` in <#${channelId}> so product requests stay clean and easy to review.`,
      ),
    ],
    components: [],
    ephemeral: true,
  };
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
