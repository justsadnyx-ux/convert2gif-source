// Convert2GIF v1.0.0 - open-source Discord bot (plain Node.js >= 22).
// Commands: /gif /help /info /uptime /stats /presence /restart /update.
// config/control/stats live in CONVERT2GIF_USERDATA (default ./data).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageToGif, imgInfo, downloadAttachment, isSupportedImage } from './media.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOSTED_BY = 'https://convert2gif.pages.dev/';
const APP_VERSION = '1.0.0';

const DATA_DIR = process.env.CONVERT2GIF_USERDATA || path.join(process.cwd(), 'data');
const CONFIG_PATH = process.env.CONVERT2GIF_CONFIG || path.join(DATA_DIR, 'config.json');
const CONTROL_PATH = process.env.CONVERT2GIF_CONTROL || path.join(DATA_DIR, 'control.json');
const STATS_PATH = path.join(DATA_DIR, 'stats.json');

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
const ADMIN_PERMISSION = 0x8n;

const PRESENCE_CHOICES = ['online', 'idle', 'dnd', 'invisible'].map((v) => ({ name: v, value: v }));

const COMMANDS = [
  {
    name: 'gif',
    description: 'Turn an image into a real static GIF file',
    options: [
      { type: 3, name: 'url', description: 'Image URL (png, jpg, gif)', required: false },
      { type: 11, name: 'image', description: 'Or attach an image', required: false },
    ],
  },
  { name: 'help', description: 'See every command and how Convert2GIF works', options: [] },
  { name: 'info', description: 'Version, presence, uptime and hosting info', options: [] },
  { name: 'uptime', description: 'How long the bot has been online', options: [] },
  { name: 'stats', description: 'Conversion count, boots, servers, uptime', options: [] },
  {
    name: 'presence',
    description: 'Change the bot presence (Admin or owner only)',
    options: [{ type: 3, name: 'status', description: 'Presence to use', required: true, choices: PRESENCE_CHOICES }],
  },
  { name: 'restart', description: 'Restart the bot + repair deps (Admin or owner only)', options: [] },
  { name: 'update', description: 'Update to the latest release (Admin or owner only)', options: [] },
];

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }
function writeJson(p, obj) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8'); }

function loadStats() { return readJson(STATS_PATH, {}); }
function saveStats(s) { writeJson(STATS_PATH, s); }
function bumpStats(prop) { const s = loadStats(); s[prop] = (s[prop] || 0) + 1; saveStats(s); }
function getControl() { return readJson(CONTROL_PATH, { presence: 'online', stop: false, request: {} }); }
function writeControl(patch) { const c = getControl(); writeJson(CONTROL_PATH, { ...c, ...patch, at: Date.now() }); }

let bootedAt = Date.now();
let guildCount = 0;
let currentPresence = (getControl().presence) || 'online';

