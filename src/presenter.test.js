import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChannelOnlyMessage,
  buildExpiredSessionMessage,
  buildOwnerOnlyMessage,
  buildProductMessage,
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
