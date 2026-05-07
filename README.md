# GunnaFinds Discord Bot

Standalone NodeJS Discord bot for `/find` product search against repgunna.

## Clone Setup

```bash
git clone https://github.com/rawanthe15-dev/gunnafinds-discord-bot.git
cd gunnafinds-discord-bot
cp .env.example .env
npm ci --omit=dev
```

Edit `.env` with the Discord bot token, app ID, server ID, and optional shared
website API token.

Register slash commands after `.env` is filled:

```bash
npm run register
```

Start locally:

```bash
npm start
```

Start on wyspbyte with pm2:

```bash
npm run pm2:start
pm2 save
```

Restart or inspect logs:

```bash
npm run pm2:restart
npm run pm2:logs
```

## Environment Variables

The bot loads `.env` automatically.

```txt
DISCORD_TOKEN=your bot token
CLIENT_ID=your Discord application ID
GUILD_ID=your test server ID
SITE_URL=https://repgunna.xyz
ALLOWED_CHANNEL_ID=1500964521882161297
BOT_API_TOKEN=optional shared secret for the website bot API
WELCOME_OWNER_ID=974731025479499806
VERIFY_ROLE_ID=optional Discord role ID to grant from the Verify button
VERIFY_ROLE_NAME=Verified
BOT_DEPLOY_HOST=wyspbyte
BOT_DEPLOY_PATH=~/gunnafinds-bot
BOT_PROCESS_NAME=gunnafinds-bot
```

`GUILD_ID` is recommended while testing because slash commands update quickly.
Remove it later if you want global commands.

The bot calls:

```txt
SITE_URL/api/bot/find
```

So deploy the website changes before expecting live catalog results.
If `BOT_API_TOKEN` is set on the website, set the same value for the bot so the
public search endpoint only accepts bot traffic.

## Agent Button Emojis

Discord link buttons cannot use image URLs directly. They support emoji only.
The bot automatically looks for these custom emoji names in `GUILD_ID`:

```txt
lovegobuy
usfanslogo
oopbuy
litbuy
joyagoo
```

Make sure the bot is in the server that owns those emojis.

## Wyspbyte Push Operations

After the repo exists, you can also push updates from a local checkout if the
`wyspbyte` SSH host alias is configured:

```bash
npm run deploy
npm run restart
npm run logs
```

`npm run deploy` syncs the bot folder to `BOT_DEPLOY_HOST:BOT_DEPLOY_PATH`,
runs `npm ci --omit=dev`, registers slash commands, then restarts the process.
By default it targets the SSH host alias `wyspbyte` and uses pm2 process name
`gunnafinds-bot`.

If wyspbyte uses a custom process manager, set:

```txt
BOT_RESTART_COMMAND=your restart command
```

On Pterodactyl/Wyspbyte-style panel hosting, the bot defaults to restart by
exiting with code `1` so the host can bring it back. You can force either mode:

```txt
BOT_RESTART_MODE=exit
BOT_RESTART_EXIT_CODE=1
```

## Discord Restart Command

`/restart` restarts the bot from Discord. By default it is locked to
`WELCOME_OWNER_ID`, which defaults to `974731025479499806`. To allow exact
operators instead, set:

```txt
BOT_RESTART_USER_IDS=comma-separated Discord user IDs
```
