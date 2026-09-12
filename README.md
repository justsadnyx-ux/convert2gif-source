# Convert2GIF

A Discord bot that turns PNG/JPG/GIF images into **real static GIF files**, now open source and self-hostable.

**Hosted by [convert2gif.pages.dev](https://convert2gif.pages.dev/)**

## Download

Everything is published on the [Releases](https://github.com/justsadnyx-ux/convert2gif-source/releases) page:

| Asset | What it is |
| ----- | ---------- |
| `Convert2GIF-Bootstrap.exe` | Windows bootstrapper with a browser-based control panel. Installs Node.js + the bot, manages it, self-heals, self-updates. **Start here.** |
| `convert2gif-app-*.zip` | The `/gif`-only bot package the bootstrapper installs automatically. |
| `Convert2GIF-Mobile-BETA.apk` | Android app to control the same bootstrapper from your phone (same Wi-Fi). |

## Quick start

1. Download `Convert2GIF-Bootstrap.exe` from the latest release.
2. Run it — a control panel opens in your browser.
3. Enter your bot token + application id once (Settings).
4. Press start. That's it.

Your config is stored in `%APPDATA%\Convert2GIF\` — **you enter your token once, even across updates.**

## Features

- Real browser UI — no terminal required.
- Config survives updates (stored outside the app folder).
- Self-healing: auto reinstalls missing packages or re-pulls a clean app if the bot fails to start.
- Self-updating: downloads new bootstrapper + app releases; config untouched.
- Presence control: online / away / DND / invisible.
- Mobile BETA: control from your phone over LAN, or install the panel as an app (PWA). Standalone Android APK published.
- Branding "Hosted by convert2gif.pages.dev" shown in bot replies and activity.

## Repository layout

| Path | Purpose |
| ---- | ------- |
| `bootstrap/` | Bootstrapper source (`launcher.js` + bundled browser UI `ui.js`). Build: `bun build --compile --minify bootstrap/launcher.js --outfile Convert2GIF-Bootstrap.exe` |
| `app/` | The `/gif`-only bot installed by the bootstrapper (`bot.js`, `media.js`). |
| `selfhost/` | Same `/gif`-only bot as a standalone Node script (env-var config). |
| `android/` | Android app (BETA) source + `build-apk.ps1` (no Gradle required). |
| `public/` | The website (home, terms, privacy, discord redirect). |
| `functions/` | Cloudflare Pages functions: interaction server, `/source` redirect, converter/stats/poll APIs. |
| `functions/_lib/media.js` | Pure image → GIF conversion core (works on Workers and plain Node). |
| `poller/` | Gateway worker (messages, reactions, moderation, logging). |
| `scripts/` | Command registration + profile generators. |

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