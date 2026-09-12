# Convert2GIF

A Discord bot + website that turns images, videos, and GIFs into animated GIFs.

## What's here

- `public/` — the website (homepage, web converter, terms, privacy) served on `convert2gif.pages.dev`
- `functions/api/convert.js` — rate-limited conversion tracker for the web converter
- `functions/api/stats.js` — live stats endpoint (GIF count, servers, online status)
- `functions/api/poll.js` — the Discord bot. Processing happens here via the REST API.
- `scripts/setup-profile.js` — generates an avatar/banner and sets the bot's username, bio, and app description
- `wrangler.toml` — Cloudflare Pages config (+ KV namespace)

## Commands

| Command | Description |
| ------- | ----------- |
| `.gif` | Reply to a message with an image, or attach one. The bot converts it to an animated GIF and replies. |
| `.help` | Lists commands. |
| `.uptime` | Bot uptime. |
| `.stats` | GIF conversion count + server count. |

Rate limits: 5 commands per 15s per user, 30 per 15s per guild. The web converter allows 10 conversions per 10 minutes per IP.

## Architecture

Cloudflare Pages **Functions** can't stream the Discord Gateway, and they don't have a native cron trigger, so the bot runs as a **poll loop**: an external cron service hits `POST /api/poll` (every 15–30s) with the poll secret. The poll endpoint reads recent messages from guilds the bot is in, processes commands, and replies with GIFs directly from the edge.

Conversion is done server-side in pure JS:
- PNG / JPEG decoded with `pngjs` / `jpeg-js`
- Encoded to GIF with `gifenc`
- Replies attach the GIF via Discord's REST API (multipart)

Videos and WebP are not converted by the bot (it must stay fast) — the web converter handles those fully in-browser using the GIF.js encoder.

## Setup

1. Install deps:

```bash
npm install
```

2. Create a KV namespace and put its ID in `wrangler.toml`:

```bash
npx wrangler kv namespace create CONVERT_DATA
```

3. Set the secrets (project-level):

```bash
npx wrangler pages secret put BOT_TOKEN --project-name convert2gif
npx wrangler pages secret put POLL_SECRET --project-name convert2gif
npx wrangler pages secret put DISCORD_CLIENT_ID --project-name convert2gif
```

> API token + account ID via `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, or `wrangler login`.

4. Deploy:

```bash
npx wrangler pages deploy public --project-name convert2gif
```

5. Set the custom subdomain from the Cloudflare dashboard (Pages → convert2gif → Custom domains → `convert2gif.pages.dev`, already available by default as `<project>.pages.dev`).

6. Point an external cron (cron-job.org, EasyCron, etc.) at:

```
POST https://convert2gif.pages.dev/api/poll
Headers: x-poll-secret: <your POLL_SECRET>
```

Run every 15–30 seconds for near-real-time replies.

## Bot profile (icon, banner, bio)

```bash
$env:BOT_TOKEN = "your_discord_bot_token_here"
npm run setup-profile
```

This generates `assets/avatar.png` and `assets/banner.png`, then sets the avatar, banner, username (`Convert2GIF`), bio ("About Me"), and application description.

> If the bio/About Me field doesn't stick via the API, set it in the Discord Developer Portal under **App Settings → General → About Me**. The application description is also editable there.

## Discord app setup

- Client ID / Application ID: `<YOUR_APPLICATION_ID>`
- Add the bot to servers with the invite link on the homepage (permissions: Read Messages, Send Messages, Read Message History, Attach Files).
- Invite URL: `https://discord.com/oauth2/authorize?client_id=<YOUR_APPLICATION_ID>&scope=bot&permissions=35840`

## Env vars used

| Secret | Purpose |
| ------ | ------- |
| `BOT_TOKEN` | Discord bot token |
| `POLL_SECRET` | Required by `/api/poll` (`x-poll-secret` header) |
| `DISCORD_CLIENT_ID` | Bot application ID |

## Local dev

```bash
npx wrangler pages dev public --kv CONVERT_DATA=<namespace-id>
```