const CANONICAL_SITE_URL = "https://repgunna.xyz";
const OLD_VERCEL_SITE_URL = "https://repgunna.vercel.app";
const DEFAULT_FINDS_CHANNEL_ID = "1502045050136428556";

function normalizeSiteUrl(value) {
  const siteUrl = value.replace(/\/+$/, "");
  return siteUrl === OLD_VERCEL_SITE_URL ? CANONICAL_SITE_URL : siteUrl;
}

export function readConfig(env = process.env) {
  const token = env.DISCORD_TOKEN;
  const clientId = env.CLIENT_ID ?? env.DISCORD_CLIENT_ID;
  const guildId = env.GUILD_ID ?? env.DISCORD_GUILD_ID;
  const allowedChannelId =
    env.ALLOWED_CHANNEL_ID ?? env.DISCORD_ALLOWED_CHANNEL_ID ?? "1500964521882161297";
  const siteUrl = normalizeSiteUrl(env.SITE_URL ?? env.PUBLIC_SITE_URL ?? CANONICAL_SITE_URL);
  const findApiUrl = env.FIND_API_URL ?? (siteUrl ? `${siteUrl}/api/bot/find` : "");
  const feedApiUrl = env.FEED_API_URL ?? (siteUrl ? `${siteUrl}/api/bot/feed` : "");
  const catalogApiUrl = env.CATALOG_API_URL ?? (siteUrl ? `${siteUrl}/api/catalog` : "");
  const announcementsApiUrl =
    env.ANNOUNCEMENTS_API_URL ?? (siteUrl ? `${siteUrl}/api/admin/announcements` : "");
  const botApiToken = env.BOT_API_TOKEN;
  const welcomeOwnerId = env.WELCOME_OWNER_ID ?? "974731025479499806";
  const verifyRoleId = env.VERIFY_ROLE_ID;
  const verifyRoleName = env.VERIFY_ROLE_NAME ?? "Verified";
  const findsChannelId = env.FINDS_CHANNEL_ID ?? DEFAULT_FINDS_CHANNEL_ID;
  const announcementsChannelId = env.ANNOUNCEMENTS_CHANNEL_ID;
  const updatesChannelId = env.UPDATES_CHANNEL_ID;
  const websiteChannelId = env.WEBSITE_CHANNEL_ID;
  const stateFile =
    env.BOT_STATE_FILE ??
    (env.PTERODACTYL_SERVER_UUID || env.SERVER_MEMORY
      ? "/home/container/gunnafinds-bot-state.json"
      : ".data/gunnafinds-bot-state.json");

  if (!token) throw new Error("Missing DISCORD_TOKEN");
  if (!clientId) throw new Error("Missing CLIENT_ID");
  if (!findApiUrl) throw new Error("Missing FIND_API_URL or SITE_URL");

  return {
    token,
    clientId,
    guildId,
    allowedChannelId,
    siteUrl,
    findApiUrl,
    feedApiUrl,
    catalogApiUrl,
    announcementsApiUrl,
    botApiToken,
    welcomeOwnerId,
    verifyRoleId,
    verifyRoleName,
    findsChannelId,
    announcementsChannelId,
    updatesChannelId,
    websiteChannelId,
    stateFile,
  };
}
