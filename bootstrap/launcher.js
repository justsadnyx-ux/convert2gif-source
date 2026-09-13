// Convert2GIF Bootstrapper v1.2.0 - portable terminal engine.
// Pure Node.js (>= 18, fetches + readline): finds/installs Node, provisions
// the app folder, hosts bot.js, self-heals crashes, live-updates from GitHub
// releases. Shipped as a single console .exe via bun --compile.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync, readdirSync, statSync, renameSync, copyFileSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const APP_VERSION = '1.2.0';
const REPO = 'justsadnyx-ux/convert2gif-source';
const HOSTED_BY = 'https://convert2gif.pages.dev/';
const GITHUB_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const EXE_ASSET = 'Convert2GIF.exe';
const APP_ASSET_PREFIX = 'convert2gif-app';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXE_DIR = path.dirname(process.execPath);

const runningFromSource = /node(\.exe)?$/.test(path.basename(process.execPath));
const baseDir = (() => {
  if (process.env.CONVERT2GIF_PORTABLE_DIR) return process.env.CONVERT2GIF_PORTABLE_DIR;
  if (runningFromSource) return path.resolve(HERE, '..');
  try {
    const probe = path.join(EXE_DIR, `.wtest-${Date.now()}`);
    writeFileSync(probe, 'ok');
    rmSync(probe, { force: true });
    return EXE_DIR;
  } catch {
    return path.join(os.homedir(), 'AppData', 'Roaming', 'Convert2GIF');
  }
})();

const USERDATA = process.env.CONVERT2GIF_USERDATA || path.join(baseDir, 'data');
const APPS_DIR = process.env.CONVERT2GIF_APPS || path.join(baseDir, 'app');
const CONFIG_PATH = path.join(USERDATA, 'config.json');
const CONTROL_PATH = path.join(USERDATA, 'control.json');
const STATE_PATH = path.join(USERDATA, 'state.json');
const LOG_DIR = path.join(USERDATA, 'logs');
const ENGINE_LOG = path.join(LOG_DIR, 'engine.log');
const UPDATES_DIR = path.join(USERDATA, 'updates');
const NEXT_EXE = path.join(UPDATES_DIR, EXE_ASSET);
const PRESENCE_ORDER = ['online', 'idle', 'dnd', 'invisible'];

let botProc = null;
let botState = 'stopped';
let manualStop = false;
let busy = false;
let healCount = 0;
let crashSessions = 0;
let lastCrash = 0;
let rl = null;
let menuMsg = '';
let postUpdateOld = null;

function ensureDirs() {
  for (const d of [USERDATA, LOG_DIR, UPDATES_DIR]) mkdirSync(d, { recursive: true });
}

function readJson(p, fb) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } }
function writeJson(p, obj) { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8'); }
function getConfig() { return readJson(CONFIG_PATH, {}); }
function saveConfig(c) { writeJson(CONFIG_PATH, c); }
function getControl() { return readJson(CONTROL_PATH, { presence: 'online', stop: false, request: {} }); }
function saveControl(patch) { const c = getControl(); writeJson(CONTROL_PATH, { ...c, ...patch, at: Date.now() }); }
function loadState() { return readJson(STATE_PATH, {}); }
function saveState(s) { writeJson(STATE_PATH, s); }

function run(cmd, args, opts = {}) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout || 300000, windowsHide: true, ...opts });
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
  } catch (e) {
    return { status: -1, stdout: '', stderr: String(e), error: e };
  }
}

function logLine(txt) {
  const ts = new Date().toISOString();
  const line = `[${ts.slice(11, 19)}] ${txt}`;
  console.log(line);
  try { appendFileSync(ENGINE_LOG, line + '\n', 'utf8'); } catch { /* noop */ }
}

function setMenu(msg) { menuMsg = msg; }

