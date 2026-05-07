import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REMOTE_HOST,
  REMOTE_PATH,
  helpRequested,
  printRemoteHelp,
  remoteShell,
  restartCommand,
  rsync,
  ssh,
} from "./remote.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(scriptDir, "..");

if (helpRequested()) {
  printRemoteHelp("deploy", "Deploy the GunnaFinds Discord bot to wyspbyte.");
  process.exit(0);
}

console.log(`Deploying bot to ${REMOTE_HOST}:${REMOTE_PATH}`);
ssh(`mkdir -p ${REMOTE_PATH}`);
rsync(`${botDir}/`, REMOTE_PATH);
ssh(
  remoteShell(
    [
      "npm ci --omit=dev",
      "npm run register",
      restartCommand(),
      "echo GunnaFinds bot deployment complete",
    ].join(" && "),
  ),
);
