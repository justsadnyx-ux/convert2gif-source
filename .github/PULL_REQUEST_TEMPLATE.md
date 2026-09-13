Thanks for the PR.

## Checklist

- [ ] No secrets: no real tokens, Cloudflare API tokens, or Discord IDs. Use `<YOUR_...>` placeholders.
- [ ] `bun build bootstrap/launcher.js --outdir /tmp/ci` passes (bundler/syntax gate).
- [ ] `node --check app/bot.js` passes.
- [ ] Style matches the existing code (tabs, minimal comments, no semicolons).

## What does this change?

Describe the change and why. If it touches the engine, confirm that the
control API stays responsive while provisioning (no blocking `npm install`).