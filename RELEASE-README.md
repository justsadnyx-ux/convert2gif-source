# Convert2GIF — Open Source Release

Everything behind **convert2gif.pages.dev** plus a fully local, no-cloud stack:

- a **Windows desktop bootstrapper** with a real native GUI window (no browser, no terminal);
- a **`/gif`-only self-hosted bot**;
- the Cloudflare Pages website + Gateway poller for the original hosted bot.

**Hosted by convert2gif.pages.dev** — please keep the branding when forking.

## Releases (versioned properly)

| Tag | Contents |
| --- | -------- |
| `v1.3.0` | `convert2gif-bootstrap-v1.3.0-win.zip` (native GUI + engine), `convert2gif-app-v1.3.0.zip` (bot package) |
| `v1.2.0` | `Convert2GIF-Bootstrap.exe` (browser-panel GUI bootstrapper), `convert2gif-app-v1.2.0.zip`, `Convert2GIF-Mobile-BETA.apk` |
| `v1.1.0` | `Convert2GIF-Bootstrap.exe` + app package (previous bootstrapper) |
| `v1.0.0` | `Convert2GIF-Terminal.exe` (original terminal launcher) |

## What's in each release version

### v1.3.0 (current)
- **Native desktop window** — the bootstrapper is a real Windows app: config, start/stop, presence, live log, check/install updates, repair, open data folder — all in one window. No browser opens, no terminal.
- **Tray support** — closing the window keeps the bot online; reopen from the tray. Quit fully from the tray menu or the button in the app.
- **Config survives updates**: settings live in `%APPDATA%\Convert2GIF\`, outside the app folder (which is stored per-version under `%APPDATA%\Convert2GIF\app\v<version>`).
- **Self-healing**: if the bot crashes on startup (missing packages, broken files) it reinstalls dependencies or re-pulls a clean app automatically.
- **Self-updating**: installs the new app package, launches the new build, and the new build deletes the old files — your config is untouched.
- Non-blocking engine: the host serves its control API even while provisioning, so the UI stays responsive on first run.
- Full source for the GUI (`gui/`), engine (`bootstrap/`), and bot (`app/`).

### v1.2.0
- Browser-based GUI bootstrapper; config persisted in `%APPDATA%`; self-heal + self-update; Android BETA APK.

### v1.1.0
- Terminal bootstrapper with presence control and self-update; app config stored beside the exe.

### v1.0.0
- Original terminal launcher for the `/gif`-only bot.

## How the bootstrapper works

1. On first run the engine provisions: installs/checks Node.js, downloads the app zip from the latest release, extracts it to `%APPDATA%\Convert2GIF\app\v<version>\`, runs `npm install`.
2. Enter a bot token and application id in the window once — stored as `%APPDATA%\Convert2GIF\config.json`.
3. Start/stop the bot, switch presence, watch the live log, or update.
4. On a newer release the app is installed into a new versioned folder and the pointer is switched — **no config re-entry**.

## Building the Windows bootstrapper

```
bun install
powershell -ExecutionPolicy Bypass -File gui/build.ps1
# -> dist/convert2gif-bootstrap-v1.3.0-win.zip (+ app zip)
```

The zip ships two files side by side:
- `Convert2GIF-Bootstrap.exe` — the native control-panel window (C# WinForms).
- `c2g-host.exe` — the engine (Bun): provisioning, node install, self-heal, updates, local JSON API.

Users must extract **both** to the same folder and run `Convert2GIF-Bootstrap.exe`.

## The site

`https://convert2gif.pages.dev/` redirects here (this page + Releases are the source of truth).
Terms / privacy / discord remain reachable, and `/source?code=<code>` redirects to the repository.