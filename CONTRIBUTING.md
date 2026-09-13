# Contributing

Thanks for helping with Convert2GIF. Please keep these rules short and
enforced: **no secrets, no noise.**

## Ground rules

- Keep the "Hosted by https://convert2gif.pages.dev/" branding in bot replies
  and activity when you fork or release.
- Never commit real tokens, Cloudflare API tokens, or Discord/telegram IDs.
  Use `<YOUR_...>` placeholders.
- Match the existing style (no semicolons, tabs, minimal comments).

## Setup

```
git clone https://github.com/justsadnyx-ux/convert2gif-source.git
cd convert2gif-source
bun install
```

## Build

Windows desktop bootstrapper (native GUI + engine):

```
powershell -ExecutionPolicy Bypass -File gui/build.ps1
# outputs dist/convert2gif-bootstrap-v1.3.0-win.zip + app zip
```

Manual checks before submitting:

```
bun build bootstrap/launcher.js --outdir /tmp/ci   # bundler + syntax gate
node --check app/bot.js
```

## Releasing

Only maintainers release. When you do:

1. Bump `APP_VERSION` in `bootstrap/launcher.js` and `app/bot.js` (same for
   the packaged app version).
2. Run `gui/build.ps1`.
3. Sanitize-scan the tree for secrets.
4. Upload assets to a properly numbered GitHub release. Let users extract both
   exe files to the same folder.

## Design notes

- The engine (`bootstrap/launcher.js`) is a Bun-compiled background process. It
  provisions Node + the bot into `%APPDATA%\Convert2GIF\`, self-heals, and
  serves a tiny JSON control API on `127.0.0.1:45579-45589`.
- The GUI (`gui/MainForm.cs`, C# WinForms) is the visible desktop window. It
  spawns/disovers the engine and drives it over HTTP. It never opens a browser.
- Async rule: the engine must never block the event loop on `npm install`
  (it must keep answering its control API while provisioning).