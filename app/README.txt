Convert2GIF - "/gif"-only self-hosted bot (v1.1.0)
==================================================

Run:      npm start   (or: node bot.js)   [Node.js >= 22]
Managed:  by Convert2GIF Terminal Bootstrapper (Convert2GIF-Bootstrap.exe)

Files
  bot.js         the slash command bot (registers + serves /gif)
  media.js       pure image -> GIF conversion core
  config.json    created by the bootstrapper (token + client id)
  control.json   presence control (online / idle / dnd / invisible)

Commands
  /gif <attachment or url:>   -> real static GIF file

Branding: "Hosted by https://convert2gif.pages.dev/" is shown in the reply
footer and bot activity. Keep it when forking.