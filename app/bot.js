// Convert2GIF — "/gif"-only self-hosted bot (plain Node.js >= 22).
// Reads config.json, watches control.json for
// presence changes, registers/serves /gif. Hosted-by branding included.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { imageToGif, imgInfo, downloadAttachment, isSupportedImage } from './media.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOSTED_BY = 'https://convert2gif.pages.dev/';
const APP_VERSION = '1.3.0';

// Config/control live OUTSIDE the app folder (in %APPDATA%\Convert2GIF) so they
// The folder can be pointed at with CONVERT2GIF_USERDATA.
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
  { name: 'info', description: 'Bot status: version, uptime, ping, hosting', options: [] },
  { name: 'uptime', description: 'How long this bot has been running', options: [] },
  { name: 'stats', description: 'GIF conversion count, boots, servers, uptime', options: [] },
  { name: 'presence', description: 'Change bot presence (online, idle, dnd, invisible)', options: [
    { type: 3, name: 'status', description: 'New status', required: true, choices: [
      { name: 'Online', value: 'online' },
      { name: 'Idle', value: 'idle' },
      { name: 'Do Not Disturb', value: 'dnd' },
      { name: 'Invisible', value: 'invisible' },
    ] },
  ] },
];
const bootedAt = Date.now();

const STATS_PATH = path.join(DATA_DIR, 'stats.json');

function loadStats() {
  try { return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')); } catch { return { conversions: 0, boots: 0 }; }
}
function saveStats(s) { try { fs.writeFileSync(STATS_PATH, JSON.stringify(s, null, 2)); } catch { /* noop */ } }
const stats = loadStats();
function bumpStats(key) { stats[key] = (stats[key] || 0) + 1; saveStats(stats); }

function writeControl(patch) {
  const cur = readControl() || { presence: 'online' };
  const next = { ...cur, ...patch, at: Date.now() };
  try { fs.writeFileSync(CONTROL_PATH, JSON.stringify(next, null, 2)); } catch { /* noop */ }
  return next;
}

const ownerList = Array.isArray(config.ownerIds)
  ? config.ownerIds.map(String)
  : String(config.ownerIds || '').split(',').map((s) => s.trim()).filter(Boolean);
const OWNERS = new Set(ownerList);

function callerId(inter) {
  return String(inter.user ? inter.user.id : (inter.member && inter.member.user ? inter.member.user.id : ''));
}

function isManager(inter) {
  if (OWNERS.size && OWNERS.has(callerId(inter))) return true;
  const perms = inter.member ? String(inter.member.permissions || '0') : '0';
  try { return (BigInt(perms) & 8n) === 8n; } catch { return false; }
}

function interOpts(inter) {
  return Object.fromEntries((inter.data.options || []).map((o) => [o.name, o.value]));
}

function uptimeString() {
  const secs = Math.floor((Date.now() - bootedAt) / 1000);
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

function snowflakeAge(id) {
  const ts = Number(id) > 0 ? (Number(id) >> 22) + 1420070400000 : 0;
  return ts > 0 ? Math.max(0, Date.now() - ts) : 0;
}

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
  const data = inter.data || {};
  const resolved = inter.data.resolved || {};
  for (const opt of data.options || []) {
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

function infoEmbed(inter) {
  return {
    color: 0x14b8a6,
    title: 'Convert2GIF',
    description: 'Open-source image → real static GIF bot, self-hosted by you on your own machine.',
    fields: [
      { name: 'Version', value: APP_VERSION, inline: true },
      { name: 'Uptime', value: uptimeString(), inline: true },
      { name: 'Gateway ping', value: `${snowflakeAge(inter.id)}ms`, inline: true },
      { name: 'Commands', value: `${COMMANDS.length}`, inline: true },
      { name: 'Hosting', value: 'Open source — self-hosted Node', inline: true },
    ],
    footer: { text: `Hosted by ${HOSTED_BY}` },
  };
}

async function runHelp(inter) { await reply(inter, helpEmbed()); }
async function runInfo(inter) { await reply(inter, infoEmbed(inter)); }
async function runUptime(inter) { await reply(inter, { color: 0x14b8a6, title: 'Uptime', description: `Online for ${uptimeString()}`, footer: { text: `v${APP_VERSION} · Hosted by ${HOSTED_BY}` } }); }

function deny(inter) { return reply(inter, { color: 0xff5577, title: 'Denied', description: 'Only the bot owner or a server Admin can use this command.' }); }

async function runStats(inter) {
  const s = loadStats();
  await reply(inter, {
    color: 0x14b8a6,
    title: 'Convert2GIF stats',
    fields: [
      { name: 'GIFs converted', value: String(s.conversions), inline: true },
      { name: 'Boots', value: String(s.boots), inline: true },
      { name: 'Servers', value: String(guildCount), inline: true },
      { name: 'Uptime', value: uptimeString(), inline: true },
      { name: 'Version', value: APP_VERSION, inline: true },
    ],
    footer: { text: `Hosted by ${HOSTED_BY}` },
  });
}

async function runPresence(inter) {
  if (!isManager(inter)) return deny(inter);
  const o = interOpts(inter);
  const status = ['online', 'idle', 'dnd', 'invisible'].includes(o.status) ? o.status : 'online';
  writeControl({ presence: status, stop: false });
  currentPresence = status;
  sendPresence(status);
  await reply(inter, { color: 0x14b8a6, title: 'Presence', description: `Bot status set to **${status}**.`, footer: { text: `Hosted by ${HOSTED_BY}` } });
}

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
  try {
    await api(`/webhooks/${config.clientId}/${inter.token}/messages/@original`, {
      method: 'PATCH',
      body: form,
    });
    bumpStats('conversions');
  } catch {
    edit(inter, 'Conversion done but upload failed.', 0xff5577);
  }
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
    else if (name === 'info') await runInfo(inter);
    else if (name === 'uptime') await runUptime(inter);
    else if (name === 'stats') await runStats(inter);
    else if (name === 'presence') await runPresence(inter);
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
let guildCount = 0;

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
          guildCount = (p.d.guilds || []).length;
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
  log(`Convert2GIF /gif-only bot v${APP_VERSION} — Hosted by ${HOSTED_BY}`);
  stats.boots += 1;
  saveStats(stats);
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