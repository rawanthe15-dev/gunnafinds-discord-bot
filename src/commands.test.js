import test from "node:test";
import assert from "node:assert/strict";
import { commands } from "./commands.js";

test("find command does not use autocomplete", () => {
  const find = commands.find((command) => command.name === "find");
  assert.ok(find);

  const query = find.options.find((option) => option.name === "query");
  assert.ok(query);
  assert.equal(query.autocomplete, undefined);
});

test("welcome and rules commands are registered", () => {
  assert.ok(commands.find((command) => command.name === "welcome"));
  assert.ok(commands.find((command) => command.name === "rules"));
});