function findNodeExe() {
  const ok = (p) => { if (!p || !existsSync(p)) return null; return nodeVersion(p) >= 22 ? p : null; };
  if (process.env.CONVERT2GIF_NODE) { const p = ok(process.env.CONVERT2GIF_NODE); if (p) return p; }
  const p0 = ok(path.join(baseDir, 'node', 'node.exe'));
  if (p0) return p0;
  if (process.platform === 'win32') {
    const r = run('where', ['node']);
    if (r.status === 0) {
      for (const raw of String(r.stdout).split(/\r?\n/)) {
        const cand = raw.trim();
        if (!cand || /WindowsApps/i.test(cand)) continue;
        const p = ok(cand); if (p) return p;
      }
    }
    for (const c of [
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe') : null,
      path.join(process.env.APPDATA || '', '..', '..', 'Local', 'Programs', 'nodejs', 'node.exe'),
      'C:\\Program Files (x86)\\nodejs\\node.exe',
    ]) { const p = ok(c); if (p) return p; }
  }
  return null;
}

function nodeVersion(exe) {
  const r = run(exe, ['-v']);
  if (r.status !== 0) return 0;
  const m = String(r.stdout).trim().match(/^v?(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function ensureNode() {
  const exe = findNodeExe();
  if (exe) return { ok: true, exe };
  logLine('No Node.js 22+ around. You need it to run this - get it via winget.');
  if (process.stdin.isTTY) {
    const y = askLine('Want me to install Node.js LTS with winget? [Y/n] ').toLowerCase();
    if (y === '' || y === 'y' || y === 'yes') {
      logLine('Installing Node.js LTS via winget - give it a minute...');
      const r = run('winget', ['install', '--id', 'OpenJS.NodeJS.LTS', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'], { timeout: 900000 });
      const exe2 = findNodeExe();
      if (exe2) { logLine('Node installed: ' + exe2); return { ok: true, exe: exe2 }; }
      logLine('winget came up short (code ' + r.status + '). Grab Node LTS from https://nodejs.org');
    }
  }
  return { ok: false, exe: null };
}

function parseVersion(tag) {
  const m = String(tag).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return [0, 0, 0];
  return [+m[1], +m[2], +m[3]];
}
function isNewer(a, b) {
  const A = parseVersion(a); const B = parseVersion(b);
  for (let i = 0; i < 3; i++) { if (A[i] > B[i]) return true; if (A[i] < B[i]) return false; }
  return false;
}

async function latestRelease() {
  try {
    const res = await fetch(GITHUB_LATEST, { headers: { 'User-Agent': 'Convert2GIF-Bootstrap' } });
    if (!res.ok) return null;
    const j = await res.json();
    const assets = (j.assets || []).map((a) => ({
      name: a.name, url: a.browser_download_url,
      digest: (a.digest || '').replace(/^sha256:/i, '') || null,
    }));
    return { tag: j.tag_name, appZip: assets.find((a) => a.name.startsWith(APP_ASSET_PREFIX)) || null, exe: assets.find((a) => a.name === EXE_ASSET) || null };
  } catch { return null; }
}

async function download(url, dest, onProg) {
  mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error('download HTTP ' + res.status);
  const total = Number(res.headers.get('content-length') || 0);
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  let lastPct = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    got += value.length;
    if (onProg && total) {
      const pct = Math.round((got / total) * 100);
      if (pct - lastPct >= 10) { lastPct = pct; logLine('  ' + pct + '%'); }
    }
  }
  writeFileSync(dest, Buffer.concat(chunks));
}

function sha256File(p) { return createHash('sha256').update(readFileSync(p)).digest('hex'); }

function extractZip(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  const r = run('tar', ['-xf', zipPath, '-C', destDir]);
  if (r.status === 0) return true;
  const r2 = run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`], { timeout: 180000 });
  return r2.status === 0;
}

function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const from = path.join(src, entry);
    const to = path.join(dst, entry);
    if (statSync(from).isDirectory()) copyDir(from, to);
    else copyFileSync(from, to);
  }
}

function npmInstall(appDir) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const p = spawn(isWin ? 'cmd' : 'npm', isWin ? ['/c', 'npm', 'install', '--no-audit', '--no-fund'] : ['install', '--no-audit', '--no-fund'], { cwd: appDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => { const t = String(d).trim(); if (t) logLine('  npm: ' + t.split(/\r?\n/).pop()); });
    p.stderr.on('data', (d) => { const t = String(d).trim(); if (t) logLine('  npm: ' + t.split(/\r?\n/).pop()); });
    const t = setTimeout(() => { try { p.kill(); } catch { /* noop */ } resolve(false); }, 900000);
    p.on('exit', (code) => { clearTimeout(t); resolve(code === 0); });
    p.on('error', () => { clearTimeout(t); resolve(false); });
  });
}

function moduleOk(appDir) {
  for (const mod of ['gifenc', 'jpeg-js', 'omggif', 'upng-js']) {
    if (!existsSync(path.join(appDir, 'node_modules', mod))) return false;
  }
  return true;
}

function botFileOk(appDir) { return existsSync(path.join(appDir, 'bot.js')) && existsSync(path.join(appDir, 'package.json')); }

async function provisionApp() {
  const health = { bot: botFileOk(APPS_DIR), deps: moduleOk(APPS_DIR) };
  if (health.bot && health.deps) { saveState({ ...loadState(), appDir: APPS_DIR }); return { ok: true, skipped: true }; }
  if (!health.bot) {
    logLine('Yo, app/ is missing bot.js - the app folder has to sit next to the exe.');
    return { ok: false };
  }
  logLine('Gettin the bot deps ready (npm install)...');
  const ok = await npmInstall(APPS_DIR);
  if (!ok || !moduleOk(APPS_DIR)) { logLine('Deps did not install clean - check your network.'); return { ok: false }; }
  saveState({ ...loadState(), appDir: APPS_DIR });
  logLine('App ready. Config and data live in: ' + USERDATA);
  return { ok: true, skipped: false };
}

function healApp() {
  if (!botFileOk(APPS_DIR)) return Promise.reject(new Error('app missing'));
  return npmInstall(APPS_DIR).then((ok) => {
    if (!ok || !moduleOk(APPS_DIR)) return Promise.reject(new Error('npm install failed'));
    return true;
  });
}

function askLine(q) {
  if (!process.stdin.isTTY) return '';
  const a = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => { a.question(q, (ans) => { a.close(); resolve(ans); }); });
}

function validateAgainstDiscord(token) {
  const exe = findNodeExe();
  return run(exe || 'node', ['-e', `fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bot ${token}'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(2))`], { timeout: 30000 }).status === 0;
}

async function promptConfig(cliArgs) {
  if (getConfig().token) return true;

  if (cliArgs && cliArgs.token) {
    const clientId = String(cliArgs.clientId || '').trim();
    if (!/^\d+$/.test(clientId)) { logLine('Client id given via CLI is not numeric - fix it and rerun.'); return false; }
    const ownerId = String(cliArgs.ownerId || '').trim();
    if (ownerId && !/^\d+$/.test(ownerId)) { logLine('Owner id given via CLI is not numeric - ignoring it.'); }
    logLine('Validating token against Discord...');
    if (!validateAgainstDiscord(cliArgs.token)) logLine('Warning: token check failed (network or invalid token). Saving anyway.');
    saveConfig({ token: String(cliArgs.token).trim(), clientId, ...(ownerId ? { ownerIds: ownerId } : {}) });
    logLine('Config saved to ' + CONFIG_PATH + (ownerId ? ' (owner: ' + ownerId + ')' : ''));
    return true;
  }

  if (!process.stdin.isTTY) { logLine('No config yet - drop your token into ' + CONFIG_PATH + ' and relaunch.'); return false; }

  logLine('');
  logLine('First run, we set this thing up. Real quick:');
  logLine('Make the app + bot at https://discord.com/developers/applications');
  logLine('');
  const token = (await askLine('1) Bot token (keep this private): ')).trim();
  if (!token) { logLine('No token - aborting setup.'); return false; }
  const clientId = (await askLine('2) Application ID (the numbers): ')).trim();
  if (!/^\d+$/.test(clientId)) {
    logLine('That Application ID should be digits only. Copy it from the General Information tab.');
    return false;
  }
  const ownerId = (await askLine('3) Your user ID (admin powers, optional - press Enter to skip): ')).trim();
  if (ownerId && !/^\d+$/.test(ownerId)) { logLine('User ID should be digits only - keeping config clean, skipping it.'); }
  logLine('Validating token against Discord...');
  if (!validateAgainstDiscord(token)) logLine('Warning: token check failed (network or invalid token). Saving anyway.');
  else logLine('Token checks out.');
  saveConfig({ token, clientId, ...(ownerId && /^\d+$/.test(ownerId) ? { ownerIds: ownerId } : {}) });
  logLine('Saved to ' + CONFIG_PATH + ' - it stays put across updates.');
  return true;
}

function writeControlPatch(patch) { saveControl(patch); }

function startBot() {
  if (botProc) return;
  const cfg = getConfig();
  if (!cfg.token) { setMenu('add token first'); return; }
  const exe = findNodeExe();
  if (!exe) { setMenu('node 22+ needed'); return; }
  if (!botFileOk(APPS_DIR)) { setMenu('app/ missing'); return; }

  manualStop = false;
  writeControlPatch({ stop: false, request: { restart: false, update: false }, presence: getControl().presence || 'online' });
  logLine('Firin up the bot...');
  botProc = spawn(exe, [path.join(APPS_DIR, 'bot.js')], { cwd: APPS_DIR, windowsHide: true, env: { ...process.env, CONVERT2GIF_USERDATA: USERDATA } });
  botState = 'starting';
  const startedAt = Date.now();
  botProc.stdout.on('data', (d) => onBotData(d));
  botProc.stderr.on('data', (d) => onBotData(d));
  botProc.on('exit', (code) => { botProc = null; botState = 'stopped'; onBotExit(code, startedAt); });
  setMenu('bot starting');
}

function onBotData(d) {
  for (const line of String(d).split(/\r?\n/)) { if (line.trim()) logLine('  ' + line.trim()); }
}

function readLastLines(n) {
  try { const all = readFileSync(ENGINE_LOG, 'utf8').split(/\r?\n/).filter(Boolean); return all.slice(-n).join('\n'); }
  catch { return ''; }
}

function onBotExit(code, startedAt) {
  const quickExit = Date.now() - startedAt < 12000;
  const moduleFail = /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find package|Cannot find module/i.test(readLastLines(80));
  const fatal = /HTTP 401|Invalid token|401 Unauthorized/i.test(readLastLines(40));
  if (fatal) { logLine('That token got no love - rejected by Discord. Fix ' + CONFIG_PATH + ' and press [R].'); return; }
  if (manualStop) { logLine('Bot stopped.'); return; }
  if (getControl().stop) { logLine('Bot stopped (control.json stop).'); return; }
  if (quickExit || moduleFail) {
    healCount++;
    if (healCount <= 2) {
      logLine('Bot stumbled out the gate - fixin the deps (' + healCount + '/2)...');
      healApp().then(() => { logLine('Deps fixed. Back on it...'); startBot(); })
        .catch((e) => { logLine('Repair came up short: ' + e.message); });
      return;
    }
    healCount = 0;
  }
  const now = Date.now();
  crashSessions = (now - lastCrash < 60000) ? crashSessions + 1 : 1;
  lastCrash = now;
  if (crashSessions > 5) { logLine('Bot keeps floppin. Press [X] to bring it back when you are ready.'); return; }
  logLine('Bot went down (code ' + code + '). Restarting in 2s...');
  setTimeout(() => startBot(), 2000);
}

function stopBot(killTimeout) {
  if (!botProc) { botState = 'stopped'; return; }
  manualStop = true;
  botState = 'stopping';
  logLine('Coolin it down - stopping bot...');
  writeControlPatch({ stop: true });
  const pid = botProc.pid;
  const deadline = Date.now() + (killTimeout || 6000);
  const poll = setInterval(() => {
    if (!botProc) { clearInterval(poll); botState = 'stopped'; writeControlPatch({ stop: false }); return; }
    if (Date.now() > deadline) {
      clearInterval(poll);
      run('taskkill', ['/PID', String(pid), '/F']);
      botState = 'stopped';
      writeControlPatch({ stop: false });
    }
  }, 400);
}

function restartBot() {
  if (!botProc) { startBot(); return; }
  const p = botProc;
  stopBot(6000);
  const poll = setInterval(() => { if (!botProc || botProc !== p) { clearInterval(poll); startBot(); } }, 300);
}

function presencesCycle() {
  const cur = getControl().presence || 'online';
  const next = PRESENCE_ORDER[(PRESENCE_ORDER.indexOf(cur) + 1) % PRESENCE_ORDER.length];
  writeControlPatch({ presence: next });
  logLine('Presence set to: ' + next + ' (control.json)');
}

async function checkUpdates() {
  const rel = await latestRelease();
  if (!rel) { setMenu('update check failed (network)'); return null; }
  if (isNewer(rel.tag, APP_VERSION)) { setMenu(rel.tag + ' is out!'); return rel; }
  setMenu('you on the newest already (' + rel.tag + ')');
  return null;
}

async function applyUpdate(fromBot) {
  if (busy) return;
  busy = true;
  try {
    const rel = await latestRelease();
    if (!rel) throw new Error('network');
    if (!isNewer(rel.tag, APP_VERSION)) { setMenu('already up to date'); logLine('No update needed (latest ' + rel.tag + ').'); return; }
    logLine('Grabbin the new goodz - updating to ' + rel.tag + '...');
    if (fromBot) stopBot(6000);

    if (rel.appZip) {
      logLine('Downloading the app package...');
      const zip = path.join(UPDATES_DIR, rel.appZip.name);
      await download(rel.appZip.url, zip, (p) => logLine('  ' + p + '%'));
      const tmp = APPS_DIR + '.tmp';
      rmSync(tmp, { recursive: true, force: true });
      mkdirSync(tmp, { recursive: true });
      if (!extractZip(zip, tmp)) throw new Error('app zip extract failed');
      if (!botFileOk(tmp)) throw new Error('app zip missing bot.js - update cancelled');
      logLine('Swapping the app files...');
      const bak = APPS_DIR + '.bak';
      rmSync(bak, { recursive: true, force: true });
      if (existsSync(APPS_DIR)) { try { renameSync(APPS_DIR, bak); } catch { copyDir(APPS_DIR, bak); } }
      try { renameSync(tmp, APPS_DIR); } catch { copyDir(tmp, APPS_DIR); rmSync(tmp, { recursive: true, force: true }); }
      logLine('Installing deps for the new app...');
      await npmInstall(APPS_DIR);
      rmSync(bak, { recursive: true, force: true });
    }

    if (rel.exe && rel.exe.url && !runningFromSource) {
      try {
        logLine('Downloading the new bootstrapper...');
        rmSync(NEXT_EXE + '.new', { force: true });
        await download(rel.exe.url, NEXT_EXE + '.new', (p) => logLine('  ' + p + '%'));
        const hdr = readFileSync(NEXT_EXE + '.new', 'latin1');
        if (hdr.length < 2 || hdr.charCodeAt(0) !== 0x4d || hdr.charCodeAt(1) !== 0x5a) throw new Error('not a valid exe - refusing');
        if (rel.exe.digest && sha256File(NEXT_EXE + '.new') !== rel.exe.digest) throw new Error('checksum mismatch');
        renameSync(NEXT_EXE + '.new', NEXT_EXE);
        setMenu('new exe downloaded - swapping');
        logLine('Launchin the new bootstrapper...');
        spawn(NEXT_EXE, ['--post-update=' + process.execPath], { detached: true, stdio: 'ignore', windowsHide: true });
        logLine('Old version stepping down.');
        setTimeout(() => process.exit(0), 1200);
        return;
      } catch (e) {
        logLine('Exe update came up short, app still updated: ' + e.message);
      }
    }

    logLine('Update done (' + rel.tag + ').');
    startBot();
  } catch (e) {
    logLine('Update failed: ' + e.message);
  } finally {
    busy = false;
  }
}

async function cleanupAfterUpdate(oldExe) {
  logLine('Tidyin up the old bootstrapper files...');
  for (let i = 0; i < 15; i++) {
    try { rmSync(oldExe, { force: true }); break; } catch { await sleep(400); }
  }
  const dest = path.join(EXE_DIR, EXE_ASSET);
  try {
    copyFileSync(NEXT_EXE, dest);
    logLine('Placed the new ' + EXE_ASSET + ' in ' + EXE_DIR);
    spawn(dest, [], { detached: true, stdio: 'ignore', windowsHide: true });
    setTimeout(() => process.exit(0), 800);
  } catch (e) {
    logLine('Could not replace the exe in place (' + e.message + '). Running from updates dir.');
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function drawHeader() {
  console.log('');
  console.log('  Convert2GIF Bootstrapper v' + APP_VERSION + '  -  the plug  |  ' + HOSTED_BY);
  console.log('  ------------------------------------------------------------------');
}

function showMenu() {
  if (!process.stdin.isTTY) return;
  console.log('');
  console.log('  [B] start bot    [X] stop bot    [R] restart bot');
  console.log('  [P] cycle presence            [C] check updates   [U] update');
  console.log('  [Q] quit');
}

function setupKeys() {
  if (!process.stdin.isTTY) { logLine('No live console here - drive it with data\\control.json (stop, presence, request.restart / request.update).'); return; }
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  process.stdin.setRawMode && process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    for (const ch of chunk) {
      const k = ch.toLowerCase();
      if (k === 'b') startBot();
      else if (k === 'x') stopBot(9000);
      else if (k === 'r') restartBot();
      else if (k === 'p') presencesCycle();
      else if (k === 'c') checkUpdates();
      else if (k === 'u') applyUpdate(false);
      else if (ch === '\u0003' || k === 'q') { logLine('Quitting.'); shutdown(); }
      else if (ch === 'h' || ch === '?') showMenu();
    }
  });
}

function shutdown() {
  try { if (botProc) { manualStop = true; writeControlPatch({ stop: true }); } } catch { /* noop */ }
  setTimeout(() => process.exit(0), 300);
}

// ---------------------------------------------------------------------------
// control.json watcher (engine side)
// ---------------------------------------------------------------------------
let lastStopSeen = 0;
function startControlWatcher() {
  setInterval(() => {
    const c = getControl();
    const req = c.request || {};
    if (req.restart && !busy) {
      writeControlPatch({ request: { restart: false, update: false } });
      logLine('restart requested (Discord /restart)');
      restartBot();
    } else if (req.update && !busy) {
      writeControlPatch({ request: { restart: false, update: false } });
      logLine('update requested (Discord /update)');
      applyUpdate(true);
    }
    if (c.stop && botProc && !lastStopSeen) {
      lastStopSeen = Date.now();
      logLine('stop requested via control.json - waiting for bot to exit...');
      const pid = botProc.pid;
      const poll = setInterval(() => {
        if (!botProc) { clearInterval(poll); lastStopSeen = 0; writeControlPatch({ stop: false }); return; }
        if (Date.now() - lastStopSeen > 9000) {
          clearInterval(poll);
          run('taskkill', ['/PID', String(pid), '/F']);
          lastStopSeen = 0;
          writeControlPatch({ stop: false });
        }
      }, 400);
    }
  }, 2000);
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
async function boot() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = String(a).match(/^--post-update=(.+)$/);
    if (m) args.postUpdate = m[1].trim();
    const k = String(a).match(/^--token=(.+)$/);
    if (k) args.token = k[1].trim();
    const ci = String(a).match(/^--client-id=(.+)$/);
    if (ci) args.clientId = ci[1].trim();
    const oi = String(a).match(/^--owner-id=(.+)$/);
    if (oi) args.ownerId = oi[1].trim();
  }

  ensureDirs();
  writeJson(CONTROL_PATH, getControl());
  drawHeader();
  logLine('Engine v' + APP_VERSION + ' - ' + HOSTED_BY);
  logLine('Portable base: ' + baseDir);
  logLine('Data: ' + USERDATA);

  const node = ensureNode();
  if (!node.ok) { logLine('Need Node.js 22+ to run this. Exiting.'); setTimeout(() => process.exit(1), 800); return; }
  logLine('Node: ' + node.exe + ' (v' + nodeVersion(node.exe) + ')');

  if (args.postUpdate) postUpdateOld = args.postUpdate;

  const cfgOk = await promptConfig(args);
  const prov = await provisionApp();
  if (cfgOk && prov.ok) startBot();
  else logLine('Still on the to-do list: ' + [(cfgOk ? '' : 'config'), (prov.ok ? '' : 'deps')].filter(Boolean).join(' + ') + ' - check the messages above.');

  startControlWatcher();
  setupKeys();
  showMenu();

  if (postUpdateOld) setTimeout(() => cleanupAfterUpdate(postUpdateOld), 1200);
  else setTimeout(() => { rmSync(NEXT_EXE, { force: true }); }, 2000);
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

boot().catch((e) => { logLine('FATAL: ' + (e && e.stack || e)); setTimeout(() => process.exit(1), 500); });