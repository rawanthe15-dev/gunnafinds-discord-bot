import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const DEFAULT_ARCHIVE_URL =
  "https://github.com/rawanthe15-dev/gunnafinds-discord-bot/archive/refs/heads/main.tar.gz";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function isGitWorkTree() {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: PROJECT_ROOT,
    stdio: "ignore",
  });
  return result.status === 0;
}

export function buildSelfUpdatePlan({
  isGitWorkTree: gitWorkTree,
  projectRoot = PROJECT_ROOT,
  archiveUrl = process.env.BOT_UPDATE_ARCHIVE_URL || DEFAULT_ARCHIVE_URL,
  archivePath = null,
} = {}) {
  if (gitWorkTree) {
    return [
      { command: "git", args: ["pull", "--ff-only", "origin", "main"] },
      { command: "npm", args: ["ci", "--omit=dev"] },
    ];
  }

  const finalArchivePath = archivePath ?? path.join(mkdtempSync(path.join(tmpdir(), "gunnafinds-update-")), "main.tar.gz");
  return [
    { command: "curl", args: ["-fsSL", archiveUrl, "-o", finalArchivePath] },
    { command: "tar", args: ["-xzf", finalArchivePath, "--strip-components=1", "-C", projectRoot] },
    { command: "npm", args: ["ci", "--omit=dev"] },
  ];
}

export function selfUpdate() {
  const gitWorkTree = isGitWorkTree();
  const plan = buildSelfUpdatePlan({ isGitWorkTree: gitWorkTree });
  const tempDirs = new Set(
    plan
      .flatMap((step) => step.args)
      .filter((arg) => typeof arg === "string" && arg.includes("gunnafinds-update-"))
      .map((arg) => path.dirname(arg)),
  );

  try {
    for (const step of plan) run(step.command, step.args);
  } finally {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  selfUpdate();
}
