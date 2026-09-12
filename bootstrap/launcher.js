// Convert2GIF — Terminal Bootstrapper (Windows)
// A self-updating launcher that installs Node + dependencies, configures and
// runs the "/gif"-only bot, manages its presence, and can update itself.
//
// Build:  bun build --compile --minify bootstrap/launcher.js --outfile Convert2GIF-Bootstrap.exe

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_VERSION = '1.1.0';
const REPO = 'justsadnyx-ux/convert2gif-source';
const HOSTED_BY = 'https://convert2gif.pages.dev/';
const API_BASE = 'https://api.github.com';
const EXE_DIR = path.dirname(process.execPath);
const APP_DIR = path.join(EXE_DIR, 'convert2gif-app');
const META_PATH = path.join(APP_DIR, '.meta.json');
const CONFIG_PATH = path.join(APP_DIR, 'config.json');
const CONTROL_PATH = path.join(APP_DIR, 'control.json');
const LOG_DIR = path.join(APP_DIR, 'logs');
const BOT_LOG = path.join(LOG_DIR, 'bot.log');
const UPDATE_DIR = path.join(APP_DIR, '.update');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  grey: '\x1b[90m',
  teal: '\x1b[96m',
  green: '\x1b[92m',
  yellow: '\x1b[93m',
  red: '\x1b[91m',
  white: '\x1b[97m',
  rv: '\x1b[7m',
};

const PRESENCES = [
  { key: 'online', label: 'Online' },
  { key: 'idle', label: 'Away' },
  { key: 'dnd', label: 'Do Not Disturb' },
  { key: 'invisible', label: 'Invisible' },
];

// ---------- state ----------
let sel = 0;
let mode = 'menu'; // menu | presence | logs
let botProc = null;
let botState = 'stopped'; // stopped | starting | running | stopping
let botLogBuf = [];
let logScroll = 0;
let flashText = null;
let flashTimer = null;

// ---------- fs helpers ----------
function ensureDirs() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(UPDATE_DIR, { recursive: true });
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function readMeta() {
  return readJson(META_PATH) || {};
}
function writeMeta(m) {
  writeJson(META_PATH, { ...readMeta(), ...m });
}

function appProvisioned() {
  return fs.existsSync(path.join(APP_DIR, 'bot.js')) && fs.existsSync(path.join(APP_DIR, 'media.js'));
}

// ---------- exec helpers ----------
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 120000, ...opts });
  return r;
}

function nodeVersion() {
  const which = process.platform === 'win32' ? 'node.exe' : 'node';
  const r = spawnSync(which, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (r.error || r.status !== 0) return null;
  const m = (r.stdout || '').trim().match(/^v(\d+)\./);
  return m ? parseInt(m[1], 10) : null;
}

function findNodeExe() {
  const candidates = ['node.exe', 'C:\\Program Files\\nodejs\\node.exe', 'C:\\Program Files (x86)\\nodejs\\node.exe'];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  const r = spawnSync('where', ['node'], { encoding: 'utf8', windowsHide: true });
  if (r.status === 0 && r.stdout) return r.stdout.trim().split(/\r?\n/)[0];
  return 'node';
}

// ---------- GitHub ----------
async function ghApi(pathname) {
  const res = await fetch(`${API_BASE}/repos/${REPO}${pathname}`, { headers: { 'User-Agent': 'convert2gif-bootstrap' } });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

function parseVersion(tag) {
  const m = String(tag).replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? { raw: String(tag), major: +m[1], minor: +m[2], patch: +m[3] } : null;
}

function isNewer(a, b) {
  if (!b) return true;
  if (!a) return false;
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch > b.patch;
}

async function latestRelease() {
  return await ghApi('/releases/latest');
}

async function findAsset(release, namePart) {
  const assets = release.assets || [];
  return assets.find((a) => a.name.includes(namePart)) || null;
}

async function downloadFile(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'convert2gif-bootstrap' } });
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