function uptimeString() {
  const s = Math.floor((Date.now() - bootedAt) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const parts = [];
  if (d) parts.push(d + 'd');
  if (h || parts.length) parts.push(h + 'h');
  if (m || parts.length) parts.push(m + 'm');
  parts.push(sec + 's');
  return parts.join(' ');
}

function callerId(inter) { return (inter.member && inter.member.user && inter.member.user.id) || (inter.user && inter.user.id) || null; }
function isManager(inter) {
  const id = callerId(inter);
  if (!id) return false;
  const owners = String(config.ownerIds || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (owners.includes(id)) return true;
  const perm = inter.member && inter.member.permissions;
  try { return (BigInt(perm || 0) & ADMIN_PERMISSION) === ADMIN_PERMISSION; } catch { return false; }
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

function embedColor() { return 0x14b8a6; }

async function runGif(inter) {
  await api(`/interactions/${inter.id}/${inter.token}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 5 }),
  }).catch(async () => edit(inter, 'Could not acknowledge the command.', 0xff5577).catch(() => {}));

  const img = await extractImage(inter);
  if (!img) return edit(inter, 'No image found. Attach a **png/jpg/gif** or pass a `url:` - images only.', 0xff5577);

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
  }).then(() => bumpStats('conversions'))
    .catch(() => edit(inter, 'Conversion done but upload failed.', 0xff5577));
}

async function runHelp(inter) {
  await reply(inter, {
    color: embedColor(),
    title: 'Convert2GIF commands',
    description: 'Ayo, here\'s everything I can do:\n\n' + COMMANDS.map((c) => `**/${c.name}** — ${c.description}`).join('\n'),
    footer: { text: `Self-hosted · v${APP_VERSION} · Hosted by ${HOSTED_BY}` },
  });
}

async function runInfo(inter) {
  await reply(inter, {
    color: embedColor(),
    title: 'Convert2GIF',
    description: 'Real talk: open-source Discord bot that turns images into real static GIF files. No cap.',
    fields: [
      { name: 'Version', value: APP_VERSION, inline: true },
      { name: 'Presence', value: currentPresence, inline: true },
      { name: 'Uptime', value: uptimeString(), inline: true },
      { name: 'Hosted by', value: HOSTED_BY, inline: true },
    ],
    footer: { text: `Hosted by ${HOSTED_BY}` },
  });
}

async function runUptime(inter) {
  await reply(inter, {
    color: embedColor(),
    title: 'Uptime',
    description: `We been up **${uptimeString()}** since <t:${Math.floor(bootedAt / 1000)}:R>.`,
    footer: { text: `Hosted by ${HOSTED_BY}` },
  });
}

async function runStats(inter) {
  const s = loadStats();
  await reply(inter, {
    color: embedColor(),
    title: 'Stats',
    description: 'The numbers, real quick:',
    fields: [
      { name: 'GIF conversions', value: String(s.conversions || 0), inline: true },
      { name: 'Boots', value: String(s.boots || 0), inline: true },
      { name: 'Servers', value: String(guildCount || s.servers || 0), inline: true },
      { name: 'Uptime', value: uptimeString(), inline: true },
      { name: 'Version', value: APP_VERSION, inline: true },
    ],
    footer: { text: `Hosted by ${HOSTED_BY}` },
  });
}

async function deny(inter) {
  await reply(inter, {
    color: 0xff5577,
    title: 'Permission denied',
    description: 'Nah - that one is for the owner or the admins only.',
  });
}

async function runPresence(inter) {
  if (!isManager(inter)) return deny(inter);
  const o = (inter.data.options || []).find((x) => x.name === 'status');
  const status = o && PRESENCE_CHOICES.some((c) => c.value === o.value) ? o.value : 'online';
  writeControl({ presence: status });
  currentPresence = status;
  sendPresence(status);
  await reply(inter, {
    color: embedColor(),
    title: 'Presence',
    description: `Bet. Bot status set to **${status}**.`,
    footer: { text: `Hosted by ${HOSTED_BY}` },
  });
}

async function runRestart(inter) {
  if (!isManager(inter)) return deny(inter);
  writeControl({ request: { restart: true, update: false } });
  await reply(inter, {
    color: embedColor(),
    title: 'Restart',
    description: 'Aight, restartin\' now. Deps get fixed too. Back in a few seconds.',
    footer: { text: `Hosted by ${HOSTED_BY}` },
  });
}

async function runUpdate(inter) {
  if (!isManager(inter)) return deny(inter);
  writeControl({ request: { restart: false, update: true } });
  await reply(inter, {
    color: embedColor(),
    title: 'Update',
    description: 'Say less - update on the way. The bootstrapper pulls the latest release while the bot goes offline for a sec.',
    footer: { text: `Hosted by ${HOSTED_BY}` },
  });
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
    else if (name === 'restart') await runRestart(inter);
    else if (name === 'update') await runUpdate(inter);
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
let presenceTimer = null;

function readControl() {
  try {
    if (!fs.existsSync(CONTROL_PATH)) return null;
    return JSON.parse(fs.readFileSync(CONTROL_PATH, 'utf8'));
  } catch { return null; }
}

function sendPresence(status) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    op: 3,
    d: { since: null, activities: [{ name: `Hosted by ${HOSTED_BY}`, type: 3 }], status, afk: status === 'idle' },
  }));
}

function watchControl() {
  clearInterval(presenceTimer);
  presenceTimer = setInterval(() => {
    const c = readControl();
    if (!c) return;
    if (c.stop) {
      console.log('[control] stop requested - exiting');
      clearInterval(presenceTimer);
      process.exit(0);
    }
    if (c.presence && c.presence !== currentPresence && ['online', 'idle', 'dnd', 'invisible'].includes(c.presence)) {
      currentPresence = c.presence;
      sendPresence(currentPresence);
      console.log(`[control] presence -> ${currentPresence}`);
    }
  }, 3000);
}

async function connect() {
  const { url } = await api('/gateway').then((r) => r.json());
  ws = new WebSocket(url);

  ws.onopen = () => {
    const d = {
      token: config.token,
      intents: 1,
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
          const st = loadStats();
          saveStats({ ...st, servers: guildCount });
          currentPresence = (readControl() || {}).presence || currentPresence;
          sendPresence(currentPresence);
          console.log(`ready as ${p.d.user.username} - v${APP_VERSION} - ${guildCount} server(s) - we in the building`);
        } else if (p.t === 'RESUMED') {
          console.log('session resumed');
        } else if (p.t === 'GUILD_CREATE') {
          guildCount++;
          const st = loadStats();
          saveStats({ ...st, servers: guildCount });
        } else if (p.t === 'GUILD_DELETE') {
          guildCount = Math.max(0, guildCount - 1);
          const st = loadStats();
          saveStats({ ...st, servers: guildCount });
        } else if (p.t === 'INTERACTION_CREATE') {
          handleInteraction(p.d).catch((err) => console.log('interaction', err.message));
        }
        break;
    }
  };

  ws.onclose = () => {
    if (ws) {
      console.log('gateway closed - reconnect in 4s');
      setTimeout(connect, 4000);
    }
  };
  ws.onerror = () => ws && ws.close();
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const st = loadStats();
  saveStats({ ...st, boots: (st.boots || 0) + 1, startedAt: Date.now() });
  console.log(`Convert2GIF v${APP_VERSION} - we up. Hosted by ${HOSTED_BY}`);
  await registerCommands();
  watchControl();
  await connect();
}

process.on('SIGINT', () => { clearInterval(presenceTimer); process.exit(0); });
process.on('SIGTERM', () => { clearInterval(presenceTimer); process.exit(0); });

main().catch((e) => {
  console.error('[boot] fatal:', e.message);
  process.exit(1);
});