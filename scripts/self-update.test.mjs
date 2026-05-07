import test from "node:test";
import assert from "node:assert/strict";
import { buildSelfUpdatePlan } from "./self-update.mjs";

test("buildSelfUpdatePlan pulls and installs inside a git checkout", () => {
  assert.deepEqual(
    buildSelfUpdatePlan({ isGitWorkTree: true, projectRoot: "/bot" }),
    [
      { command: "git", args: ["pull", "--ff-only", "origin", "main"] },
      { command: "npm", args: ["ci", "--omit=dev"] },
    ],
  );
});

test("buildSelfUpdatePlan downloads archive and installs outside git", () => {
  assert.deepEqual(
    buildSelfUpdatePlan({
      isGitWorkTree: false,
      projectRoot: "/bot",
      archivePath: "/tmp/gunnafinds.tar.gz",
      archiveUrl: "https://example.test/main.tar.gz",
    }),
    [
      {
        command: "curl",
        args: ["-fsSL", "https://example.test/main.tar.gz", "-o", "/tmp/gunnafinds.tar.gz"],
      },
      {
        command: "tar",
        args: ["-xzf", "/tmp/gunnafinds.tar.gz", "--strip-components=1", "-C", "/bot"],
      },
      { command: "npm", args: ["ci", "--omit=dev"] },
    ],
  );
});