// ---------- provisioning ----------
async function ensureNode(interactive = false) {
  const ver = nodeVersion();
  if (ver && ver >= 22) return { ok: true, version: ver, installed: false };
  if (!interactive) return { ok: false, reason: 'Node.js >= 22 is required', version: ver };

  while (true) {
    clearScreen();
    print(`\n  ${c.bold}${c.white}Install Node.js${c.reset}\n`);
    print(`  Node.js version 22 or newer is required but ${ver ? `v${ver}` : 'not found'}.\n`);
    print(`  ${c.teal}[1]${c.reset} Auto-install with winget (recommended)\n`);
    print(`  ${c.teal}[2]${c.reset} Download Node.js LTS (MSI) and install silently\n`);
    print(`  ${c.teal}[3]${c.reset} Skip (I will install it myself)\n`);
    const k = await readKey();
    if (k === '1' || k === '2') {
      if (k === '1') {
        print(`\n  Running winget install OpenJS.NodeJS.LTS ...\n`);
        const r = run('winget', ['install', '--id', 'OpenJS.NodeJS.LTS', '--silent', '--accept-package-agreements', '--accept-source-agreements']);
        print(`  winget exited with code ${r.status}\n`);
      } else {
        print(`\n  Resolving latest LTS from nodejs.org ...\n`);
        try {
          const idx = await (await fetch('https://nodejs.org/dist/index.json')).json();
          const lts = idx.find((v) => v.lts) || idx[0];
          const base = lts.version.replace(/^v/, '');
          const url = `https://nodejs.org/dist/v${base}/node-v${base}-x64.msi`;
          const dest = path.join(os.tmpdir(), `node-v${base}-x64.msi`);
          print(`  Downloading ${base} (~30 MB) ...\n`);
          await downloadFile(url, dest);
          print(`  Installing silently (msiexec /qn) ...\n`);
          const r = run('msiexec', ['/i', dest, '/qn', '/norestart']);
          print(`  Installer exited with code ${r.status}\n`);
        } catch (e) {
          print(`  ${c.red}Install failed: ${e.message}${c.reset}\n`);
        }
      }
      await sleep(1500);
      const next = nodeVersion();
      if (next && next >= 22) {
        print(`  ${c.green}[OK] Node.js v${next} found.${c.reset}\n`);
        await pressAnyKey();
        return { ok: true, version: next, installed: true };
      }
      print(`  ${c.yellow}Node.js was not detected yet. Check the installation and retry.${c.reset}\n`);
      await pressAnyKey();
    } else {
      return { ok: false };
    }
    break;
  }
}

function npmInstall(appDir) {
  const args = process.platform === 'win32' ? ['/c', 'npm', 'install', '--no-audit', '--no-fund'] : ['npm', 'install', '--no-audit', '--no-fund'];
  const r = run('cmd', args, { cwd: appDir });
  return r.status === 0;
}

async function provisionApp(force = false) {
  ensureDirs();
  if (appProvisioned() && !force) return { ok: true, fresh: false };

  clearScreen();
  print(`\n  ${c.bold}${c.white}Setting up the bot workspace${c.reset}\n\n`);
  const rel = await latestRelease();
  const asset = await findAsset(rel, 'convert2gif-app');
  if (!asset) throw new Error('app package not found in latest release');

  print(`  Downloading app package v${parseVersion(rel.tag_name).raw} ...\n`);
  const zipDest = path.join(UPDATE_DIR, 'convert2gif-app.zip');
  await downloadFile(asset.browser_download_url, zipDest);

  print(`  Extracting into ${path.basename(APP_DIR)} ...\n`);
  if (force && fs.existsSync(APP_DIR)) {
    for (const f of fs.readdirSync(APP_DIR)) {
      if (f !== 'logs' && f !== '.update') fs.rmSync(path.join(APP_DIR, f), { recursive: true, force: true });
    }
  }
  fs.mkdirSync(APP_DIR, { recursive: true });
  const ps = run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipDest}' -DestinationPath '${APP_DIR}' -Force`]);
  if (ps.status !== 0) {
    const tar = run('tar', ['-xf', zipDest, '-C', APP_DIR]);
    if (tar.status !== 0) throw new Error('could not extract app package');
  }

  print(`  Installing dependencies (npm install) ...\n`);
  if (!npmInstall(APP_DIR)) {
    print(`  ${c.yellow}npm install reported an error; the bot may still work.${c.reset}\n`);
  }
  writeMeta({ appVersion: APP_VERSION, installedApp: parseVersion(rel.tag_name).raw, provisionedAt: Date.now() });
  return { ok: true, fresh: true };
}

