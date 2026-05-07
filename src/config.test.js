import test from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "./config.js";

test("readConfig canonicalizes the old Vercel site URL", () => {
  const config = readConfig({
    DISCORD_TOKEN: "token",
    CLIENT_ID: "client",
    GUILD_ID: "guild",
    SITE_URL: "https://repgunna.vercel.app/",
  });

  assert.equal(config.findApiUrl, "https://repgunna.xyz/api/bot/find");
});

test("readConfig passes optional bot API token through", () => {
  const config = readConfig({
    DISCORD_TOKEN: "token",
    CLIENT_ID: "client",
    SITE_URL: "https://repgunna.xyz",
    BOT_API_TOKEN: "shared-secret",
  });

  assert.equal(config.botApiToken, "shared-secret");
});

test("readConfig uses verification defaults", () => {
  const config = readConfig({
    DISCORD_TOKEN: "token",
    CLIENT_ID: "client",
  });

  assert.equal(config.welcomeOwnerId, "974731025479499806");
  assert.equal(config.verifyRoleName, "Verified");
  assert.equal(config.findsChannelId, "1502045050136428556");
  assert.equal(config.feedApiUrl, "https://repgunna.xyz/api/bot/feed");
  assert.equal(config.catalogApiUrl, "https://repgunna.xyz/api/catalog");
  assert.equal(config.announcementsApiUrl, "https://repgunna.xyz/api/admin/announcements");
});

test("readConfig builds restart controls", () => {
  const config = readConfig({
    DISCORD_TOKEN: "token",
    CLIENT_ID: "client",
    BOT_PROCESS_NAME: "custom-bot",
    BOT_RESTART_USER_IDS: "123, 456",
  });

  assert.match(config.restartCommand, /pm2 restart custom-bot/);
  assert.deepEqual(config.restartUserIds, ["123", "456"]);
});

test("readConfig defaults restart operators to the owner user", () => {
  const config = readConfig({
    DISCORD_TOKEN: "token",
    CLIENT_ID: "client",
  });

  assert.deepEqual(config.restartUserIds, ["974731025479499806"]);
});

test("readConfig uses process exit restart mode on panel hosting", () => {
  const config = readConfig({
    DISCORD_TOKEN: "token",
    CLIENT_ID: "client",
    PTERODACTYL_SERVER_UUID: "server-uuid",
  });

  assert.equal(config.restartMode, "exit");
  assert.equal(config.restartExitCode, 1);
});
