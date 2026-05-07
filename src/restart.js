import { exec } from "node:child_process";
import { PermissionFlagsBits } from "discord.js";

export function canRestartBot(interaction, config) {
  if (config.restartUserIds.length > 0) {
    return config.restartUserIds.includes(interaction.user.id);
  }

  return Boolean(interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild));
}

export function queueBotRestart(command, delayMs = 750) {
  if (!command) throw new Error("Missing restart command");

  const timer = setTimeout(() => {
    exec(command, (error, stdout, stderr) => {
      if (stdout) console.log(stdout.trim());
      if (stderr) console.error(stderr.trim());
      if (error) console.error("Bot restart failed:", error.message);
    });
  }, delayMs);

  timer.unref?.();
}