// ---------- config wizard ----------
async function configWizard() {
  clearScreen();
  print(`\n  ${c.bold}${c.white}Bot configuration${c.reset}\n`);
  print(`  Enter the credentials for the Discord application you created.\n`);
  print(`  (Developer Portal -> Applications -> your app -> Bot / General Info)\n\n`);

  const token = await askLine(`${c.teal}Bot token${c.reset}: `);
  if (!token) return false;

  print(`  Checking token ... `);
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${token}` } });
    if (!res.ok) {
      print(`${c.red}[FAIL] HTTP ${res.status}${c.reset}\n\n`);
      await pressAnyKey();
      return false;
    }
    const me = await res.json();
    print(`${c.green}[OK] ${me.username}${c.reset}\n`);
  } catch (e) {
    print(`${c.red}[FAIL] ${e.message}${c.reset}\n\n`);
    await pressAnyKey();
    return false;
  }

  let clientId = '';
  while (!/^\d+$/.test(clientId)) {
    clientId = (await askLine(`${c.teal}Application / Client ID${c.reset}: `)).trim();
    if (!clientId) return false;
  }

  writeJson(CONFIG_PATH, { token, clientId, updatedAt: Date.now() });
  writeJson(CONTROL_PATH, { presence: 'online', stop: false });
  clearScreen();
  print(`\n  ${c.green}[OK] Configuration saved.${c.reset}\n\n`);
  await pressAnyKey();
  return true;
}

// ---------- bot manager ----------
function writeControl(patch) {
  const cur = readJson(CONTROL_PATH) || {};
  writeJson(CONTROL_PATH, { ...cur, ...patch });
}

function startBot() {
  if (botProc && botState === 'running') return;
  if (!appProvisioned() || !fs.existsSync(CONFIG_PATH)) {
    flash('Not configured yet. Run "Edit configuration" first.');
    return;
  }
  const node = findNodeExe();
  fs.writeFileSync(BOT_LOG, '');
  botLogBuf = [];
  logScroll = 0;
  writeControl({ stop: false, presence: (readJson(CONTROL_PATH) || {}).presence || 'online' });
  botState = 'starting';
  botProc = spawn(node, ['bot.js'], { cwd: APP_DIR, windowsHide: false, env: { ...process.env } });
  botProc.stdout.on('data', onBotData);
  botProc.stderr.on('data', onBotData);
  botProc.on('exit', (code) => {
    botState = 'stopped';
    onBotData(Buffer.from(`\n[process exited with code ${code}]\n`));
    botProc = null;
  });
  botState = 'running';
}

function onBotData(chunk) {
  const text = chunk.toString();
  const lines = text.split(/\r?\n/);
  for (const l of lines) if (l) botLogBuf.push(l);
  fs.appendFileSync(BOT_LOG, text);
  if (botLogBuf.length > 2000) botLogBuf = botLogBuf.slice(-2000);
}

function stopBot() {
  if (!botProc) return;
  botState = 'stopping';
  writeControl({ stop: true });
  const pid = botProc.pid;
  const deadline = Date.now() + 8000;
  const poll = setInterval(() => {
    if (!botProc) {
      clearInterval(poll);
      writeControl({ stop: false });
      botState = 'stopped';
      return;
    }
    if (Date.now() > deadline) {
      clearInterval(poll);
      try {
        spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true });
      } catch { /* noop */ }
      writeControl({ stop: false });
      botState = 'stopped';
    }
  }, 300);
}

function setPresence(key) {
  if (!appProvisioned()) return;
  writeControl({ presence: key, stop: false });
  if (!botProc) {
    writeMeta({ presence: key });
    flash(`Presence set to ${key}. Start the bot to apply it.`);
  } else {
    flash(`Presence -> ${key}`);
  }
}

// ---------- updates ----------
async function checkUpdates(auto = false) {
  try {
    const rel = await latestRelease();
    const latest = parseVersion(rel.tag_name);
    const cur = parseVersion(APP_VERSION);
    if (!isNewer(latest, cur)) {
      flash(`You're on the latest version (${APP_VERSION}).`);
      return;
    }
    clearScreen();
    print(`\n  ${c.bold}${c.white}Update available${c.reset}\n\n`);
    print(`  Current:  ${c.grey}${APP_VERSION}${c.reset}\n`);
    print(`  Latest:   ${c.teal}${latest.raw}${c.reset}\n\n`);
    print(`  ${c.teal}[1]${c.reset} Download and install\n`);
    print(`  ${c.teal}[2]${c.reset} Skip for now\n`);
    const k = auto ? '1' : await readKey();
    if (k !== '1') return;

    const appAsset = await findAsset(rel, 'convert2gif-app');
    const exeAsset = await findAsset(rel, 'Convert2GIF-Bootstrap');

    print(`\n  Downloading app package ...\n`);
    if (appAsset) {
      const zipDest = path.join(UPDATE_DIR, 'convert2gif-app.zip');
      await downloadFile(appAsset.browser_download_url, zipDest);
      const ps = run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipDest}' -DestinationPath '${APP_DIR}' -Force`]);
      if (ps.status !== 0 && !fs.existsSync(path.join(APP_DIR, 'bot.js'))) throw new Error('app extract failed');
      print(`  Updating dependencies ...\n`);
      npmInstall(APP_DIR);
      writeMeta({ installedApp: latest.raw, appVersion: APP_VERSION });
    }

    if (exeAsset && process.platform === 'win32') {
      print(`  Downloading new bootstrapper ...\n`);
      const newExe = path.join(UPDATE_DIR, path.basename(exeAsset.browser_download_url));
      await downloadFile(exeAsset.browser_download_url, newExe);
      const self = process.execPath;
      const script = [
        'Start-Sleep -Seconds 2',
        `$src = '${newExe.replace(/'/g, "''")}'`,
        `$dst = '${self.replace(/'/g, "''")}'`,
        'try { Copy-Item -LiteralPath $src -Destination $dst -Force; Start-Process -FilePath $dst } catch { }',
      ].join('; ');
      print(`  Swapping bootstrapper ... restart upcoming.\n`);
      spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], { detached: true, stdio: 'ignore' }).unref();
      await sleep(300);
      process.exit(0);
    }
    print(`\n  ${c.green}[OK] Update installed.${c.reset}\n\n`);
    await pressAnyKey();
  } catch (e) {
    flash(`Update check failed: ${e.message}`);
  }
}

