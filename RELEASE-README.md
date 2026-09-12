# Convert2GIF — Open Source Release

Everything behind **convert2gif.pages.dev** plus a fully local, no-cloud stack:

- a **terminal bootstrapper** (`.exe`) that installs Node, sets the bot up,
  runs it, changes its presence, and **updates itself**;
- a **`/gif`-only self-hosted bot** you can run on any machine;
- the Cloudflare Pages website + gateway poller (for the original hosted bot).

**Hosted by convert2gif.pages.dev** — please keep the branding when forking.

---

## Releases (versioned properly)

| Tag | Contents |
| --- | -------- |
| `v1.1.0` | `Convert2GIF-Bootstrap.exe` (self-updating terminal bootstrapper) + `convert2gif-app-v1.1.0.zip` (the bot it installs) |
| `v1.0.0` | `Convert2GIF-Terminal.exe` (previous simple launcher) |

Both `.exe`s are Windows binaries compiled with Bun — no Node or Cloudflare is
required to run the bootstrapper itself.

---

## What's in the repo

| Path | What it is |
| ---- | ---------- |
| `public/` | The website (home, terms, privacy, discord redirect — everything else removed) |
| `functions/` | Cloudflare Pages Functions: Discord interaction server, web converter API, stats, poll, **`/source` redirect** (long URL → repo) |
| `functions/_lib/media.js` | Pure image → GIF conversion core (PNG/JPG/GIF decode + GIF encode + NSFW rasterize) — **Node-compatible** |
| `functions/_lib/slash.js` | All 16 slash commands, verification, moderation, logging |
| `functions/api/poll.js` | Rate-limited web-converter endpoint |
| `poller/` | The Discord Gateway worker (messages, reactions, moderation, logging) |
| `bootstrap/launcher.js` | Source of the **terminal bootstrapper** (`bun build --compile --minify bootstrap/launcher.js`) |
| `app/` | The `/gif`-only bot package the bootstrapper installs (`app/bot.js`, `app/media.js`, `app/package.json`) |
| `selfhost/index.js` | The same `/gif`-only bot standalone (plain Node >= 22) |
| `scripts/` | Command registration + avatar/banner/profile generators |

---

## Local, no-cloud setup (`/gif`-only bot)

1. Download `Convert2GIF-Bootstrap.exe` from the latest release.
2. Put it in a folder, run it.
3. It installs **Node.js** if missing, downloads + extracts the app package,
   runs `npm install`, and lets you:
   - **Start / Stop** the bot
   - **Change presence**: online / away / DND / invisible
   - **Edit configuration** (it asks for your bot token + application id)
   - **Check for updates** (self-updates the bootstrapper and app from GitHub)
4. The bot registers and serves only `/gif` — attach an image or pass `url:`.

CLI alternative:

```bash
npm install
node app/bot.js        # requires app/config.json (see bootstrap config wizard)
# or: node selfhost/index.js   (reads BOT_TOKEN / DISCORD_CLIENT_ID env vars)
```

---

## Hosting the full bot (Cloudflare Pages)

Unchanged from before — edit the `<YOUR_...>` placeholders (IDs are scrubbed
from the public tree), set secrets (`BOT_TOKEN`, `POLL_SECRET`,
`DISCORD_CLIENT_ID`), then `wrangler pages deploy`. Set the `CONVERT_DATA` KV
namespace id in `wrangler.toml`, create the AutoMod rules + roles, and point an
external cron at `POST /api/poll`.

See `README.md` for the step-by-step guide.

---

## The `/source` redirect

`https://convert2gif.pages.dev/source?code=<long-random-code>` → 302 →
this repository. The code is stored in the `CONVERT_DATA` KV namespace under
`sourcecode`.