# Convert2GIF — Open Source Release

Everything behind **convert2gif.pages.dev** plus a fully local, no-cloud stack:

- a **bootstrapper** (`.exe`) with a real browser-based control panel;
- a **`/gif`-only self-hosted bot**;
- an **Android app (BETA)** to control it from your phone;
- the Cloudflare Pages website + Gateway poller for the original hosted bot.

**Hosted by convert2gif.pages.dev** — please keep the branding when forking.

## Releases (versioned properly)

| Tag | Contents |
| --- | -------- |
| `v1.2.0` | `Convert2GIF-Bootstrap.exe` (GUI bootstrapper), `convert2gif-app-v1.2.0.zip` (bot package), `Convert2GIF-Mobile-BETA.apk` (Android BETA) |
| `v1.1.0` | `Convert2GIF-Bootstrap.exe` + app package (previous bootstrapper) |
| `v1.0.0` | `Convert2GIF-Terminal.exe` (original terminal launcher) |

## What's in each release version

### v1.2.0 (current)
- **New GUI bootstrapper**: control panel opens in the browser (dark UI, presence control, live log, set-up/launch animations and audio cues). No terminal.
- **Config survives updates**: settings live in `%APPDATA%\Convert2GIF\`, outside the app folder (which is stored per-version under `%APPDATA%\Convert2GIF\app\v<version>`).
- **Self-healing**: if the bot crashes on startup (missing packages, broken files) it reinstalls dependencies or re-pulls a clean app automatically.
- **Self-updating**: fetches new bootstrapper and app releases; your config is untouched.
- **Mobile BETA**: control the bootstrapper from a phone on the same Wi-Fi (panel is a PWA), plus a standalone Android APK.
- Full source for bootstrapper (`bootstrap/`), bot (`app/`), Android app (`android/`).

### v1.1.0
- Terminal bootstrapper with presence control and self-update; app config stored beside the exe.

### v1.0.0
- Original terminal launcher for the `/gif`-only bot.

## How the bootstrapper works

1. On first run it provisions: installs/checks Node.js, downloads the app zip from the latest release, extracts it to `%APPDATA%\Convert2GIF\app\v<version>\`, runs `npm install`. 
2. You enter a bot token and application id in the panel once — stored as `%APPDATA%\Convert2GIF\config.json`.
3. Start/stop the bot, switch presence, watch the live log, or update.
4. On a newer release the app is installed into a new versioned folder and the pointer is switched — **no config re-entry**.

## APK (BETA) build

`android/build-apk.ps1` builds the signed APK with the Android SDK directly (no Gradle):

```
powershell -ExecutionPolicy Bypass -File android/build-apk.ps1
```

Requires build-tools 34.0.0, platform android-34, and JDK 17 — outputs `android/Convert2GIF-Mobile-BETA.apk`.

## The site

`https://convert2gif.pages.dev/` redirects here (this page + Releases are the source of truth).
Terms / privacy / discord remain reachable, and `/source?code=<code>` redirects to the repository.