// ---------- logs ----------
function viewLogs() {
  mode = 'logs';
  logScroll = 0;
}

// ---------- ui ----------
function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function print(s) {
  process.stdout.write(s);
}

function flash(t) {
  flashText = t;
  render();
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashText = null;
    render();
  }, 3500);
}

function render() {
  const cols = process.stdout.columns || 100;
  const rows = process.stdout.rows || 30;
  const w = Math.max(40, Math.min(cols, 120));
  const W = (t) => String(t).padEnd(w);

  const title = '[ Convert2GIF - Terminal Bootstrapper ]';
  const bar = '\x1b[2m' + '='.repeat(w) + '\x1b[0m';
  const sub = `${c.grey}${c.bold}${title}${c.reset}  ${c.dim}v${APP_VERSION}${c.reset}`;

  const lines = [];
  lines.push(sub);
  lines.push(bar);

  if (mode === 'presence') {
    lines.push('');
    lines.push(`  ${c.bold}${c.white}Set bot presence${c.reset}`);
    lines.push('');
    PRESENCES.forEach((p, i) => {
      const cur = (readJson(CONTROL_PATH) || {}).presence;
      const mark = cur === p.key ? ' *' : '';
      lines.push((i === sel ? `${c.rv} ` : '  ') + ` ${i + 1}. ${p.label}${mark}` + (i === sel ? ` ${c.reset}` : ''));
    });
    lines.push('');
    lines.push(`  ${c.dim}Arrows/1-4 select, Enter apply, Esc back${c.reset}`);
  } else if (mode === 'logs') {
    const head = `s  ${c.grey}v${c.reset} ${c.bold}${c.white}Bot log${c.reset} ${c.dim}(${botState})${c.reset}`;
    lines.push(head);
    lines.push(bar);
    const visible = Math.max(5, rows - 8);
    const total = botLogBuf.length;
    let start = Math.max(0, total - visible - logScroll);
    if (start > Math.max(0, total - visible)) start = Math.max(0, total - visible);
    const slice = botLogBuf.slice(start, start + visible);
    for (const line of slice) lines.push(line.slice(0, w));
    for (let i = slice.length; i < visible; i++) lines.push('');
    lines.push(bar);
    lines.push(`  ${c.dim}Up/Down scroll, q back${c.reset}`);
  } else {
    // menu
    const meta = readMeta();
    const cfg = readJson(CONFIG_PATH);
    const nodeV = nodeVersion();
    lines.push('');
    lines.push(`  ${c.bold}${c.white}Status${c.reset}`);
    lines.push(`  ${c.dim}Bot app:${c.reset}      ${appProvisioned() ? c.green + 'installed' : c.red + 'missing'}${c.reset}  ${c.dim}(${meta.installedApp || '-'})${c.reset}`);
    lines.push(`  ${c.dim}Node.js:${c.reset}       ${nodeV ? c.green + 'v' + nodeV : c.red + 'not found'}${c.reset}`);
    lines.push(`  ${c.dim}Bot process:${c.reset}   ${botState === 'running' ? c.green + 'running' : botState === 'stopping' ? c.yellow + 'stopping' : c.grey + 'stopped'}${c.reset}`);
    lines.push(`  ${c.dim}Presence:${c.reset}      ${(readJson(CONTROL_PATH) || {}).presence || '-'}${c.reset}`);
    lines.push(`  ${c.dim}Configured:${c.reset}    ${cfg ? c.green + 'yes' : c.red + 'no'}${c.reset}`);
    lines.push('');
    lines.push(`  ${c.bold}${c.white}Actions${c.reset}`);
    const ACTIONS = ['Start bot', 'Stop bot', 'Change presence', 'Edit configuration', 'Check for updates', 'Install / repair Node.js', 'View bot log', 'Re-download app package', 'Exit'];
    ACTIONS.forEach((a, i) => {
      const mark = i === 0 ? ` ${c.green}${botState === 'running' ? '>>' : ' >'}${c.reset}` : i === sel ? ` ${c.teal}->${c.reset}` : '   ';
      lines.push(` ${mark} ${i + 1}. ${a}`);
    });
    lines.push('');
    lines.push(`  ${c.dim}Up/Down/1-9 navigate, Enter select, Esc exit${c.reset}`);
  }

  if (flashText && flashTimer) {
    lines.push(c.yellow + flashText + c.reset);
  }

  // compose
  const out = '\x1b[2J\x1b[H' + lines.map((l) => W(l)).join('\r\n') + '\r\n';
  print(out);
}

