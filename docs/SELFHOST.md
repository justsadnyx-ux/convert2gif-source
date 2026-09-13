# Convert2GIF — Standalone Node Hosting

No bootstrapper, no Docker — just Node ≥ 22 on Linux/macOS/Windows.

## Run

```bash
git clone https://github.com/justsadnyx-ux/convert2gif-source
cd convert2gif-source/app
npm install --omit=dev

# config lives OUTSIDE the app folder (survives git pulls / redeploys)
mkdir -p "$HOME/.convert2gif"
# Windows: New-Item -ItemType Directory "$env:APPDATA\Convert2GIF"
cat > "$HOME/.convert2gif/config.json" <<'JSON'
{ "token": "your_discord_bot_token", "clientId": "1547681467176591400" }
JSON

CONVERT2GIF_USERDATA="$HOME/.convert2gif" npm start
```

Watch the console for `[boot] registered N command(s): /gif /help /info /uptime`
and the ready line.

## Control from the command line

By default `control.json` lives in the same data dir. To change presence or stop:

```bash
# change presence without restarting (picked up within ~4s)
printf '{ "presence": "dnd", "stop": false }' > "$HOME/.convert2gif/control.json"

# graceful stop
printf '{ "presence": "online", "stop": true }' > "$HOME/.convert2gif/control.json"
```

Point `CONVERT2GIF_CONTROL` elsewhere if you want it separate from config.

## Run it forever (Kaaz-style updating + rebooting automation, rewritten)

The desktop bootstrapper already gives you crash self-heal, first-run
provisioning, and one-click updates. On a bare Node host, recreate that with the
usual tools:

- **Auto-restart on crash** — `systemd` (`Restart=always`) or `pm2`:

  ```bash
  npm i -g pm2
  CONVERT2GIF_USERDATA="$HOME/.convert2gif" pm2 start bot.js --name convert2gif
  pm2 save && pm2 startup
  ```

- **Updates** — pull + redeploy on a timer:

  ```bash
  systemctl --user enable --now convert2gif-update.timer
  # or cron: git -C convert2gif-source pull && npm --prefix app install && systemctl restart convert2gif
  ```

## Troubleshooting

- `config.json not found` → `CONVERT2GIF_USERDATA` doesn't point at the folder holding `config.json`.
- `register commands failed: 401` → wrong token / revoked.
- Bot online but not responding → re-invite with the correct permissions (Attach Files).

## Next

- [Back to the full setup guide](SETUP.md)
- [Containerize this setup](DOCKER.md)