import {
  REMOTE_HOST,
  REMOTE_PATH,
  helpRequested,
  printRemoteHelp,
  remoteShell,
  restartCommand,
  ssh,
} from "./remote.js";

if (helpRequested()) {
  printRemoteHelp("restart", "Restart the GunnaFinds Discord bot on wyspbyte.");
  process.exit(0);
}

console.log(`Restarting bot on ${REMOTE_HOST}:${REMOTE_PATH}`);
ssh(remoteShell(restartCommand()));
