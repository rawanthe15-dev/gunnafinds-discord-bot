const CANONICAL_SITE_URL = "https://repgunna.xyz";
const OLD_VERCEL_SITE_URL = "https://repgunna.vercel.app";
const DEFAULT_FINDS_CHANNEL_ID = "1502045050136428556";
const DEFAULT_PROCESS_NAME = "gunnafinds-bot";
const DEFAULT_RESTART_EXIT_CODE = 1;

function normalizeSiteUrl(value) {
  const siteUrl = value.replace(/\/+$/, "");
  return siteUrl === OLD_VERCEL_SITE_URL ? CANONICAL_SITE_URL : siteUrl;
}

function splitIds(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstNonBlank(...values) {
  return values.find((value) => typeof value === "string" && value.trim());
}

function defaultRestartCommand(processName) {
  return [
    "if command -v pm2 >/dev/null 2>&1; then",
    `  pm2 restart ${processName} --update-env || pm2 start src/index.js --name ${processName};`,
    "elif command -v systemctl >/dev/null 2>&1; then",
    `  systemctl --user restart ${processName};`,
    "else",
    '  echo "No restart manager found. Install pm2 or set BOT_RESTART_COMMAND.";',
    "  exit 1;",
    "fi",
  ].join(" ");
}

function panelHostDetected(env) {
  return Boolean(env.PTERODACTYL_SERVER_UUID || env.SERVER_MEMORY);
}

function restartMode(env) {
  const explicit = env.BOT_RESTART_MODE?.trim().toLowerCase();
  if (explicit) {
    if (explicit !== "command" && explicit !== "exit") {
      throw new Error("BOT_RESTART_MODE must be command or exit");
    }
    return explicit;
  }

  return env.BOT_RESTART_COMMAND || !panelHostDetected(env) ? "command" : "exit";
}

function restartExitCode(env) {
  const parsed = Number.parseInt(env.BOT_RESTART_EXIT_CODE ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255
    ? parsed
    : DEFAULT_RESTART_EXIT_CODE;
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
  const welcomeOwnerId = env.WELCOME_OWNER_ID?.trim() || "974731025479499806";
  const verifyRoleId = env.VERIFY_ROLE_ID;
  const verifyRoleName = env.VERIFY_ROLE_NAME ?? "Verified";
  const findsChannelId = env.FINDS_CHANNEL_ID ?? DEFAULT_FINDS_CHANNEL_ID;
  const announcementsChannelId = env.ANNOUNCEMENTS_CHANNEL_ID;
  const updatesChannelId = env.UPDATES_CHANNEL_ID;
  const websiteChannelId = env.WEBSITE_CHANNEL_ID;
  const restartProcessName = env.BOT_PROCESS_NAME ?? DEFAULT_PROCESS_NAME;
  const restartCommand = env.BOT_RESTART_COMMAND || defaultRestartCommand(restartProcessName);
  const restartModeValue = restartMode(env);
  const restartExitCodeValue = restartExitCode(env);
  const restartUserIds = splitIds(
    firstNonBlank(env.BOT_RESTART_USER_IDS, env.DISCORD_OWNER_IDS, env.OWNER_IDS, welcomeOwnerId),
  );
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
    restartMode: restartModeValue,
    restartCommand,
    restartExitCode: restartExitCodeValue,
    restartUserIds,
    stateFile,
  };
}
