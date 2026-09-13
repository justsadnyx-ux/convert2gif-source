# Convert2GIF

A Discord bot that turns PNG/JPG/GIF images into **real static GIF files** — open source and self-hostable.

**Hosted by [convert2gif.pages.dev](https://convert2gif.pages.dev/)**

## Download

Everything is published on the [Releases](https://github.com/justsadnyx-ux/convert2gif-source/releases) page:

| Asset | What it is |
| ----- | ---------- |
| `convert2gif-bootstrap-v1.3.0-win.zip` | **Windows desktop bootstrapper (native GUI — no browser, no terminal).** Contains `Convert2GIF-Bootstrap.exe` (the control panel window) + `c2g-host.exe` (the engine). **Start here.** |
| `convert2gif-app-*.zip` | The `/gif`-only bot package the bootstrapper installs automatically. |

macOS (`.dmg`) and mobile builds are coming soon.

## Quick start (Windows)

1. Download `convert2gif-bootstrap-v1.3.0-win.zip` from the latest release and **extract both .exe files to the same folder**.
2. Run `Convert2GIF-Bootstrap.exe`. A desktop window opens (it also sits in the system tray).
3. Enter your bot **Token** and **Application ID** (from the Discord Developer Portal), press **Save Config**.
4. Press **Start Bot**. Done.

Your config is stored in `%APPDATA%\Convert2GIF\` — **you enter your token once, even across updates.**

## Features

- **Real native desktop window** — no browser tab, no terminal. Double-click to run.
- Tray icon: closing the window keeps the bot online; reopen from the tray.
- One window for everything: config, start/stop, presence, live log, updates, repair.
- Config survives updates (stored outside the app folder).
- Self-healing: auto reinstalls missing packages or re-pulls a clean app if the bot fails to start.
- Self-updating: downloads new releases, the new build cleans up the old files; config untouched.
- Presence control: online / idle / DND / invisible.
- Branding "Hosted by convert2gif.pages.dev" shown in bot replies and activity.

## Repository layout

| Path | Purpose |
| ---- | ------- |
| `gui/` | Native Windows GUI (`MainForm.cs` C# WinForms) + `build.ps1` (builds the release zip). |
| `bootstrap/` | Host engine (`launcher.js` + bundled `ui.js`): installs Node.js, auto-provisions the bot, self-heal + self-update, local JSON API the GUI drives. |
| `app/` | The `/gif`-only bot installed by the bootstrapper (`bot.js`, `media.js`). |
| `selfhost/` | Same `/gif`-only bot as a standalone Node script (env-var config). |
| `public/` | The website (home, terms, privacy, discord redirect). |
| `functions/` | Cloudflare Pages functions: interaction server, `/source` redirect, converter/stats/poll APIs. |
| `functions/_lib/media.js` | Pure image → GIF conversion core (works on Workers and plain Node). |
| `poller/` | Gateway worker (messages, reactions, moderation, logging). |
| `scripts/` | Command registration + profile generators. |

## Building the Windows bootstrapper

```
bun install
powershell -ExecutionPolicy Bypass -File gui/build.ps1
# -> dist/convert2gif-bootstrap-v1.3.0-win.zip (+ app zip)
```

## Homepage

The site homepage redirects here so GitHub's **Releases + README** are the single source of truth.
`https://convert2gif.pages.dev/source?code=<code>` also redirects here.

## Hosting the full bot (Cloudflare Pages)

Replace every `<YOUR_...>` placeholder (IDs were scrubbed from the public tree),
set secrets (`BOT_TOKEN`, `POLL_SECRET`, `DISCORD_CLIENT_ID`), configure the
`CONVERT_DATA` KV namespace id in `wrangler.toml`, create the AutoMod rules and
roles, then:

```
wrangler pages deploy --project-name convert2gif
wrangler deploy -c poller/wrangler.toml   # gateway worker + cron
```

Validation / moderation / logging all ship in `functions/_lib/slash.js` and `poller/src/bot.js`.