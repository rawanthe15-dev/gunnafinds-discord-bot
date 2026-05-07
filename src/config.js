const CANONICAL_SITE_URL = "https://repgunna.xyz";
const OLD_VERCEL_SITE_URL = "https://repgunna.vercel.app";

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
  const botApiToken = env.BOT_API_TOKEN;

  if (!token) throw new Error("Missing DISCORD_TOKEN");
  if (!clientId) throw new Error("Missing CLIENT_ID");
  if (!findApiUrl) throw new Error("Missing FIND_API_URL or SITE_URL");

  return {
    token,
    clientId,
    guildId,
    allowedChannelId,
    findApiUrl,
    botApiToken,
  };
}
