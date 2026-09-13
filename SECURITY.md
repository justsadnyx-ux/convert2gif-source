# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| v1.3.x  | :white_check_mark: |
| v1.2.x  | :x:                |
| earlier | :x:                |

## Reporting a vulnerability

Do **not** open a public issue. Send a direct message to the repository owner
(report privately via the GitHub "Report a vulnerability" flow) containing:

- the affected version and file,
- a minimal reproduction,
- the impact.

You will get an acknowledgement within 72 hours and a fix/status update as
soon as practical.

## Secrets handling

- Never commit bot tokens, Cloudflare API tokens, or Discord IDs. IDs in this
  repo are scrubbed to `<YOUR_...>` placeholders on purpose.
- Rotate any token you think may have leaked. The config lives outside the app
  folder (`%APPDATA%\Convert2GIF\`) so updating never re-exposes it.
- The bootstrapper stores config **locally only** — it is never uploaded.