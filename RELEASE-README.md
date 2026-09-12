# Convert2GIF — Open Source Release

Everything that runs **convert2gif.pages.dev** and its Discord bot, plus a tiny
`/gif`-only self-hosted edition and a terminal launcher (`.exe`).

**Hosted by convert2gif.pages.dev** — if you fork or self-host a copy of this
project, please keep the "Hosted by convert2gif.pages.dev" branding intact.

---

## What's in the box

| Path | What it is |
| ---- | ---------- |
| `public/` | The website (home, web converter, terms, privacy) |
| `functions/` | Cloudflare Pages Functions — Discord interaction server, web converter API, stats, poll forwarding, **`/source` redirect** |
| `functions/_lib/slash.js` | All 16 slash commands, verification, moderation, logging |
| `functions/api/poll.js` | Rate-limited web-converter endpoint |
| `functions/_lib/media.js` | Pure image → GIF conversion core (PNG/JPG/GIF decode, GIF encode, NSFW rasterize) — **Node-compatible** |
| `poller/` | The Discord Gateway worker (poll-based; sees/edits/deletes messages, reactions, logs, moderation) |
| `selfhost/index.js` | **`/gif`-only self-hosted bot** — plain Node.js, no Workers needed |
| `scripts/` | Command registration + avatar/banner/profile generators |
| `wrangler.toml` | Pages config + KV + Workers AI binding |

---

## Option A — Run the full bot (Cloudflare Pages)

Requires a Cloudflare account, a Discord application, and ~15 minutes.

1. **Edit the placeholders.** Search the repo for `<YOUR_...>` and fill in:

   | Placeholder | Fill with |
   | ----------- | --------- |
   | `<YOUR_APPLICATION_ID>` | Your Discord application / client ID |
   | `<YOUR_SERVER_ID>` | Your Discord server (guild) ID |
   | `<YOUR_INFO_CHANNEL_ID>` | Announcements channel |
   | `<YOUR_MODLOG_CHANNEL_ID>` | Moderation / abuse-log channel |
   | `<YOUR_DISCORD_USER_ID>` | Your own user ID (owner-only commands) |
   | `<YOUR_VERIFIED_ROLE_ID>` | The "Verified" role for access control |
   | `<YOUR_UNVERIFIED_ROLE_ID>` | The "Unverified" role |
   | `<YOUR_INVITE_URL>` / `<YOUR_INVITE_CODE>` | Your server invite |
   | `<YOUR_KV_NAMESPACE_ID>` | KV namespace created via `wrangler kv namespace create CONVERT_DATA` |

2. Follow the full guide in [`README.md`](README.md) — secrets, deploy, cron poll.

---

## Option B — Self-host the `/gif`-only bot (plain Node)

No Cloudflare, no Workers. Just a normal Node >= 22 process that registers and
serves the single `/gif` slash command.

```bash
npm install
$env:BOT_TOKEN = "<your_discord_bot_token_here>"
$env:DISCORD_CLIENT_ID = "<your_application_id>"
node selfhost/index.js
```

- Registers `/gif` (image attachment or `url:`) and converts to a static GIF.
- Shows **"Hosted by convert2gif.pages.dev"** in the reply footer and activity.
- No server features, no moderation, no membership gating.

---

## Terminal launcher (`.exe`)

A terminal-themed launcher that asks for your bot token + client ID and boots
the `/gif`-only bot with the "Hosted by" branding. Source lives in
`app/` at the project root of the release package.

---

## Nice things to know

- The download page `/source?code=<long-random-code>` redirects here.
- The GIF encoder only produces **static** GIFs from still images (by design).
- Everything is dependency-light: `gifenc`, `jpeg-js`, `upng-js`, `omggif`.
- The poller worker needs the `CONVERT_DATA` KV binding and `POLL_SECRET` to talk to `/api/poll`.