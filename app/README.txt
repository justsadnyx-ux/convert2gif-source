Convert2GIF - open-source Discord bot (v1.0.0)
=============================================

A Discord bot that converts PNG/JPG/GIF images into REAL static GIF files.
Pure Node.js >= 22, no Discord library, no build step.

Two ways to run
  - Single-file app: grab Convert2GIF.exe from the Releases page. Double-click.
    It has the bot built in, installs the deps, asks for your token +
    Application ID, hosts the bot, self-heals crashes and can update itself
    from GitHub. Everything stays inside the folder (portable).
  - From source:
      npm install
      npm start        (or: node bot.js)

Config
  The bot reads config.json from CONVERT2GIF_USERDATA (defaults to ./data):

  config.json:  { "token": "...", "clientId": "...", "ownerIds": "optional IDs" }

  control.json (re-read every 3s by the bot, and by the bootstrapper):
  { "presence": "online" }            (online | idle | dnd | invisible)
  { "stop": true }                    (graceful stop)
  { "request": { "restart": true } }  (bootstrapper restarts the bot)
  { "request": { "update": true } }   (bootstrapper updates from GitHub)

  stats.json records conversions / boots / servers.

Commands
  /gif      attach or url: image -> real static GIF file
  /help     list commands
  /info     version, presence, uptime, hosting
  /uptime   online time
  /stats    conversions, boots, servers, uptime
  /presence set presence (owner or Admin only)
  /restart  restart + repair deps (owner or Admin only)
  /update   update to latest release (owner or Admin only)

Files
  bot.js       slash command bot (registers all commands on boot)
  media.js     pure image -> GIF conversion core
  package.json dependencies (gifenc, jpeg-js, omggif, upng-js)

The ./bootstrap folder holds the single-file terminal bootstrapper
(launcher.js) that hosts this app; build it with bootstrap/build.ps1.

Branding: "Hosted by https://convert2gif.pages.dev/" is shown in the reply
footer and bot activity. Keep it when forking.