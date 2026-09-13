# Convert2GIF — Docker Hosting

Run the bot anywhere a container runs (VPS, NAS, homelab) with the exact same
`app/bot.js`. Config is mounted in — no config is baked into the image.

## Build & run

```bash
# 1. create a config dir and write your bot config
mkdir -p ./c2gdata
$env:CONVERT2GIF_USERDATA  # (not needed locally — we mount directly)
```

Write `config.json` into `./c2gdata`:

```json
{ "token": "your_discord_bot_token", "clientId": "1547681467176591400" }
```

Then:

```bash
docker compose up -d --build
```

## Check it

```bash
docker compose ps
docker logs -f convert2gif-bot
```

The container stores its control file in the same mounted volume, so you can
change presence without touching the image:

```bash
# control.json next to config.json
{ "presence": "dnd", "stop": false }
```

The bot picks it up within ~4 s.

## Why `/data`

- `CONVERT2GIF_USERDATA=/data` is the container default.
- The container runs as a non-root user (`c2g`) and only reads/writes `/data`.
- Host the websocket gateway in a container? The Discord Gateway is the only
  outbound connection; no inbound ports are required. `EXPOSE 39579` exists as a
  health port and is optional — leave the `ports:` mapping out if you prefer.

## Update the image

```bash
docker compose pull  # if you have an automatic build/registry
docker compose up -d --build
```

Config in `/data` survives rebuilds because it's a named volume.

## Notes

- Built from Node 22 alpine; the bot uses only `fetch` + `ws`-less raw
  WebSockets, so the image is small and has no Discord SDK.
- Don't put secrets in `compose.yml` — write them into the mounted `config.json`
  or inject `CONVERT2GIF_CONFIG`/`CONVERT2GIF_TOKEN` style env vars if you add
  support in `app/bot.js`.

## Next

- [Back to the full setup guide](SETUP.md)
- [Run standalone on Node without Docker](SELFHOST.md)