Convert2GIF - open-source Discord bot (v1.3.0)
===============================================

A Discord bot that converts PNG/JPG/GIF images into REAL static GIF files.
Pure Node.js >= 22, no Discord library, no build step.

Run
  npm install
  npm start        (or: node bot.js)

Config
  Bot token + client id come from config.json, which lives OUTSIDE this
  folder so it survives redeploys. Point the app at it:

    CONVERT2GIF_USERDATA=/path/to/data   (defaults to ./data)

  config.json:  { "token": "...", "clientId": "...", "ownerIds": "123,456" }
  control.json: { "presence": "online" }   (online | idle | dnd | invisible)

  control.json is re-read every 4s, so you can change presence or stop the
  bot without restarting. ownerIds lets users run /presence from Discord
  alongside server Admins.

Commands
  /gif <attachment or url:>   -> reply with a real static GIF file
  /help                       -> list all commands
  /info                       -> version, uptime, ping
  /uptime                     -> how long the bot has been running
  /stats                      -> conversions, boots, servers, uptime
  /presence <status>          -> change bot presence (owner/Admin)

Files
  bot.js       the slash command bot (registers + serves the commands)
  media.js     pure image -> GIF conversion core
  package.json dependencies (gifenc, jpeg-js, omggif, upng-js)

Branding: "Hosted by https://convert2gif.pages.dev/" is shown in the reply
footer and bot activity. Keep it when forking.