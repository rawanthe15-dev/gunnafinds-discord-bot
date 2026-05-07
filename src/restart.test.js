import test from "node:test";
import assert from "node:assert/strict";
import { PermissionFlagsBits } from "discord.js";
import { canRestartBot, queueBotRestart } from "./restart.js";

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

test("queueBotRestart exits the process in exit mode", () => {
  const exits = [];

  queueBotRestart(
    { restartMode: "exit", restartExitCode: 1 },
    {
      setTimeoutFn: (callback) => {
        callback();
        return { unref() {} };
      },
      exitFn: (code) => exits.push(code),
      logger: { log() {}, error() {}, warn() {} },
    },
  );

  assert.deepEqual(exits, [1]);
});

test("queueBotRestart runs a restart command in command mode", () => {
  const commands = [];

  queueBotRestart(
    { restartMode: "command", restartCommand: "pm2 restart gunnafinds-bot" },
    {
      setTimeoutFn: (callback) => {
        callback();
        return { unref() {} };
      },
      execFn: (command, callback) => {
        commands.push(command);
        callback(null, "", "");
      },
      logger: { log() {}, error() {}, warn() {} },
    },
  );

  assert.deepEqual(commands, ["pm2 restart gunnafinds-bot"]);
});
