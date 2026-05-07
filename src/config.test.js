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