function refresh() {
  render();
}

// ---------- input ----------
function hasRaw() {
  return typeof process.stdin.setRawMode === 'function' && !!process.stdin.isTTY;
}

function readKey() {
  if (!hasRaw()) {
    return new Promise((resolve) => {
      process.stdin.resume();
      const onData = (d) => {
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        resolve(String(d).trim() || '\r');
      };
      process.stdin.on('data', onData);
    });
  }
  return new Promise((resolve, reject) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const buf = [];
    const handler = (chunk) => {
      for (const b of chunk) {
        buf.push(b);
        const s = Buffer.from(buf);
        if (s.toString() === '\u001b') continue;
        if (s.toString() === '\u001b[') continue;
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', handler);
        resolve(s.toString());
        return;
      }
    };
    process.stdin.on('data', handler);
    process.stdin.on('error', reject);
  });
}

async function askLine(prompt) {
  print(prompt);
  return await new Promise((resolve) => {
    process.stdin.setRawMode(false);
    process.stdin.resume();
    let acc = '';
    const onData = (chunk) => {
      const s = chunk.toString('utf8');
      for (const ch of s) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          print('\n');
          resolve(acc);
          return;
        }
        if (ch === '\u007f' || ch === '\b' || ch === '\u0008') {
          if (acc.length) { acc = acc.slice(0, -1); print('\b \b'); }
        } else if (ch >= ' ' && ch !== '\u001b') {
          acc += ch;
          print(ch);
        }
      }
    };
    process.stdin.on('data', onData);
  });
}

