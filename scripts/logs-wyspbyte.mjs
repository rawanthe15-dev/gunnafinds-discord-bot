import {
  PROCESS_NAME,
  REMOTE_HOST,
  helpRequested,
  printRemoteHelp,
  remoteShell,
  ssh,
} from "./remote.js";

if (helpRequested()) {
  printRemoteHelp("logs", "Open recent GunnaFinds Discord bot logs from wyspbyte.");
  process.exit(0);
}

console.log(`Opening recent logs for ${PROCESS_NAME} on ${REMOTE_HOST}`);
ssh(
  remoteShell(
    [
      `if command -v pm2 >/dev/null 2>&1; then`,
      `  pm2 logs ${PROCESS_NAME} --lines 120;`,
      `elif command -v journalctl >/dev/null 2>&1; then`,
      `  journalctl --user -u ${PROCESS_NAME} -n 120 -f;`,
      `else`,
      `  echo "No supported log manager found.";`,
      `  exit 1;`,
      `fi`,
    ].join(" "),
  ),
);
