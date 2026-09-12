Convert2GIF - "/gif"-only self-hosted bot (v1.2.0)
==================================================

Run:      managed by Convert2GIF Bootstrap (Convert2GIF-Bootstrap.exe)
          (manual:  node bot.js   [Node.js >= 22])

Config is stored OUTSIDE this folder (in %APPDATA%\Convert2GIF\config.json)
so it SURVIVES app updates — you only enter your token once.

Files
  bot.js       the slash command bot (registers + serves /gif)
  media.js     pure image -> GIF conversion core
  package.json dependencies (gifenc, jpeg-js, omggif, upng-js)

Commands
  /gif <attachment or url:>   -> real static GIF file

Presence / stop control happens through control.json (watched every 4s),
managed by the bootstrapper UI.

Branding: "Hosted by https://convert2gif.pages.dev/" is shown in the reply
footer and bot activity. Keep it when forking.