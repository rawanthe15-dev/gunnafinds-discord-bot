import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnnouncementsPanelMessage,
  buildChannelOnlyMessage,
  buildExpiredSessionMessage,
  buildGenericCommandErrorMessage,
  buildOwnerOnlyMessage,
  buildProductMessage,
  buildRulesPanelMessage,
  buildSetupCheckMessage,
  buildSetupServerResultMessage,
  buildVerifyPermissionErrorMessage,
  buildVerifyRoleMissingMessage,
  buildVerifySuccessMessage,
  buildW2cSetupMessage,
  buildWelcomeMessage,
  isVerifyButton,
  parseFilterCursor,
  parseResultCursor,
} from "./presenter.js";

const result = {
  query: "jordan 4 black cat",
  total: 2,
  items: [
    {
      id: "black-cat",
      name: "Jordan 4 Black Cat",
      image: "https://example.com/black-cat.jpg",
      price: "288 CNY",
      productUrl: "https://gunnafinds.example/p/black-cat",
      agentLinks: [
        { id: "oopbuy", name: "Oopbuy", url: "https://oopbuy.example/item" },
        { id: "litbuy", name: "Litbuy", url: "https://litbuy.example/item" },
      ],
    },
    {
      id: "black-cat-2",
      name: "Jordan 4 Black Cat Batch 2",
      image: "https://example.com/black-cat-2.jpg",
      price: "$52.00",
      productUrl: "https://gunnafinds.example/p/black-cat-2",
      agentLinks: [],
    },
  ],
};

test("buildProductMessage creates an embed with navigation and agent buttons", () => {
  const message = buildProductMessage(
    result,
    0,
    {
      oopbuy: { id: "123", name: "oopbuy" },
    },
    "1500964397697339535",
    { sessionToken: "abcdef1234567890abcd", qcOnly: true },
  );

  assert.equal(message.content, "<@1500964397697339535>");
  assert.equal(message.embeds[0].data.title, "Jordan 4 Black Cat");
  assert.equal(message.embeds[0].data.image.url, "https://example.com/black-cat.jpg");
  assert.match(message.embeds[0].data.description, /\*\*2\*\* catalog hits/);
  assert.equal(message.embeds[0].data.fields[2].value, "**QC images only**");
  assert.equal(message.components.length, 2);
  assert.equal(message.components[0].components[0].data.custom_id, "find:abcdef1234567890abcd:0");
  assert.equal(message.components[0].components[2].data.custom_id, "filter:abcdef1234567890abcd:0:all");
  assert.equal(message.components[1].components[0].data.label, "Open Oopbuy");
  assert.deepEqual(message.components[1].components[0].data.emoji, {
    id: "123",
    name: "oopbuy",
  });
});

test("buildChannelOnlyMessage explains where the command works", () => {
  const message = buildChannelOnlyMessage("1500964521882161297");

  assert.equal(message.ephemeral, true);
  assert.match(message.embeds[0].data.description, /<#1500964521882161297>/);
  assert.match(message.embeds[0].data.title, /w2c/i);
});

test("parseResultCursor decodes valid component ids without storing raw queries", () => {
  assert.deepEqual(parseResultCursor("find:abcdef1234567890abcd:3"), {
    type: "page",
    sessionToken: "abcdef1234567890abcd",
    index: 3,
  });
});

test("parseFilterCursor decodes filter toggle ids", () => {
  assert.deepEqual(parseFilterCursor("filter:abcdef1234567890abcd:0:qc"), {
    type: "filter",
    sessionToken: "abcdef1234567890abcd",
    index: 0,
    qcOnly: true,
  });
});

test("product controls stay below Discord custom id limits", () => {
  const message = buildProductMessage(
    { ...result, query: "jordan ".repeat(20).trim() },
    0,
    {},
    "1500964397697339535",
    { sessionToken: "abcdef1234567890abcd", qcOnly: false },
  );

  for (const row of message.components) {
    for (const component of row.components) {
      if (component.data.custom_id) assert.ok(component.data.custom_id.length <= 100);
    }
  }
});

test("ephemeral guard messages are safe for stale or shared controls", () => {
  assert.equal(buildExpiredSessionMessage().ephemeral, true);
  assert.equal(buildOwnerOnlyMessage().ephemeral, true);
  assert.match(buildExpiredSessionMessage().embeds[0].data.title, /expired/i);
  assert.match(buildOwnerOnlyMessage().embeds[0].data.title, /private/i);
});

test("welcome message includes rules, open graph image, and verify button", () => {
  const welcome = buildWelcomeMessage();

  assert.equal(welcome.embeds[0].data.image.url, "https://repgunna.xyz/opengraph-image");
  assert.match(welcome.embeds[0].data.title, /welcome/i);
  assert.match(welcome.embeds[0].data.fields[0].name, /rule/i);
  assert.equal(welcome.components[0].components[0].data.custom_id, "verify:access");
  assert.equal(isVerifyButton("verify:access"), true);
});

test("verify result messages are ephemeral", () => {
  assert.equal(buildVerifyRoleMissingMessage("Verified").ephemeral, true);
  assert.equal(buildVerifyPermissionErrorMessage("Verified").ephemeral, true);
  assert.equal(buildVerifySuccessMessage("Verified").ephemeral, true);
});

test("setup panels explain channel and verification setup", () => {
  const w2c = buildW2cSetupMessage("1500964521882161297");
  const rules = buildRulesPanelMessage();
  const announcements = buildAnnouncementsPanelMessage();
  const check = buildSetupCheckMessage({
    allowedChannelId: "1500964521882161297",
    currentChannelId: "1500964521882161297",
    role: { name: "Verified" },
    roleError: "Verified",
    canManageRoles: true,
  });

  assert.match(w2c.embeds[0].data.title, /product searches/i);
  assert.match(w2c.embeds[0].data.description, /<#1500964521882161297>/);
  assert.match(rules.embeds[0].data.title, /rules/i);
  assert.match(announcements.embeds[0].data.title, /announcements/i);
  assert.equal(check.ephemeral, true);
  assert.match(check.embeds[0].data.title, /setup check/i);
});

test("server setup result summarizes channel locking", () => {
  const message = buildSetupServerResultMessage({
    verifiedRole: { name: "Verified" },
    publicChannels: [{ id: "1" }, { id: "2" }, { id: "3" }],
    w2cChannelId: "4",
    lockedCount: 8,
    skippedCount: 1,
  });

  assert.equal(message.ephemeral, true);
  assert.match(message.embeds[0].data.title, /complete/i);
  assert.match(message.embeds[0].data.fields[1].value, /<#1>/);
  assert.match(message.embeds[0].data.fields[2].value, /<#4>/);
});

test("generic command errors do not mention search", () => {
  const message = buildGenericCommandErrorMessage();

  assert.equal(message.ephemeral, true);
  assert.doesNotMatch(message.embeds[0].data.title, /search/i);
});
