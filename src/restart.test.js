import test from "node:test";
import assert from "node:assert/strict";
import { PermissionFlagsBits } from "discord.js";
import { canRestartBot } from "./restart.js";

test("canRestartBot allows configured restart operators", () => {
  const interaction = {
    user: { id: "123" },
    memberPermissions: { has: () => false },
  };

  assert.equal(canRestartBot(interaction, { restartUserIds: ["123"] }), true);
});

test("canRestartBot blocks non-operators when restart users are configured", () => {
  const interaction = {
    user: { id: "999" },
    memberPermissions: { has: () => true },
  };

  assert.equal(canRestartBot(interaction, { restartUserIds: ["123"] }), false);
});

test("canRestartBot falls back to Manage Server permission", () => {
  const interaction = {
    user: { id: "999" },
    memberPermissions: {
      has: (permission) => permission === PermissionFlagsBits.ManageGuild,
    },
  };

  assert.equal(canRestartBot(interaction, { restartUserIds: [] }), true);
});
