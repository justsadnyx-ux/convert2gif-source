// Convert2GIF — open-source Discord bot (plain Node.js >= 22).
// Commands: /gif (images -> real static GIF files), /help.
// Reads config.json; control.json can change presence or stop the bot (re-read
// every 4s). Hosted-by branding included.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageToGif, imgInfo, downloadAttachment, isSupportedImage } from './media.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOSTED_BY = 'https://convert2gif.pages.dev/';
const APP_VERSION = '1.3.0';

// Config/control live OUTSIDE this folder so they survive redeploys.
// Point CONVERT2GIF_USERDATA at wherever config.json lives (defaults to ./data).
const DATA_DIR = process.env.CONVERT2GIF_USERDATA || path.join(__dirname, 'data');
const CONFIG_PATH = process.env.CONVERT2GIF_CONFIG || path.join(DATA_DIR, 'config.json');
const CONTROL_PATH = process.env.CONVERT2GIF_CONTROL || path.join(DATA_DIR, 'control.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('config.json not found. Create it first (see app/README.txt).');
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  if (!cfg.token || !/^\d+$/.test(cfg.clientId || '')) {
    console.error('config.json is missing bot token or client id.');
    process.exit(1);
  }
  return cfg;
}

const config = loadConfig();
const API = 'https://discord.com/api/v10';

const GIF_COMMAND = {
  name: 'gif',
  description: 'Turn an image into a real static GIF file',
  options: [
    { type: 3, name: 'url', description: 'Image URL (png, jpg, gif)', required: false },
    { type: 11, name: 'image', description: 'Or attach an image', required: false },
  ],
};

const COMMANDS = [
  GIF_COMMAND,
  { name: 'help', description: 'See every command and how Convert2GIF works', options: [] },
];

async function api(url, opts = {}) {
  const res = await fetch(`${API}${url}`, {
    ...opts,
    headers: { Authorization: `Bot ${config.token}`, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} ${body.slice(0, 300)}`);
  }
  return res;
}

async function registerCommands() {
  const res = await api(`/applications/${config.clientId}/commands`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(COMMANDS),
  });
  if (!res.ok) throw new Error('register commands failed: ' + res.status);
  const list = await res.json();
  console.log(`[boot] registered ${list.length} command(s): ${COMMANDS.map((c) => '/' + c.name).join(' ')}`);
}

async function extractImage(inter) {
  const resolved = inter.data.resolved || {};
  for (const opt of inter.data.options || []) {
    if (opt.name === 'image' && opt.value) {
      const att = resolved.attachments && resolved.attachments[opt.value];
      if (att && isSupportedImage(att.filename)) {
        try { return { buffer: await downloadAttachment(att.url), filename: att.filename }; } catch { return null; }
      }
    }
    if (opt.name === 'url' && opt.value) {
      const url = String(opt.value).match(/https?:\/\/\S+\.(png|jpe?g|gif)/i);
      if (url) {
        try { return { buffer: await downloadAttachment(url[0]), filename: url[0].split('/').pop() || 'image.png' }; } catch { return null; }
      }
    }
  }
  for (const att of Object.values(resolved.attachments || {})) {
    if (isSupportedImage(att.filename)) {
      try { return { buffer: await downloadAttachment(att.url), filename: att.filename }; } catch { return null; }
    }
  }
  return null;
}

async function edit(inter, content, color = 0x2dd4bf) {
  await api(`/webhooks/${config.clientId}/${inter.token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [{ color, description: content }] }),
  }).catch(() => {});
}

async function reply(inter, embed) {
  await api(`/interactions/${inter.id}/${inter.token}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 4, data: { embeds: [embed] } }),
  }).catch(async () => edit(inter, 'Could not respond.', 0xff5577).catch(() => {}));
}

function helpEmbed() {
  return {
    color: 0x14b8a6,
    title: 'Convert2GIF commands',
    description: COMMANDS.map((c) => `**/${c.name}** — ${c.description}`).join('\n'),
    footer: { text: `Self-hosted · v${APP_VERSION} · Hosted by ${HOSTED_BY}` },
  };
}

async function runHelp(inter) { await reply(inter, helpEmbed()); }

async function runGif(inter) {
  await api(`/interactions/${inter.id}/${inter.token}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 5 }),
  }).catch(async () => edit(inter, 'Could not acknowledge the command.', 0xff5577).catch(() => {}));

  const img = await extractImage(inter);
  if (!img) return edit(inter, 'No image found. Attach a **png/jpg/gif** or pass a `url:` — images only.', 0xff5577);

  const t0 = Date.now();
  const gif = imageToGif(img.buffer, img.filename);
  if (!gif) return edit(inter, 'That file couldn\'t be converted (images only: PNG, JPG, GIF).', 0xff5577);

  const meta = imgInfo(img.buffer, img.filename);
  const form = new FormData();
  form.append('files[0]', new Blob([gif]), `user-${Date.now()}.gif`);
  form.append('payload_json', JSON.stringify({
    embeds: [{
      color: 0x2dd4bf,
      description: `**${meta.width}×${meta.height}** → GIF in ${Date.now() - t0}ms`,
      footer: { text: `Hosted by ${HOSTED_BY}` },
      author: inter.member && inter.member.user ? { name: inter.member.user.username } : undefined,
    }].filter((e) => e.author),
  }));
  await api(`/webhooks/${config.clientId}/${inter.token}/messages/@original`, {
    method: 'PATCH',
    body: form,
  }).catch(() => edit(inter, 'Conversion done but upload failed.', 0xff5577));
}

