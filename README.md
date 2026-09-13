# Convert2GIF

An **open-source** Discord bot that turns PNG/JPG/GIF images into **real static GIF files**.

**Hosted by [convert2gif.pages.dev](https://convert2gif.pages.dev/)**

![CI](https://github.com/justsadnyx-ux/convert2gif-source/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/license-MIT-brightgreen.svg)

- Plain Node.js ≥ 22 — no Discord library, no build step.
- Pure-JS conversion core (`gifenc`, `jpeg-js`, `omggif`, `upng-js`).
- Self-contained: config lives next to you (env-pointed folder), presence and stop controls are JSON files.

## Get it

Grab **Convert2GIF-v1.2.0-portable.zip** from the
[Releases](https://github.com/justsadnyx-ux/convert2gif-source/releases) page —
it's the bot + a small console bootstrapper in one portable folder. Double-click
`Convert2GIF.exe`; it installs dependencies, asks for your Discord token, hosts
the bot in the terminal, restarts it if it crashes, and can update itself from
GitHub.

Or run the bot from source (`app/`).

## Commands

| Command | Description |
| ------- | ----------- |
| `/gif` | Convert an attached image or `url:` to a real static GIF file |
| `/help` | List commands |
| `/info` | Version, presence, uptime, hosting |
| `/uptime` | How long the bot has been online |
| `/stats` | Conversions, boots, servers, uptime |
| `/presence` | Change presence (owner / Admin only) |
| `/restart` | Restart + repair deps (owner / Admin only) |
| `/update` | Update to latest release (owner / Admin only) |

## Run from source

```bash
npm install
mkdir -p ~/.convert2gif   # or %APPDATA%\Convert2GIF on Windows
node bot.js
```

The bot reads `config.json` from the folder pointed at by `CONVERT2GIF_USERDATA`
(defaults to `./data`):

Create the application and token in the [Discord Developer Portal](https://discord.com/developers/applications), then add the bot to a server (permissions: Read Messages, Send Messages, Read Message History, Attach Files). The bot registers its slash commands automatically on boot.

Optionally watched live (re-read every 4s) — `control.json`:

```json
{ "presence": "dnd" }
```

## Files

| Path | Purpose |
| ---- | ------- |
| `app/bot.js` | The slash-command bot (registers + serves the commands). |
| `app/media.js` | Pure image → GIF conversion core. |
| `app/package.json` | Dependencies. |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Keep the "Hosted by https://convert2gif.pages.dev/" branding visible in bot replies and activity when forking.