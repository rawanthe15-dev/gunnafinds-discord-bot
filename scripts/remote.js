import { spawnSync } from "node:child_process";

export const REMOTE_HOST = process.env.BOT_DEPLOY_HOST ?? "wyspbyte";
export const REMOTE_PATH = process.env.BOT_DEPLOY_PATH ?? "~/gunnafinds-bot";
export const PROCESS_NAME = process.env.BOT_PROCESS_NAME ?? "gunnafinds-bot";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

export function ssh(remoteCommand) {
  run("ssh", [REMOTE_HOST, remoteCommand]);
}

export function rsync(source, destination) {
  run("rsync", [
    "-az",
    "--delete",
    "--exclude",
    "node_modules",
    "--exclude",
    ".git",
    "--exclude",
    ".env",
    "--exclude",
    ".env.*",
    "--exclude",
    "npm-debug.log",
    source,
    `${REMOTE_HOST}:${destination}`,
  ]);
}

export function remoteShell(command) {
  return `set -e; cd ${REMOTE_PATH}; ${command}`;
}

export function restartCommand() {
  if (process.env.BOT_RESTART_COMMAND) return process.env.BOT_RESTART_COMMAND;
  return [
    `if command -v pm2 >/dev/null 2>&1; then`,
    `  pm2 restart ${PROCESS_NAME} --update-env || pm2 start src/index.js --name ${PROCESS_NAME};`,
    `elif command -v systemctl >/dev/null 2>&1; then`,
    `  systemctl --user restart ${PROCESS_NAME};`,
    `else`,
    `  echo "No restart manager found. Install pm2 or set BOT_RESTART_COMMAND.";`,
    `  exit 1;`,
    `fi`,
  ].join(" ");
}

export function helpRequested() {
  return process.argv.includes("--help") || process.argv.includes("-h");
}

export function printRemoteHelp(commandName, description) {
  console.log(
    [
      description,
      "",
      `Usage: npm run ${commandName}`,
      "",
      "Environment:",
      `  BOT_DEPLOY_HOST      SSH host alias, default ${REMOTE_HOST}`,
      `  BOT_DEPLOY_PATH      Remote bot path, default ${REMOTE_PATH}`,
      `  BOT_PROCESS_NAME     pm2 or systemd process name, default ${PROCESS_NAME}`,
      "  BOT_RESTART_COMMAND  Optional custom remote restart command",
    ].join("\n"),
  );
}