async function handleInteraction(inter) {
  if (inter.type === 1) {
    await api(`/interactions/${inter.id}/${inter.token}/callback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 1 }) }).catch(() => {});
    return;
  }
  if (inter.type !== 2 || !inter.data) return;
  const name = inter.data.name;
  try {
    if (name === 'gif') await runGif(inter);
    else if (name === 'help') await runHelp(inter);
  } catch (e) {
    console.log(`[interaction] ${name} failed: ${e.message}`);
    edit(inter, `Command **/${name}** ran into a problem. Check the logs.`, 0xff5577).catch(() => {});
  }
}

let ws = null;
let seq = null;
let sessionId = null;
let heartbeatTimer = null;
let missed = 0;
let currentPresence = 'online';
let presenceTimer = null;

function readControl() {
  try {
    if (!fs.existsSync(CONTROL_PATH)) return null;
    return JSON.parse(fs.readFileSync(CONTROL_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function readPresence() {
  const c = readControl();
  return c && typeof c.presence === 'string' ? c.presence : null;
}

function sendPresence(status) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    op: 3,
    d: { since: null, activities: [{ name: `Hosted by ${HOSTED_BY}`, type: 3 }], status, afk: status === 'idle' },
  }));
}

function watchPresence() {
  clearInterval(presenceTimer);
  presenceTimer = setInterval(() => {
    const c = readControl();
    if (c && c.stop) {
      log('stop requested via control.json');
      clearInterval(presenceTimer);
      process.exit(0);
    }
    const next = c && c.presence;
    if (next && next !== currentPresence && ['online', 'idle', 'dnd', 'invisible'].includes(next)) {
      currentPresence = next;
      sendPresence(currentPresence);
      console.log(`[boot] presence -> ${currentPresence}`);
    }
  }, 4000);
}

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

async function connect() {
  const { url } = await api('/gateway').then((r) => r.json());
  ws = new WebSocket(url);

  ws.onopen = () => {
    log('gateway connected');
    const d = {
      token: config.token,
      intents: 1, // GUILDS — enough to receive INTERACTION_CREATE
      properties: { os: 'windows', browser: 'convert2gif', device: 'convert2gif' },
    };
    if (sessionId) {
      d.session_id = sessionId;
      d.seq = seq;
      ws.send(JSON.stringify({ op: 6, d }));
    } else {
      ws.send(JSON.stringify({ op: 2, d }));
    }
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
      case 11: missed = 0; break;
      case 9:
        sessionId = null;
        connect();
        break;
      case 7:
        sessionId = null;
        connect();
        break;
      case 0:
        if (p.t === 'READY') {
          sessionId = p.d.session_id;
          log(`ready as ${p.d.user.username} — v${APP_VERSION} — Hosted by ${HOSTED_BY}`);
          currentPresence = readPresence() || 'online';
          sendPresence(currentPresence);
        } else if (p.t === 'RESUMED') {
          log('session resumed');
        } else if (p.t === 'INTERACTION_CREATE') {
          handleInteraction(p.d).catch((err) => log('interaction', err.message));
        }
        break;
    }
  };

  ws.onclose = () => {
    if (ws) {
      log('gateway closed — reconnect in 4s');
      setTimeout(connect, 4000);
    }
  };
  ws.onerror = () => ws && ws.close();
}

async function main() {
  log(`Convert2GIF v${APP_VERSION} — Hosted by ${HOSTED_BY}`);
  await registerCommands();
  watchPresence();
  await connect();
}

process.on('SIGINT', () => { clearInterval(presenceTimer); process.exit(0); });
process.on('SIGTERM', () => { clearInterval(presenceTimer); process.exit(0); });

main().catch((e) => {
  console.error('[boot] fatal:', e.message);
  process.exit(1);
});