async function pressAnyKey() {
  print(`  Press any key to continue ...`);
  await readKey();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- boot ----------
async function boot() {
  ensureDirs();
  await ensureNode(true);

  try {
    if (!appProvisioned()) {
      await provisionApp();
    }
  } catch (e) {
    clearScreen();
    print(`\n  ${c.red}Setup failed: ${e.message}${c.reset}\n`);
    print(`  You can retry from the menu ("Re-download app package").\n\n`);
    await pressAnyKey();
  }

  render();
  while (true) {
    const k = await readKey();
    if (mode === 'menu') {
      const mask = /^[1-9]$/;
      let idx = null;
      if (mask.test(k)) idx = parseInt(k, 10) - 1;
      else if (k === '\u001b[B' || k === 'j') idx = (sel + 1) % 9;
      else if (k === '\u001b[A' || k === 'k') idx = (sel + 8) % 9;
      if (idx !== null) { sel = idx; render(); continue; }
      if (k === '\u001b' || k === 'q') { break; }
      if (k === '\r' || k === '\n') {
        switch (sel) {
          case 0: startBot(); break;
          case 1: stopBot(); break;
          case 2: mode = 'presence'; sel = 0; break;
          case 3: await configWizard(); break;
          case 4: await checkUpdates(); break;
          case 5: await ensureNode(true); break;
          case 6: viewLogs(); break;
          case 7:
            await provisionApp(true);
            break;
          case 8: process.exit(0);
        }
        render();
      }
    } else if (mode === 'presence') {
      if (k === '\u001b' || k === 'q') { mode = 'menu'; render(); continue; }
      if (/^[1-4]$/.test(k)) setPresence(PRESENCES[+k - 1].key);
      else if (k === '\r' || k === '\n') setPresence(PRESENCES[sel].key);
      else if (k === '\u001b[B') sel = (sel + 1) % PRESENCES.length;
      else if (k === '\u001b[A') sel = (sel + 3) % PRESENCES.length;
      mode = 'menu';
      render();
    } else if (mode === 'logs') {
      if (k === 'q' || k === 'Q' || k === '\u001b') { mode = 'menu'; render(); continue; }
      if (k === '\u001b[B') logScroll = Math.max(0, logScroll - 1);
      if (k === '\u001b[A') logScroll += 1;
      render();
    }
  }

  try { if (hasRaw()) process.stdin.setRawMode(false); } catch { /* noop */ }
  process.stdin.pause();
  if (botProc && botState === 'running') stopBot();
  clearScreen();
  print(`\n  Thanks for using Convert2GIF Terminal Bootstrapper v${APP_VERSION}\n`);
  print(`  Hosted by ${HOSTED_BY}\n\n`);
  process.exit(0);
}

boot().catch(async (e) => {
  try { if (hasRaw()) process.stdin.setRawMode(false); } catch { /* noop */ }
  clearScreen();
  print(`\n  ${c.red}Unexpected error: ${e.message}${c.reset}\n`);
  print('  Press any key to exit ...');
  try { await readKey(); } catch { /* noop */ }
  process.exit(1);
});