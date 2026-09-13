# Convert2GIF — Self-Host Setup

Convert2GIF is a self-hosted Discord bot that turns PNG/JPEG/GIF attachments or URLs
into **real static GIF files**. You run it on your own machine (or container); the
source lives at <https://github.com/justsadnyx-ux/convert2gif-source>.

## What you get

| Component | What it does |
| --------- | ------------ |
| `Convert2GIF-Bootstrap.exe` | Native Windows GUI (dark theme). Saves token/client ID, starts/stops the bot, changes presence, checks & installs updates, repairs, opens data folder, quits to tray. No browser needed. |
| `c2g-host.exe` | The engine (Bun). Installs a Node runtime + the app, self-heals on crash, serves the local control API, and updates itself + the app. |
| `app/bot.js` | The Discord bot: `/gif`, `/help`, `/info`, `/uptime`. Pure Node ≥ 22, no Discord library. |

## 1. Create the Discord application

1. Go to <https://discord.com/developers/applications> → **New Application** → name it (e.g. `Convert2GIF`).
2. Copy the **Application ID** (this is your *client ID*).
3. Under **Bot**, click **Reset Token**, then copy the new token (this is your *bot token*). Enable **Server Members Intent** if you want member data.
4. Invite the bot to your server with the **OAuth2 → URL Generator** (scope `bot`, or run the invite link from the Convert2GIF homepage). Minimum permissions: Read Messages, Send Messages, Read Message History, Attach Files.

## 2. Run the Windows bootstrapper

1. Grab the latest `convert2gif-bootstrap-*-win.zip` from the **releases** page and extract it anywhere.
2. Run `Convert2GIF-Bootstrap.exe`.
3. First run: paste your **bot token** + **client ID**, hit **Save**, then **Start**.
4. That's it. The engine provisions Node + the app (first run takes ~30–60 s), connects the bot, and the GUI live-streams its log while polling status. Minimize to the tray and you're self-hosting.

## 3. Config & data (survives updates)

The engine keeps everything outside the app folder so updates never touch your config:

- `%APPDATA%\Convert2GIF\config.json` — `{ "token": "...", "clientId": "..." }`
- `%APPDATA%\Convert2GIF\control.json` — `{ "presence": "online", "stop": false }` (presence: `online` / `idle` / `dnd` / `invisible`; set `stop: true` to shut the bot down)

## 4. Updates

The GUI's **Check update** / **Install update** buttons use the release channel:

1. New **app** zip is downloaded, verified (sha256), installed to a versioned folder.
2. New **engine** exe is downloaded, verified (PE header + sha256), launched with `--post-update=<old>`, and **deletes the old exe** after it exits.
3. Config/control are never touched.

## 5. Commands

| Command | Description |
| ------- | ----------- |
| `/gif <url or attach image>` | Convert an image to a real static GIF file |
| `/help` | List all commands |
| `/info` | Version, uptime, ping, hosting |
| `/uptime` | How long the bot has been running |

## Next

- [Run the bot in Docker instead](DOCKER.md)
- [Run the bot standalone with Node](SELFHOST.md)