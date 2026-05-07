import { exec } from "node:child_process";
import { PermissionFlagsBits } from "discord.js";

export function canRestartBot(interaction, config) {
  if (config.restartUserIds.length > 0) {
    return config.restartUserIds.includes(interaction.user.id);
  }

  return Boolean(interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild));
}

function normalizeRestartConfig(value) {
  if (typeof value === "string") {
    return {
      restartMode: "command",
      restartCommand: value,
      restartExitCode: 1,
    };
  }

  return {
    restartMode: value?.restartMode ?? "command",
    restartCommand: value?.restartCommand,
    restartExitCode: value?.restartExitCode ?? 1,
  };
}

export function queueBotRestart(restartConfig, options = {}) {
  const config = normalizeRestartConfig(restartConfig);
  const {
    delayMs = 750,
    setTimeoutFn = setTimeout,
    execFn = exec,
    exitFn = process.exit.bind(process),
    logger = console,
  } = options;
  const timer = setTimeoutFn(() => {
    if (config.restartMode === "exit") {
      logger.warn(`Restarting bot by exiting process with code ${config.restartExitCode}`);
      exitFn(config.restartExitCode);
      return;
    }

    if (!config.restartCommand) {
      logger.error("Bot restart failed: missing restart command");
      return;
    }

    execFn(config.restartCommand, (error, stdout, stderr) => {
      if (stdout) logger.log(stdout.trim());
      if (stderr) logger.error(stderr.trim());
      if (error) logger.error("Bot restart failed:", error.message);
    });
  }, delayMs);

  timer.unref?.();
}
