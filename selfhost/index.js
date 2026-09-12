// Convert2GIF — "/gif"-only self-hosted bot (plain Node.js, no Workers required)
//
// Run from the repo root:
//   $env:BOT_TOKEN = "<your_discord_bot_token_here>"
//   $env:DISCORD_CLIENT_ID = "<your_application_id>"
//   npm install
//   node selfhost/index.js
//
// Registers the `/gif` command and serves it — nothing else.
// "Hosted by" branding is included. No server features, no moderation, no slash-server.

import { imageToGif, imgInfo, downloadAttachment, isSupportedImage } from '../functions/_lib/media.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || '';
const HOSTED_BY = process.env.HOSTED_BY || 'https://convert2gif.pages.dev/';

if (!BOT_TOKEN) {
  console.error('Set BOT_TOKEN env var and run again.');
  process.exit(1);
}
if (!CLIENT_ID) {
  console.error('Set DISCORD_CLIENT_ID env var (your bot application id).');
  process.exit(1);
}

const API = 'https://discord.com/api/v10';
const GIF_COMMAND = {
  name: 'gif',
  description: 'Turn an image into a real static GIF file',
  options: [
    { type: 3, name: 'url', description: 'Image URL (png, jpg, gif)', required: false },
    { type: 11, name: 'image', description: 'Or attach an image', required: false },
  ],
};

async function api(url, opts = {}) {
  const res = await fetch(`${API}${url}`, {
    ...opts,
    headers: { Authorization: `Bot ${BOT_TOKEN}`, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} ${body.slice(0, 300)}`);
  }
  return res;
}

async function registerCommands() {
  const res = await api(`/applications/${CLIENT_ID}/commands`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([GIF_COMMAND]),
  });
  if (!res.ok) throw new Error('register commands failed: ' + res.status);
  const list = await res.json();
  console.log(`Registered ${list.length} command(s): /gif`);
}

async function extractImage(inter) {
  const data = inter.data || {};
  const resolved = inter.data.resolved || {};

  for (const opt of data.options || []) {
    if (opt.name === 'image' && opt.value) {
      const att = resolved.attachments && resolved.attachments[opt.value];
      if (att && isSupportedImage(att.filename)) {
        try {
          return { buffer: await downloadAttachment(att.url), filename: att.filename };
        } catch {
          return null;
        }
      }
    }
    if (opt.name === 'url' && opt.value) {
      const url = String(opt.value).match(/https?:\/\/\S+\.(png|jpe?g|gif)/i);
      if (url) {
        try {
          return { buffer: await downloadAttachment(url[0]), filename: url[0].split('/').pop() || 'image.png' };
        } catch {
          return null;
        }
      }
    }
  }

  // attachments present but no option declared against them
  for (const att of Object.values(resolved.attachments || {})) {
    if (isSupportedImage(att.filename)) {
      try {
        return { buffer: await downloadAttachment(att.url), filename: att.filename };
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function reply(inter, content) {
  await api(`/interactions/${inter.id}/${inter.token}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 4, data: { content, flags: 64 } }),
  }).catch(() => {});
}

async function runGif(inter) {
  // acknowledge
  await api(`/interactions/${inter.id}/${inter.token}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 5 }),
  }).catch(async () => {
    await reply(inter, '⚠️ Could not acknowledge the command.');
    return;
  });

  const img = await extractImage(inter);
  if (!img) {
    await edit(inter, '❌ No image found. Attach a **png/jpg/gif** or pass a `url:` — images only.', 0xff5577);
    return;
  }

  const t0 = Date.now();
  const gif = imageToGif(img.buffer, img.filename);
  if (!gif) {
    await edit(inter, '⚠️ That file couldn\'t be converted (images only: PNG, JPG, GIF).', 0xff5577);
    return;
  }

  const meta = imgInfo(img.buffer, img.filename);
  const form = new FormData();
  form.append(
    'files[0]',
    new Blob([gif]),
    `${inter.member ? inter.member.user.username : 'user'}-${Date.now()}.gif`
  );
  form.append(
    'payload_json',
    JSON.stringify({
      embeds: [
        {
          color: 0x2dd4bf,
          description: `**${meta.width}×${meta.height}** → GIF in ${Date.now() - t0}ms`,
          footer: { text: `Hosted by ${HOSTED_BY}` },
        },
      ],
    })
  );
  await api(`/webhooks/${CLIENT_ID}/${inter.token}/messages/@original`, {
    method: 'PATCH',
    body: form,
  }).catch(async () => {
    await edit(inter, '⚠️ Conversion done but the upload failed. Try again.', 0xff5577);
  });
}

async function edit(inter, content, color = 0x2dd4bf) {
  await api(`/webhooks/${CLIENT_ID}/${inter.token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [{ color, description: content }] }),
  }).catch(() => {});
}

async function handleInteraction(inter) {
  if (inter.type === 1) {
    await api(`/interactions/${inter.id}/${inter.token}/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 1 }),
    }).catch(() => {});
    return;
  }
  if (inter.type === 2 && inter.data && inter.data.name === 'gif') {
    await runGif(inter);
  }
}

// ---- Gateway ----
let ws = null;
let seq = null;
let sessionId = null;
let heartbeatTimer = null;
let missed = 0;

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

async function connect() {
  const { url } = await api('/gateway').then((r) => r.json());
  ws = new WebSocket(url);

  ws.onopen = () => {
    log('connected to gateway');
    ws.send(JSON.stringify({
      op: 2,
      d: {
        token: BOT_TOKEN,
        intents: 1, // GUILDS — enough to receive INTERACTION_CREATE
        properties: { os: 'windows', browser: 'convert2gif', device: 'convert2gif' },
      },
    }));
  };

  ws.onmessage = (e) => {
    const raw = typeof e.data === 'string' ? e.data : e.data.toString();
    const p = JSON.parse(raw);
    if (p.s) seq = p.s;
    switch (p.op) {
      case 10:
        missed = 0;
        clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          ws.send(JSON.stringify({ op: 1, d: seq }));
          if (++missed > 3) ws.close();
        }, p.d.heartbeat_interval);
        break;
      case 11:
        missed = 0;
        break;
      case 9:
        sessionId = null;
        connect();
        break;
      case 0:
        if (p.t === 'READY') {
          sessionId = p.d.session_id;
          log(`ready as ${p.d.user.username} — Hosted by ${HOSTED_BY}`);
          ws.send(JSON.stringify({
            op: 3,
            d: { since: null, activities: [{ name: `Hosted by ${HOSTED_BY}`, type: 3 }], status: 'online', afk: false },
          }));
        } else if (p.t === 'INTERACTION_CREATE') {
          handleInteraction(p.d).catch((err) => log('interaction error', err.message));
        }
        break;
    }
  };

  ws.onclose = () => {
    if (ws) {
      log('connection closed — reconnecting in 4s');
      setTimeout(connect, 4000);
    }
  };
  ws.onerror = () => ws && ws.close();
}

async function main() {
  log('Convert2GIF "/gif"-only self-hosted bot');
  log(`Hosted by ${HOSTED_BY}`);
  await registerCommands();
  await connect();
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});